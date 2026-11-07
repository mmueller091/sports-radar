# Integrity continuation: release blocked at production preflight

Source: `b47e47e6548e0c89cefc135c0179844c9bcfdf2c`, continuing preserved candidate `427df34f70b7f967cc4e5aa4db0bee111fdb14b9`. The original dirty repository and unrelated work remain untouched. This isolated clone contains the continuation. The original [investigation](integrity-20261107.md) and [failed-run ledger](integrity-20261107-validation.json) remain historical evidence; this report does not replace their failures with isolated reruns.

All required source, regression, replay, build and browser gates pass against the final source bytes. **The release remains blocked:** production D1 returned an unexplained internal storage error during the cutover preflight. Both Worker versions were uploaded without activation. No production schema migration, Worker activation, Git push or site publication occurred. See the [continuation ledger](integrity-continuation-20261107-validation.json) for commands, counts, log hashes, source identity and browser artifacts. Passing counts below do not clear the failed production gate.

The [portable evidence manifest](integrity-continuation-20261107/manifest.json) maps 56 retained logs, screenshots, source hashes and diagnostic reports to their original local paths. TAP logs are losslessly compressed. A directory-local attributes rule preserves evidence bytes on Windows and Unix. The private production SQL backup is excluded.

## Corrections and causes

**Snapshot collision.** The old `(game_key, observed_at)` key cannot retain an upcoming minute bucket and a first live 15-second bucket when both legitimately equal T. The user explicitly authorized [Option 1](snapshot-key-proposal-20261107.md): uniqueness becomes `(game_key, observed_at, state)`. The migration preserves all eleven fields, timestamps and rowids, checks exact typed equality before replacing the table, and recreates the existing indexes. No timestamp was shifted, upcoming row overwritten, history deleted, poll deferred or insertion failure hidden. The writer now ignores only the intended three-column uniqueness conflict; other insertion errors fail the snapshot/publication stage visibly.

Every active snapshot consumer was reviewed. Upcoming/completed outer joins now constrain state. Chronological ties sort upcoming, live, completed; latest-row queries reverse that order. NFL record recovery accepts pre-final lifecycle states at the same final timestamp and keeps the strict previous-feed cutoff when no final exists. Retention keeps its age rules, 250-row cap, audit holds and latest-final protection. Audit export uses time/state cursors, state-bearing IDs/references, full-identity detail lookup and deterministic sampling. Its row/byte/query budgets are unchanged. The offline replay and real-SQLite fixtures use the same key. The proposal contains the consumer inventory.

Tests retain the original minute-boundary expected-two-live-rows assertion. They cover offsets 0, 5,000, 14,999, 15,000, 30,000 and 45,000 milliseconds; repeated refreshes, retries, concurrent attempts, subsequent 15-second live buckets, upcoming/live/completed ties, baseline and completed recovery, retention, an explicit insertion failure/retry, a 200-row pagination boundary and 2,100-row sampled export. No expected history assertion was weakened.

**Six interpolation defects.** The chart transition check let an endpoint bypass nearby corroborating evidence. It now requires the existing phase corroboration when a nearby follow-up exists. Wrong-game, stale, ahead-clock, decreased-score, wrong-model and unconfirmed-clock evidence cannot authorize that edge or be skipped to a later convenient witness. A verified endpoint with missing or distant follow-up can still connect legitimate gaps. The original six negatives remain, with positive and negative cases across five sports. Ratings and timeline observations are not fabricated or recalculated.

**Validation environment.** Windows `core.autocrlf=true` changed exact-byte fixtures/artifacts on checkout. The original Git blobs, recorded hashes and pinned commits were correct. Targeted `.gitattributes` rules preserve their original bytes: LF where originally LF, `-text` for the three originally CRLF artifacts. No expected artifact was regenerated; no fixture, reference hash, generator, expected-output blob or pinned commit changed. All eight NHL raw files again match their recorded hashes. Exact generated comparisons pass.

The isolated clone lacked Git object `1bf1c66703a097c97fcde55b4c7af13055c3c593`. Its checkpoint manifest exists in the original repository and on GitHub. Fetching that exact object resolves the misleading missing-path error without changing the pin. A checkout running these history-dependent tests must retain/fetch that object.

The provenance generator itself takes about 300 ms. A controlled diagnostic kept parsed JSON equal, converted only an in-memory expected buffer to CRLF, and reproduced the original large-Buffer assertion stalling while formatting its failure. Original Git bytes pass the original assertion. The diagnostic child was deliberately stopped after 10 seconds; the real suite's existing 120-second limit was not increased. The complete root suite subsequently passed at normal concurrency.

## Production backup and complete migration rehearsal

