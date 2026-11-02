# Production smoke and follow-up validation

## Second Worker release: public routes pass; pregame compatibility issue found

Worker `07b15395-b632-4db0-82e0-368f8ac635e2` served the expected model and notification version. The public smoke executed at approximately 04:33:55 UTC: **13 requests passed**, covering health, feed, configuration, and ten representative game details. Feed `updatedAt=2026-11-02T04:33:26.700Z` was current-model and fresh at age 28,764 ms. All 527 games and sampled details had model `2026-11-01.audit-integrity.3`; sampled ratings/teams matched their canonical publication. No internal provider revision/fingerprint caches leaked. Health retained the expected four alert-delivery safeguards and `notificationVersion=2026-11-01.canonical-revalidation.1`.

| Sport | Live | Upcoming | Completed | Total |
| --- | ---: | ---: | ---: | ---: |
| NFL | 0 | 16 | 27 | 43 |
| MLB | 0 | 0 | 1 | 1 |
| NHL | 0 | 51 | 15 | 66 |
| CFB | 0 | 0 | 115 | 115 |
| NBA | 1 | 54 | 10 | 65 |
| NCAAB | 0 | 1 | 1 | 2 |
| Soccer | 0 | 9 | 1 | 10 |
| Tennis | 0 | 82 | 143 | 225 |

Every Tennis game reported scoreboard coverage with unverified point-by-point/history fields. All 143 completed Tennis matches had `scoringPartial=true`; their sample detail had no fabricated historical observations. The sole live NBA game was provider-reported "End of 4th", 125–131, rating 11, with complete evidence. It met the data-quality eligibility predicate; this says nothing about crossing a subscriber's threshold or actual delivery. All ratings were within 0–100, and no partial/invalid game was alert-eligible.

The feed was degraded because 88 upcoming rows remained pending: 47 NHL and 41 NBA. Follow-up GET diagnosis at 04:34:57 UTC confirmed an overly strict pregame comparison. Three representative future games (`NHL:401892633`, `NHL:401892679`, `NBA:401909951`) had matching `pre` lifecycle and team IDs, but provider summaries omitted scores while provider scoreboards supplied string zero placeholders. The exact-string score comparison rejected this harmless pregame difference. The follow-up feed had 89 pending rows because the NBA game had just become final; its sampled provider summary and scoreboard now agreed at 125–131, unlike the persistent future-game mismatch.

The initial first-release artifact is preserved as `first-release-production-smoke.json`. Current route results are in `production-smoke.json`; the pending classification and raw-field-presence samples are in `production-pending-smoke.json`. Exact follow-up command:

```powershell
node audit/integrity-20261101/production-pending-smoke.mjs
```

The pending diagnosis used public Worker GET detail/feed and ESPN GET summary/scoreboard routes. `/feed` and detail routes can perform their ordinary background/cache work. No explicit refresh/check-games or notification route was called.

The implementation agent made a narrow compatibility change: only when both resources are pregame and team identities match, missing/null/blank scores can agree with zero placeholders. Played-game comparisons remain strict. Independently added regressions in `audit-migration-pregame.test.js` failed **4/8 before** the change and passed **8/8 afterward**. They verify NHL/NBA omitted and null scores, reject pregame nonzero/boolean contradictions and missing completed scores, and assert that persisted provider evidence and published zero placeholders are unchanged. Logs: `migration-pregame-before.log` and `migration-pregame-after.log`.

The coordinator's final review additionally required played scores to be present, finite numeric values on both resources; equal missing/null/blank/boolean/nonnumeric fields must not certify a completed result. The implementation agent added seven regressions for that boundary (five failed before the adjustment; numeric-zero controls already passed). This reviewer independently reran both guard suites against the final predicate: **15/15 passed**, recorded in `migration-score-guard-independent.log`.

```powershell
node --no-warnings --test alerts-worker/test/audit-migration-pregame.test.js
```

These targeted results cover the new compatibility guard and its callers. They do not substitute an older Worker fingerprint for the updated source; the coordinator owns full-suite validation, release provenance, deployment, and follow-up production verification of this final adjustment. The route smoke alone does not certify that the persistent pending-row issue was already resolved in production.

