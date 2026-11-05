# Audit scan storage and safety measurement

This is an offline storage projection from genuine retained November 3 states, not a historical scoring replay, production latency measurement, or invoice forecast. The script uses the exact deployed audit baseline (bundle SHA-256 `12261ce76efcbf5bbe91ea1b60a2abd68d6f0c8fb578b00355a8e1ba1ce72956`) and the upgraded scanner against independent in-memory SQLite databases. Both execute their actual SQL. External fetches and AI calls are forbidden by the harness, and its D1 adapter rejects writes outside `live_audit_*`.

The reproducible script is `scripts/measure-scan-cost.mjs`; full numeric results and source hashes are in `november-3-scan-cost-projection.json`. The script takes the locally captured `d1-retained.json` as its first argument. That capture has SHA-256 `cbf8fa33da2b90847e31a85c2ef389c0aa42af1431c66593ec06e0ee7e6fd869`.

## Representative game observations

One genuine live state was selected per monitored game: the chronological middle retained live snapshot. The sample contains 27 games across NHL, CFB, NCAAB, and hidden Soccer. Canonical refresh/scan times are simulated solely to exercise serialization. There are no corresponding NFL, NBA, MLB, or Tennis samples from this night. Sizes below are UTF-8 JSON bytes; p95 uses nearest rank.

| Payload | Median | p95 | Largest |
|---|---:|---:|---:|
| Baseline complete observation | 3,024 | 3,606 | 3,608 |
| Upgraded complete observation | 9,007 | 10,857 | 10,922 |
| Upgraded compact canonical state | 4,707 | 5,743 | 6,346 |
| Upgraded structured quality evidence | 3,342 | 3,946 | 4,166 |

Total observation bytes for those 27 independent scans increase from 84,040 to 237,378. Both versions execute 200 reads and 81 writes in total: seven or eight read statements and three writes per game, depending on sport. These are statement counts from SQLite, not Cloudflare billable row counts. Every write is to an audit table.

The same retained Winnipeg comeback state used by the regression test yields eight reads and three writes in both versions. Its complete observation grows from 3,941 to 11,535 bytes, an additional 7,594 bytes. Neither run has a cached event stream. This is a concrete sample rather than an average of all games.

Across all 6,293 retained live snapshots, projected compact state plus structured evidence has median 8,393 bytes, p95 10,327, and largest 12,255, before adding a cached summary event stream. This checks more than the 27 representative states without making those snapshots new observations in the production audit.

## Existing cached summaries and the event bound

The eleven retained NHL summaries were paired with the genuine last retained live state for their game. Their existing acquisition times were aligned to a simulated scan only for storage measurement. These summaries are final cached revisions; this exercise does not claim they were the revisions available during the historical live scan.

The resulting complete observations have median 15,201 bytes and largest 18,332. They retain four to twelve supported events, with median six. The largest real serialized event record in this exercise is 647 bytes. The arithmetic envelope for 48 records of that size is 31,105 bytes including JSON commas and brackets. This is an observed-record-size envelope for the bounded event array, not an observed 48-event game or an absolute limit on every possible provider field. Exact canonical scoring-ledger rows were absent from the retained snapshots and could add future bytes.

The richer peer query still has a 100-row limit and the same query count, but now returns full evidence rows instead of two fields. Its transfer and retained memory can therefore increase materially. Finding rows also duplicate evidence when a finding opens or updates; the JSON report's bound-statement bytes include those statements. Unchanged query counts do not establish unchanged storage, transfer, or CPU costs.

## Safety checks

The 25 focused tests in `scan-safety.test.js`, `event-response.test.js`, and `november-3-observed.test.js` pass. They include scan isolation, zero provider/AI/notification actions, unchanged three-minute cron, per-game model attribution, active-source relevance, deterministic immediate opening, two-scan heuristic opening, and two clean scans before recovery. The event and observed-data tests cover causal limitations and November 3 false-positive cases.

`production-scope-verification.json` records content hashes for all 1,209 tracked files outside `live-audit-worker/`. All match current-main commit `42b09f6` under Git content normalization or exact raw bytes for the baseline's CRLF-preserved blobs. There are no outside-audit changed paths. That main commit is an ancestor of the integration branch; its sole intervening commit adds only audit files. This verifies repository scope at the recorded head, not a production deployment action.

## On-demand nightly export comparison

`scripts/measure-export-cost.mjs` calls the actual authenticated Worker `/export?date=2026-11-03` path against the captured database opened in read-only mode. The database SHA-256 is `f1c405bc266ec23236e78ad5dad2e096f3480f502f4223229c4807cc89351c2b`. Its missing `sports_feed` table is represented by the same documented empty-feed response for each version; this lookup is counted separately. The individual run table is empty because the original export supplied aggregates rather than underlying scheduled run rows. Output is consumed and counted without keeping another complete ZIP buffer.

Both actual Worker routes returned HTTP 200. These results include the one feed-stub query and its one row/67 bytes on each side.

| Measurement | Original deployed audit | Upgraded audit | Change |
|---|---:|---:|---:|
| SELECT calls | 125 | 161 | +36 |
| Returned rows | 1,722 | 7,674 | +5,952 |
| Serialized query-result bytes | 11,769,427 | 113,743,845 | +101,974,418 |
| ZIP bytes | 7,912,273 | 21,280,507 | +13,368,234 |
| Local elapsed milliseconds, single run | 410.9 | 3,361.2 | +2,950.3 |

The baseline snapshot portion is 39 queries, 399 returned rows, and 7,438,017 bytes. The upgrade reads the full 6,340 retained snapshots in 48 bounded queries, returning 103,312,083 bytes before projection. It also performs 27 cached-summary lookups for the recorded summary references; eleven exist in this capture, returning 6,100,352 bytes. Thus the query increase is exactly nine additional snapshot-page reads plus 27 cached-summary lookups. Audit observation, finding, event and run query counts are unchanged. Cached resources come from the same local retained database; no sports-provider request is made.

Full measurements, source hashes, individual queries and arithmetic deltas are in `november-3-export-baseline-cost.json`, `november-3-export-upgraded-cost.json`, and `november-3-export-cost-comparison.json`. Query-result bytes exclude the D1 transport envelope, and returned rows are not billed D1 rows read. Timings include byte-accounting instrumentation, are single local Node/SQLite runs, and do not predict deployed latency, Cloudflare CPU, or invoices. The increased historical-export work is on demand; it is distinct from the scheduled scanner's unchanged query counts above.

The upgraded output was consumed as 1,193 streamed chunks and discarded after counting and hashing. No second complete ZIP buffer was created. Its sampled local Node heap was 151,726,368 bytes versus 32,648,712 for the baseline, with instrumentation included. A host Node memory sample is not a measurement of the Worker's isolate limit or its garbage-collection headroom; actual workerd validation is necessary separately. Both measured export paths made zero external/AI requests and zero database writes.
