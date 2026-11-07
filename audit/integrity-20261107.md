# Terminal integrity investigation — release blocked

The candidate is **not approved for release**. A passing isolated test, retry, or focused suite does not clear a failed full-suite gate. No push, Worker deployment, Pages deployment, production data modification, test notification, or bot post was performed.

Candidate source commit: `427df34f70b7f967cc4e5aa4db0bee111fdb14b9`, local branch `fix/terminal-integrity-release-gates`. The validation runs below used these source bytes before the local commit was created; their checkout HEAD was the baseline commit. This report and its validation ledger are a subsequent documentation-only commit. Local build version labels therefore identify the baseline, not a published candidate. The original dirty working tree was preserved; work is in `work/integrity-release-20261107`.

## Baseline verification

GitHub main was `6f39b7d53e0958aab6676d2960b795936f2a6dea` at both checks. Its only change after `cf58d9f` is the social-bot configuration, which this patch does not change. All four intervening hotfix commits were inspected: `0a45e9468069caeec00867fd0b3f235afb840801`, `b85536e9c648e6e3b0fcd1c7ae60a40e2eb7b95f`, `36fc8d2e179ca363ab4847555f83a21cca972401`, and `cf58d9fc71eb30fa0745f455891d3f277725b56e`.

The deployed alerts Worker source map was downloaded read-only before editing. All 85 mapped sources matched main after LF normalization, including dependencies. The saved deployed bundle SHA-256 is `6caf145d8b579b865da758f64dd8009e7592d4bfbec5538d44617780c2e42793`. Evidence: [source comparison](../work/baseline-source-comparison.json), [saved bundle](../work/baseline-deployed/index.js). This verifies source content; it does not claim byte-identical builds across environments.

| Production destination | Existing deployment ID, unchanged at final check | Existing active version |
| --- | --- | --- |
| `sports-radar-alerts` | `52661676-6208-4f43-a4a8-dd493a13393e` | `06338921-4f22-4714-8f5f-762f87720d2e` at 100% |
| `slatemeter-live-audit` | `9d4449d1-c42d-4b8d-aab4-61518ce7b46a` | `8e0dab72-2d19-42d5-9a3c-f53e29ce2059` at 100% |

No candidate Cloudflare deployment ID exists. GitHub Pages publication was not attempted. Main remained unchanged, and its push-triggered Pages workflow was not triggered by this work. Independent post-deployment endpoint, public asset, six-sport loading, and live notification verification was not performed because there was no deployment. Existing Worker deployment IDs were independently re-read through the Cloudflare API: [final check](../work/production-deployment-check.json).

## Confirmed defects and corrections

| Defect | Before | Candidate behavior and evidence |
| --- | --- | --- |
| 1. Initial NFL/NHL false ending | The special first-observation check was CFB-only. NFL Q4 and NHL P3 zero clocks with an earlier-period last play could pass without prior state. | The regulation final-period check covers NFL, CFB, and NHL. An earlier-period last play rejects the purported live ending. Display text alone cannot prove completion. Current-period zero-clock play evidence with matching scores remains usable; genuine completed states, overtime, and existing intermission/manpower logic are preserved. Tests mutate recorded NFL/NHL provider fixtures to create the reported adversarial cases; these are reproductions, not claims that those games actually had this incident. |
| 2. Recovery from false Q4 zero | Recovery required a synchronized summary, ordered numeric ID, no score decrease, and no deferred-evidence flag. Missing/lagging evidence was effectively treated as contradiction. | Recovery can use ordered scoreboard progression or an explicit current-period play without a synchronized summary. Matching live summary clock/scores can corroborate absent/formatted IDs and score corrections. A known stale false-zero summary does not veto progression. Actual final/ahead summary evidence, older numeric IDs, unsupported score decreases, superseded inputs, and older revisions remain rejected. No timeout-based acceptance was added. Repeated uncertainty retains the last trusted rating, or null if none exists. |
| 3. False UI labels | Search metadata, card accessibility text, and mobile player captions read raw phase strings despite `timingUncertain`. | Those three reads use the existing `Clock updating` label during uncertainty. Ordinary labels are unchanged. DOM/HTML tests cover search, cards, accessible text, Game Center, and mobile captions. Visual browser verification is blocked, as described below. |
| 4. Sparse CFB history | A Q3-to-Q4 retained-row transition could invalidate a real Q4 zero solely because Q4 coverage was missing. | CFB uses the row's retained earlier-period last-play evidence. Missing intermediate observations alone no longer invalidate a row. The NBA/NCAAB adjacency classifier is unchanged in behavior. The actual six false rows remain invalid; all three real zero-clock rows remain valid. |
| 6. Historical provenance | Audit exports projected away the last-play evidence and could present the six stored false rows without Game Center's invalidity markers. | History and audit export share the same read-time classifier. Export SQL projection retains last-play period/text. Compact and retained snapshot outputs carry invalid timing provenance, retaining original ratings and source references. End-to-end SQLite export tests confirm all 148 records remain stored and export operations are reads. |