## First release attempt and rollback

**Failed release gate after repeated deadlines; later publication confirmed.** The public Worker health changed to `2026-11-01.audit-integrity.3`, while each captured public feed response through approximately 04:10:08 UTC still contained `2026-11-01.production-integrity.2` with `updatedAt=2026-11-02T04:05:39.012Z`. The final such response had an age of 269,782 ms and correctly reported `freshness.stale=true`. Rollback was initiated after repeated 25-second refresh deadlines, rather than because publication was proven permanently impossible.

The later-reviewed sanitized tail in `failed-release-observation.json` proves that the candidate subsequently published before rollback. A refresh starting at 04:10:00.794 UTC completed publication 22,817 ms later (approximately **04:10:23.611 UTC**) with 259 critical candidates, 162 provider requests, and 24,323 ms total runtime. The next refresh started at **04:10:28.017 UTC**, published in 4,335 ms, reused 257 games, and completed successfully. This smoke did not retrieve and validate representative candidate details from either publication. The release coordinator verified restored baseline health and a fresh `.2` feed at approximately **04:13 UTC**, and confirmed that the rollback Pages workflow succeeded.

`production-smoke.json` preserves the public responses and successive observations. The public GET-only reproduction command was:

```powershell
node audit/integrity-20261101/production-smoke.mjs
```

The script stopped before detail/config verification whenever the feed model differed from health. Only public GET `/health` and `/feed` routes were requested. **Normal GET `/feed` can start the application's existing background refresh**, and the sanitized tail includes both feed-triggered and cron-triggered refreshes. No explicit refresh/check-games, subscription, or notification route was called; no artificial event or manual notification trigger was issued. Normal production background work was not disabled or asserted to be absent. Network access used approved execution for public reads; no UI tools were used.

Health returned `ok=true`, the expected scoring policy, and `notificationVersion=2026-11-01.canonical-revalidation.1`. The alert safeguards reported canonical revalidation, atomic claim, a 120,000 ms queue limit, and `ambiguousRetry=false`. Both public routes returned HTTP 200, `Cache-Control:no-store`, and the allowed Pages CORS origin. The old feed contained 302 games and no Tennis matches; those values describe the prior publication, not successful candidate ingestion. Representative detail consistency and candidate per-sport/evidence counts therefore remain unverified in production.

The first two additional manual feed checks observed the same prior publication at ages 76,813 ms and 103,702 ms. It was already marked stale because its model differed from the deployed runtime. Subsequent scripted checks are retained in the compact JSON. A temporary full feed dump was removed after extracting the compact evidence.

## Deadline investigation control

The current candidate excludes Tennis from summary candidates before computing `criticalCandidates`. The reported 259 critical entries are therefore **non-Tennis** model-invalidated enrichments; the 225 Tennis matches add bounded collection and persistence work, not 225 summary requests. Model mismatch rejects reuse, so the current loop recomputes every critical non-Tennis game before its first canonical publication. A deadline loses that unpublished computation.

Added a diagnostic control to `alerts-worker/test/audit-tennis-collection.test.js` using the entire preserved 225-match ATP capture, an old-model feed, mocked providers, and in-memory SQLite. Every mock provider call and D1 round trip consumes a conservative simulated 100 ms, including calls that execute concurrently. This is a deterministic budget control, not a Cloudflare performance measurement.

```powershell
node --no-warnings --test --test-name-pattern='first model-transition' alerts-worker/test/audit-tennis-collection.test.js > audit/integrity-20261101/tennis-migration-control.log 2>&1
```

Result: **1/1 passed**. Current-model publication contains all 225 matches, 143 completed matches with explicit partial coverage, and 82 upcoming matches. It performs zero summary requests and has zero summary/critical candidates. Only the 82 schedule observations enter snapshots, in batches of 50 and 32; partial Tennis finals are not promoted to complete historical evidence. Five feed parts are persisted. Publication uses 4,600 simulated ms under the unchanged 25,000 ms deadline. No production source change was made for this control.

The full mixed-sport model-transition scheduling fix and its before/after regression are owned by the release coordinator and snapshot-evidence agent. A new publication attempt must rerun public feed/detail verification after a current-model canonical feed is available.