The read-only production export was downloaded at `2026-11-07T06:17:44.550Z`, bookmark `0000007e-0000c83f-0000511c-00491d644721415dfbcd2e8ef00f1663`. Local private backup: `work/production-backup/backup.sql`, 2,704,340,809 bytes, SHA-256 `701ea6428d1335a08c71c35bb7c67fcf4dd2e691c756eea94bea2402364c4703`. It is intentionally excluded from Git because it includes subscription data. Signed download URLs are excluded from retained metadata.

The full export restored successfully: 18 tables and 401,099 snapshots (663 upcoming, 149,645 live, 250,791 completed). The exact migration passed on a database copy, and again through Wrangler's actual local D1 batch runtime seeded with that complete copy. Every original table's ordered typed-row fingerprint matched before/after; snapshot count, fields and rowids in the restored copy were unchanged. SQLite integrity and foreign-key checks passed. Export restoration can assign rowids; the claim is preservation by migration within the restored copy, not that export preserved production physical rowids.

The local D1 run's longest statement took 24.283 seconds. Cloudflare documents a 30-second limit per individual SQL statement, including statements in a batch. The complete batch took longer than 30 seconds; that is not a per-statement violation. An intentionally corrupted copied timestamp caused the equality guard to abort; all 18 table fingerprints subsequently matched, demonstrating complete batch rollback. Evidence: `work/production-backup/migration-validation.json`, `d1-runtime-validation.json` and the runtime/rollback logs in the ledger.

Optional remote-copy creation failed with HTTP 401/code 10000 through both connector and Wrangler; no remote copy was created. The complete-copy rehearsal therefore uses local D1, not a cloud performance benchmark. Remote timing is not claimed. Existing production retention continued independently after the backup, so later live row counts can be lower without this continuation changing records.

## Final gates

| Gate | Result |
| --- | --- |
| Complete root, including `.test.js`, `.test.cjs`, `.test.mjs` | 1,744 pass; 0 fail/cancelled/skipped |
| Complete Alerts Worker, run 1 | 446 pass; 0 fail/cancelled/skipped |
| Complete Alerts Worker, run 2 | 446 pass; 0 fail/cancelled/skipped |
| Complete Audit Worker | 158 pass; 0 fail/cancelled/skipped |
| Captured-game comparison against unchanged main | 107 exact matches; 0 differences across CFB, NFL, NHL, NBA, NCAAB, MLB |
| Actual USF–ECU sequential replay | 10 pass; six false zero-clock snapshots invalid, three genuine zero-clock snapshots valid |
| Alerts deployment dry run | Passed; 916.42 KiB, gzip 214.81 KiB |
| Audit deployment dry run | Passed; 278.80 KiB, gzip 77.33 KiB |
| Final source site build | Passed with revision `b47e47e6548e0c89cefc135c0179844c9bcfdf2c` |
| Desktop and mobile browser verification | Passed in native Chrome; screenshots and computed accessibility evidence retained |
| Production cutover preflight | **Failed/blocked:** HTTP 500, D1 code 7500; precise platform cause unresolved |

These complete-suite runs used the final source bytes before the source commit was created; the later commit identifies those bytes. No serialization, skipped test, relaxed assertion, changed pin or timeout increase cleared a gate. Earlier failed development runs remain in the ledger, with their causes and the later complete-suite verification.

Browser verification exercised cards, Game Center, search, both player-team captions, uncertainty text, timeline connections/gaps, keyboard focus and Chrome computed accessible names/roles. Mobile used a real 390×844 CSS viewport in an iframe in desktop Chrome, not physical phone hardware. The fixture preview deliberately holds an uncertain rating and supplies fixture player rows; the underlying 148 retained USF history rows remain original. The rejected interval is disconnected, verified gaps remain connected, and a genuine Q4 zero endpoint retains its recorded label. Preview-only missing config/favicon requests and the wrapper service-worker warning are not represented as production results. The final committed build was rebuilt and reloaded for a final visual check.

## Preserved behavior and incident limits

Scoring formulas, NHL manpower, notification thresholds/deduplication, provider/AI budgets, poll schedules, soccer behavior and the separate social-bot change remain unchanged. Existing full-suite safeguards cover these, and captured-game outputs are equal. No live test notification or bot post was sent.

The USF–ECU 51-minute interval remains a separate incident: retained audit samples show repeated integrity rejection suppressing snapshots, not the minute-boundary persistence collision. Original six false ratings of 24 remain stored and are classified invalid on read. Genuine zero-clock ratings 40, 43 and 48 remain valid. Exact rejected provider payloads and every intermediate revision were not retained, so the upstream cause of every missing refresh cannot be reconstructed. No missing observation was invented or backfilled.