Defect 5 remains an **unproven production risk**, not a confirmed provider incident in the available evidence. Code inspection confirms that already-completed normalized games bypass the live reconciliation path. No retained premature-completed provider response was found for USF–ECU; the available final cached summary is a genuine post/completed response. The hypothetical bypass alone does not justify rewriting completed-game lifecycle behavior under the requested scope. No lifecycle patch was made. The new live recovery check does reject a contradictory completed *summary* while the scoreboard game remains live.

## Exact implementation scope

Production changes are limited to:

- [`scoring/snapshot-integrity.cjs`](../scoring/snapshot-integrity.cjs): `playPeriod` and `reconcileObservation` — initial ending evidence and recovery from an unconfirmed final-period zero.
- [`alerts-worker/src/snapshot-provenance.js`](../alerts-worker/src/snapshot-provenance.js): new `snapshotTimingIssue` — read-time CFB classification using retained last-play period evidence.
- [`alerts-worker/src/snapshot-history.js`](../alerts-worker/src/snapshot-history.js): `gameHistory` — apply that classifier and remove only CFB from adjacency-based invalidation.
- [`app.js`](../app.js): `globalSearchGameMeta`, `gameCard`, and `detailPlayerBrowser` — three phase-label expressions.
- [`live-audit-worker/src/export.js`](../live-audit-worker/src/export.js): `stateProjection`, `compactSnapshot`, and `retainedObservation` — preserve evidence and label invalid historical observations.

Regression/policy changes: `AGENTS.md`; `alerts-worker/test/game-history.test.js`; `alerts-worker/test/near-start-refresh.test.js`; `live-audit-worker/test/terminal-provenance.test.js`; `test/live-phase.test.js`; `test/mobile-reference.test.js`; `test/nba-transition-integrity.test.js`; new `test/terminal-integrity.test.js`; and the 148-row `test/fixtures/usf-ecu-20261106.json.gz` capture. Documentation consists of this report and `integrity-20261107-validation.json`.

No formulas, calibration, sport weights, pregame ratings, momentum calculations, notification thresholds, provider/AI request limits, polling schedules, schemas, soccer behavior, social-bot files, CSS/layout, or historical production records were changed. The snapshot persistence implementation is unchanged. The complete diff was reviewed and `git diff --check` passed.

## The near-start full-suite failure is a real persistence collision

The untouched baseline full alerts suite first passed 436/436, then failed 435/436. A diagnostic full run also failed 435/436. The difference is explained by wall-clock alignment, not by an isolated pass or a demonstrated thread race.

`sports-feed.js` writes upcoming snapshots into 60-second buckets and live snapshots into 15-second buckets, using `INSERT OR IGNORE` and a `(game_key, observed_at)` key. If the test starts exactly on a minute boundary:

1. The upcoming snapshot occupies timestamp `T`.
2. The first live refresh at `T + 10 seconds` also buckets to `T` and is ignored.
3. The next live refresh at `T + 22 seconds` stores at `T + 15 seconds`.
4. There is one persisted live row where the existing assertion correctly expects two.

