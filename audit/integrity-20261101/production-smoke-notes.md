# Production smoke: first release attempt

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