## Staged versions, aborted cutover and remaining blocker

Main was reverified as `6f39b7d53e0958aab6676d2960b795936f2a6dea`. Existing active versions remained Alerts `06338921-4f22-4714-8f5f-762f87720d2e`, Audit `8e0dab72-2d19-42d5-9a3c-f53e29ce2059`. The active Alerts mapped source matches main; Audit source has no repository changes between its annotated commit and main before this candidate. Current bindings, secrets, compatibility date and schedules were inspected and preserved.

Staged, inactive versions: Alerts `d786b8ef-cb50-4f97-9389-8077fc7db5e2`; Audit `b0a3a4f9-f59e-4a73-81c9-e3d0bcb665d1`. Independently downloaded JavaScript matches each staged bundle byte for byte; all 86 Alerts and 16 Audit mapped source contents match the local source. Wrangler rebases uploaded map paths to each Worker directory; the initial literal-path comparison failed, and resolving those documented upload paths confirmed identical content. The first strict upload stopped solely because the prior release used the script API; after source/settings reconciliation the upload succeeded without activating it.

The new Alerts conflict target requires the new key. Old consumers must not process newly colliding lifecycle rows. The planned cutover fences refreshes using the existing owner-checked lease, allows old in-flight work to finish, retains a current D1 recovery bookmark, applies the guarded migration as one D1 batch, activates both compatible versions, verifies schema/data/source, and releases only the maintenance-owned lease. It does not alter cron configuration or ongoing polling rules.

The maintenance-owned refresh lease was acquired at `2026-11-07T07:13:34.002Z`. Before any migration or activation, this read-only aggregate failed:

```sql
SELECT state, COUNT(*) AS rows, SUM(rowid) AS rowids,
       SUM(observed_at) AS timestamps, SUM(rating) AS ratings,
       SUM(length(normalized_state)) AS payloadCharacters
FROM sports_snapshots GROUP BY state;
```

Cloudflare returned HTTP 500, code 7500, Ray ID `a56a89d76f5fa3fa-DFW`, reference `e_PVSMDp_f642f19e70f24c5383b45c79c94d8cba`. The accompanying schema/trigger reads did not produce a successful batch result. The migration was **not submitted**. The exact-owner lease was released and its absence verified at `07:14:30.620Z`, approximately 56.6 seconds after acquisition. This operational lease insertion/deletion was the only deliberate production database mutation; no history, ratings, subscriptions, notification state or schema was edited. No missing observation from that maintenance interval is invented or backfilled.

Investigation established that the query plan uses a temporary B-tree and its SQLite bytecode inserts the entire `normalized_state` text into the sorter before applying `length()`. The restored backup contains over 2.16 billion payload characters. The same grouped aggregate passes on the complete local backup in 13.9 seconds. Streaming per-state aggregates avoid that sorter and produce exactly equal integer results on the same backup. Those facts justify a lighter verification query, but **do not prove the cause of Cloudflare's internal error**. No migration was attempted to test that hypothesis on production. Cloudflare's [D1 debugging documentation](https://developers.cloudflare.com/d1/observability/debug-d1/) classifies code 7500 as a platform-side storage event and recommends retry/backoff or provider investigation. The public status API could not be fetched in this session; no provider incident is asserted.

The blocker requires an explained/stable production D1 preflight before cutover resumes. A lighter diagnostic or isolated successful retry must not silently erase the failed run. The failed query, query plan, bytecode, local aggregate equivalence and cleanup evidence are retained. Earlier preflight request-shape errors (an incorrect feed column and parameters attached to a multi-statement API string) were rejected before mutation, corrected, and verified separately; they are distinct from this unresolved server error.

At the independent final production check, `2026-11-07T07:17:59.560Z`, both old active versions were unchanged; `sports_snapshots` still had the two-column primary key; the migration ledger still contained only its original entry; the maintenance owner had no lease; and the canonical feed had refreshed at `07:17:17.091Z`. Main was last rechecked unchanged immediately before cutover. The pre-cutover recovery bookmark is `0000007e-00011fe0-0000511c-bcfa78e022d121dea670894aac7d1ef3`, supplementing the downloaded backup.

On a future successful migration, the old two-column key cannot be restored after legitimate collisions without data loss. Rollback must preserve the expanded key and compatible consumer code; never restore an old backup over newly accepted observations. On any guard failure or data ambiguity, stop before activation and verify atomic rollback. Git publication must be a normal fast-forward after rechecking main; no force push or overwrite of intervening work is authorized. Post-publication source and production-behavior verification remain unperformed because there was no activation/publication. Uploaded version source was verified independently; that is not a deployment claim.

References: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Worker deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/).