The final reproduction logged `T = 1794031080000`, with an upcoming row at `1794031080000` and only one live row at `1794031095000`. The feed itself progressed to live; persistence lost the first live observation. The original 15-second alignment encounters this boundary intermittently. The regression now deliberately aligns to a minute and preserves the expected-two assertion. Both final full-suite runs fail identically, 435 passes / 1 failure.

Evidence: [original diagnostic](../work/near-start-failure.json), [final full run 1](../work/final-alerts-1.log), [final full run 2](../work/final-alerts-2.log). No isolated pass was used to waive this gate. A separate persistence-policy correction is required; silently overwriting the upcoming row, changing historical keys, weakening the assertion, or altering polling was not included in this narrowly scoped repair.

## Actual production data replay and the missing interval

Read-only D1 queries retrieved 148 stored `CFB:401862818` snapshots and 23 audit observations around the incident. Production queries performed no writes. The snapshot fixture preserves the stored rows, including their ratings and normalized state; the original records were not repaired or recalculated.

- Six false live Q4 `0:00` rows at November 7 UTC 03:03:15, 03:03:30, 03:03:45, 03:04:00, 03:04:15, and 03:04:30 all have rating 24 and last play `401862818584`, "End of 3rd quarter." They are invalid in both history and export.
- Positive-clock recovery rows at 03:55:15, 03:55:45, and 03:56:15 have Q4 `0:02`, 17–17, ratings 71/72/72, and last play `401862818795`. Stored summary headers still lag. The boundary replay accepts their progression despite the stale header.
- Genuine live Q4 zero rows at 03:56:45, 03:57:15, and 03:58:00 have 17–20, ratings 40/43/48, and the current-period field-goal play `401862818802`. All remain valid.

The sequential boundary replay runs through all six rejections, recovery, and all three legitimate endings. History/export tests examine all 148 rows. A separate comparison of 107 recorded provider fixtures against untouched main found **107 equal / 0 differences** in score, base score, factors, manpower, rejection, and uncertainty outputs: CFB 50, NFL 25, NHL 25, NBA 3, NCAAB 2, MLB 2. This is captured-fixture parity, not proof of every future provider combination. Evidence: [comparison results](../work/captured-baseline-comparison.json), [comparison script](../work/compare-captured.mjs).

The 22:04:30–22:55:15 Eastern gap corresponds to UTC 03:04:30–03:55:15 on November 7. Audit samples from 03:06:56 through 03:54:55 repeatedly contain the game, with a fresh canonical feed timestamp, `liveUpdateRejected=true`, `scoringPartial=true`, `summary-unavailable`, and invalid retained evidence. They report no active/inactive/unknown source errors. Their summary references have fresh cache timestamps.

`shouldSnapshot` explicitly excludes `liveUpdateRejected` games. Thus the sampled evidence supports **integrity rejection suppressing snapshots**, rather than the game simply disappearing from the sampled canonical feed. It does not show D1 insert failures. The raw rejected provider candidates and each prior cache version were not retained, and audit coverage is not continuous (including a 03:30–03:45 sampling gap). Therefore the upstream cause of every missing refresh cannot be reconstructed; fresh cache metadata alone does not prove fresh provider content. No ingestion patch, backfill, or invented observation was added. Other retained-history gaps were also present and left untouched.

Evidence: [original D1 rows](../work/usf-ecu-production-rows.json), [audit observations](../work/usf-ecu-audit-observations.json).

## Validation and remaining release gates

Node version: 22.17.1. Wrangler: 4.151.3 from the repository lockfile. Test concurrency was left at Node's default. Root tests were bounded at 120 seconds per test file to report a stuck gate rather than wait indefinitely. No skipped tests or serialization were used to obtain passing results.

| Final check | Pass | Fail | Cancelled | Result |
| --- | ---: | ---: | ---: | --- |
| Untouched baseline root scoring/UI suite | 1,672 | 10 | 1 | Blocked |
| Candidate root scoring/UI suite | 1,684 | 10 | 1 | Blocked; same failing test names as baseline |
| Candidate complete alerts Worker, run 1 | 435 | 1 | 0 | Blocked: near-start persistence |
| Candidate complete alerts Worker, run 2 | 435 | 1 | 0 | Same blocker |
| Candidate complete audit Worker | 156 | 0 | 0 | Passed |
| Focused integrity/search/card/mobile tests | 67 | 0 | 0 | Passed; does not clear full-suite gates |
| Captured baseline comparison | 107 equal | 0 differences | — | Passed |
| Alerts and audit Worker dry runs | — | — | — | Both compiled, no deployment |
| Browser visual desktop/mobile verification | — | — | — | Blocked: browser host unavailable; native fallback failed |

The final root failures, present on both untouched source and candidate, are:

- Six `history-interpolation.test.js` assertions: future corroboration with wrong game, old timestamp, ahead clock, decreased score, wrong model, or unconfirmed clock still allows an edge. The relevant `game-center.js` implementation is unchanged. These remain genuine unresolved history gates.
- One `nhl-advanced.test.js` historical raw-byte hash mismatch. The fixture/test is unchanged; its provenance discrepancy remains unresolved.
- `replay-input-comparison.test.js` fails loading `calibration/trajectory-current-checkpoint-manifest.json` from pinned commit `1bf1c66703a097c97fcde55b4c7af13055c3c593`; Git reports that path is absent in that commit.
- `trajectory-checkpoint.test.js` and `trajectory-review-correction.test.js` each fail exact generated-artifact comparisons, including LF/CRLF differences. Neither artifact nor generator was altered by this patch.
- `fixture-provenance.test.js` reaches the 120-second timeout and is reported cancelled. Its cause is not established; it is not waived.

The browser automation host reported no accessible browser. Edge creation timed out, and native Chrome could not be restored from its minimized window; launch fallback also timed out. No successful screenshot/layout inspection occurred. The temporary local preview server was stopped. DOM test coverage is not recorded as visual browser approval.

The full alerts suite includes existing threshold-crossing, notification cancellation/deduplication, refresh cadence, history, and request-budget checks. Its only final failure is near-start persistence. Existing root tests exercise genuine endings, overtime/shootout behavior, NHL delayed penalties/goalie pulls/manpower, and all enabled sports; the provenance and history failures above prevent an overall pass. The three separate root `.test.mjs` social-bot/hashtag suites were outside this repair and were not run. No live user notification or bot post was used for validation.

### Reproduction commands

From the candidate or the untouched baseline checkout:

```powershell
npm ci --prefix alerts-worker
node scripts/build-site.mjs
node --test --test-timeout=120000 --test-reporter=tap test/*.test.js test/*.test.cjs
node --test test/terminal-integrity.test.js test/nba-transition-integrity.test.js test/live-phase.test.js test/mobile-reference.test.js
node work/compare-captured.mjs
```

From each Worker directory, the full suite command is `node --test --test-reporter=tap test/*.test.js` (equivalent test glob to its npm test script). It was repeated for alerts. Dry-run commands, with `WRANGLER_SEND_METRICS=false`, were:

```powershell
# alerts-worker/
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir ../work/final-alerts-bundle
# live-audit-worker/
node ../alerts-worker/node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir ../work/final-audit-bundle
```

Sandboxed builds initially failed because esbuild could not read an ancestor directory and Wrangler could not write its log directory. The same local builds succeeded with approved filesystem access. Final dry runs produced 916.26 KiB / gzip 214.76 KiB for alerts and 277.40 KiB / gzip 76.98 KiB for audit. They exited with `--dry-run: exiting now.` An early audit test failed solely because the browser bundle had not yet been generated; after building, the complete baseline audit suite passed 155/155.

The final baseline root run used the same checked-out source bytes and dependency junction as the candidate, with baseline modifications restored. Process-scoped Git `safe.directory` was set only to that known local clone to eliminate ownership errors in tests invoking Git; no global Git setting was changed. Earlier root runs had dependency-access, line-ending checkout, or ownership differences and are retained below for transparency. They are not substituted for the final matched comparison.

### Complete test-run ledger

All retained TAP logs, including failed development iterations and environment failures, are listed in [the validation ledger](integrity-20261107-validation.json), with exact reported totals, pass/fail/cancelled counts, failure names, and SHA-256 hashes of the local logs in `work/`. `hasTapSummary` means a TAP summary exists, not that the gate passed. The initial unbuilt `baseline-root.log` run was interrupted during diagnosis; its reported counts do not certify complete execution. The earlier `baseline-root-built.log` overlapped candidate editing and is not the authoritative baseline. The authoritative comparisons are `final-baseline-root.log` and `final-root.log`.

| Log | Reported total | Pass | Fail | Cancelled |
| --- | ---: | ---: | ---: | ---: |
| [baseline-alerts-1.log](../work/baseline-alerts-1.log) | 436 | 436 | 0 | 0 |
| [baseline-alerts-2.log](../work/baseline-alerts-2.log) | 436 | 435 | 1 | 0 |
| [baseline-alerts-diagnostic.log](../work/baseline-alerts-diagnostic.log) | 436 | 435 | 1 | 0 |
| [baseline-audit-built.log](../work/baseline-audit-built.log) | 155 | 155 | 0 | 0 |
| [baseline-audit.log](../work/baseline-audit.log) | 155 | 154 | 1 | 0 |
| [baseline-confirmation-root.log](../work/baseline-confirmation-root.log) | 1608 | 1589 | 19 | 0 |
| [baseline-final-root.log](../work/baseline-final-root.log) | 1668 | 1659 | 9 | 0 |
| [baseline-matched-root.log](../work/baseline-matched-root.log) | 1664 | 1651 | 12 | 1 |
| [baseline-root-built.log](../work/baseline-root-built.log) | 1683 | 1672 | 10 | 1 |
| [baseline-root.log](../work/baseline-root.log) | 1596 | 1556 | 40 | 0 |
| [candidate-alerts-1.log](../work/candidate-alerts-1.log) | 436 | 435 | 1 | 0 |
| [candidate-alerts-2.log](../work/candidate-alerts-2.log) | 436 | 435 | 1 | 0 |
| [candidate-audit-1.log](../work/candidate-audit-1.log) | 155 | 155 | 0 | 0 |
| [candidate-audit-final.log](../work/candidate-audit-final.log) | 156 | 156 | 0 | 0 |
| [candidate-final-root.log](../work/candidate-final-root.log) | 1694 | 1683 | 10 | 1 |
| [candidate-root.log](../work/candidate-root.log) | 1615 | 1592 | 22 | 1 |
| [final-alerts-1.log](../work/final-alerts-1.log) | 436 | 435 | 1 | 0 |
| [final-alerts-2.log](../work/final-alerts-2.log) | 436 | 435 | 1 | 0 |
| [final-audit.log](../work/final-audit.log) | 156 | 156 | 0 | 0 |
| [final-baseline-root.log](../work/final-baseline-root.log) | 1683 | 1672 | 10 | 1 |
| [final-root.log](../work/final-root.log) | 1695 | 1684 | 10 | 1 |
| [focused-final.log](../work/focused-final.log) | 67 | 67 | 0 | 0 |
| [focused-integrity-1.log](../work/focused-integrity-1.log) | 33 | 31 | 2 | 0 |
| [focused-integrity-2.log](../work/focused-integrity-2.log) | 42 | 42 | 0 | 0 |
| [focused-integrity-3.log](../work/focused-integrity-3.log) | 66 | 65 | 1 | 0 |
| [focused-integrity-4.log](../work/focused-integrity-4.log) | 66 | 66 | 0 | 0 |

## Release disposition

Release remains blocked by the deterministic snapshot-loss failure, the root-suite failures/timeout, and unavailable visual QA. The successful focused tests, recorded-game parity, audit suite, and dry runs do not override those gates. `AGENTS.md` now persists that rule for this checkout.

No rollback was needed because production was not changed. Before any later authorized publication, rerun the complete gates against the final source, reverify main and active Worker versions, and prepare a rollback limited to that release. The existing Worker version IDs above are the observed rollback anchors, not authorization to alter production now. Do not reset main or roll back the unrelated social-bot change. No release-ready or independently verified production-fix claim is made.
