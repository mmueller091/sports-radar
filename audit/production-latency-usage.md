# Production latency and usage measurement

**October 28, 2026 — RED: do not increase frequency. Keep 12-second live eligibility / 15-second visible polling.**

Production matches the intended release. The history indexes substantially reduce reads, but completed snapshots still churn on a cosmetic provider-name change. Production has slow Worker invocations, actual feed timeouts, and multi-minute stale responses even without live games. Those are stronger reasons to defer 10/10 than uncertainty about a future live slate.

## 1. Deployed state

No release discrepancy found:

- GitHub `main`: `dd4ce08e8b85b7cb9f0a47add77b365de6ed20f4`, verified through GitHub API.
- Worker: `a64b4c60-4a46-474b-b904-4322fd831724`, deployed at **10:23:40.497 UTC / 06:23:40 EDT**, 100% allocation. Wrangler deployment listing and live-tail version agree.
- Public GitHub Pages `app.js` is byte-identical to this checkout's file.
- Production has `sports_snapshots_upcoming`, `sports_snapshots_completed`, and `sports_snapshots_nfl_records`; remote EXPLAIN uses them.
- Canonical eligibility and live resource TTL: 12 seconds. Visible/live main feed: 15 seconds after completion; hidden/idle: 60 seconds. Open/live detail timer: 10 seconds after completion. Detail resource TTL is still 12 seconds, so a 10-second timer does not guarantee a newly acquired summary every poll.

Worker version identity is verified; the Worker bundle was not independently downloaded and compared byte-for-byte. Frontend timers are verified in the actual served asset, not merely local source.

## 2. Measurement windows and method

- Clean historical analytics: **11:00–14:00 UTC / 07:00–10:00 EDT**, entirely after deployment, excluding the mixed deployment/migration hour. All intervals are half-open.
- Before comparison: **07:00–10:00 UTC / 03:00–06:00 EDT**, before the expected release. Different traffic/slates make this observational, not a controlled benchmark.
- Direct feed probes: **14:34:38–approximately 14:39:59 UTC / 10:34:38–10:39:59 EDT**.
- One initial feed GET, then five GETs spaced 60 seconds after completion/timeout because there were no live games. The five scheduled probes used the actual browser's 10-second timeout. No retries or catch-up burst.
- One ordinary completed-game detail GET. Passive Wrangler tail for 150 seconds; bounded SELECT and EXPLAIN queries through Cloudflare's D1 API; GraphQL analytics and account settings reads.

All direct SQL was read-only, with `changed_db:false` and zero rows written in the returned query metadata. Normal public GETs can acquire resources, write caches/history, and acquire leases through existing application behavior; these side effects were not disabled or bypassed. Audit reads add a little usage outside the clean historical window. No production mutation endpoint, migration, deployment, configuration, scoring, or polling change was performed.

Evidence is retained in [production-evidence](production-evidence/), especially `worker-aggregate.json`, `worker-post.json`, `d1-post.json`, `d1-trend.json`, `storage-trend.json`, `explain-*.json`, `completed-comparison.json`, `feed-samples.json`, `detail-probe.json`, and `tail-summary.json`. Raw tail request headers/client metadata were removed from retained evidence.

## 3. Worker metrics

Cloudflare `workersInvocationsAdaptive`, 11:00–14:00 UTC; returned sample interval = 1. GraphQL schema explicitly describes CPU, wall-time and request-duration quantiles in **microseconds**; values below are converted. Tail durations use milliseconds.

| Metric | Sports Radar | All returned account scripts |
|---|---:|---:|
| Invocation/request counter | 236 | 245 |
| CPU | 214,764 ms | 214,911 ms |
| Subrequests | 17,661 | 17,666 |
| Errors | 0 | 0 |
| Client disconnects | 1 | 1 |

The other returned script is `postseason-hits-pool` (9 invocations). **These counters include scheduled invocations; 236 must not be labeled 236 incoming HTTP requests.** This dataset's exposed dimensions do not separate cron, `/feed`, `/game`, and other routes. Incoming HTTP-only count is unavailable here. Subrequests are not an ESPN-origin-request count and are not broken down by provider/cache/binding.

Sports Radar aggregate:

| Duration | p50 | p95 | Observed maximum |
|---|---:|---:|---:|
| Invocation wall time | 7.617 s | 73.647 s | 111.968 s |
| CPU | 1.228 s | 2.581 s | 3.152 s (success group) |
| Request duration | 0 s | 8.472 s | Not collected |

The zero request-duration median reflects mixed invocation types and is not a median HTTP response claim. Wall-time range is 0.003837–111.968 seconds, including cheap reads and skipped refreshes.

| UTC hour | Invocations | CPU ms | Wall p50 | Wall p95 | Wall max |
|---|---:|---:|---:|---:|---:|
| 11:00 | 115 | 72,417 | 0.872 s | 26.048 s | 111.968 s |
| 12:00 | 62 | 72,435 | 18.494 s | 76.059 s | 88.459 s |
| 13:00 | 59 | 69,913 | 19.294 s | 73.537 s | 81.586 s |

Zero platform errors does not establish application health: source failures can be absorbed, stale feeds returned with HTTP 200, and cron can exit successfully without publishing.

Passive tail confirms minute cron events at 14:37:17 and 14:38:17, taking 119 and 78 ms, while the published feed was old. These are consistent with skipped/contended refreshes, not fast complete canonical jobs. Nine captured events had no logged exceptions. A separate browser `/feed` invocation at 14:38:48.589 took **11.489 seconds wall / 1.569 seconds CPU**, exceeding the frontend's 10-second timeout budget. Tail does not provide its response body or a refresh-stage trace.

## 4. D1 metrics

Database `sports-radar-alerts`, ID `a46d8205-8e2c-44c2-8e90-fef74acfd99b`:

| UTC hour | Rows read | Rows written | Read queries | Write queries |
|---|---:|---:|---:|---:|
| 11:00 | 90,340 | 33,929 | 20,511 | 19,343 |
| 12:00 | 71,794 | 28,988 | 16,371 | 15,986 |
| 13:00 | 72,233 | 29,218 | 16,393 | 16,036 |
| **Total** | **234,367** | **92,135** | **53,275** | **51,365** |

All returned account databases total **234,390 reads / 92,137 writes**; another database contributes 23 reads and 2 writes. These are returned datasets, not an invoice reconciliation.

- Database REST size: **1,670,983,680 bytes (1.671 GB)** at initial inspection; subsequent SQL metadata reached 1,671,680,000 bytes.
- Hourly maximum size rose from 1,667,149,800 bytes in 11:00 to 1,669,648,400 in 13:00: approximately **2.499 MB across two hours**. This is a short trend of hourly maxima, not a stable retention forecast.
- Average D1 query-batch time: 1.221 / 1.493 / 1.586 ms by hour. Small SQL engine time does not include all Worker/D1 network round trips or serialization.
- The inspected analytics dataset does not expose a query-error counter. Audit queries succeeded; production-wide D1 query errors remain unknown.
- Wrangler's mixed trailing-24-hour overview reported **430,446,940 reads / 901,766 writes**, 130,712 read queries and 144,513 write queries. It contains older releases and the deployment/index hour; do not use it as the optimized baseline.

## 5. History optimization: strong read improvement, incomplete write improvement

### Indexed lookups

Actual remote EXPLAIN results:

- NFL recovery: `SEARCH ... USING INDEX sports_snapshots_nfl_records`, bounded by game, team IDs and observed time; its completed cutoff uses the completed covering index.
- Upcoming lookup: `SEARCH ... USING COVERING INDEX sports_snapshots_upcoming`.
- Latest completed lookup: completed covering index, followed by exact primary-key lookup.

The `SCAN k` / `SCAN CONSTANT ROW` entries refer to supplied game keys, not retained snapshot history. No retained-history scan appears in these production plans.

Before window reads: **47,498,757**; clean after reads: **234,367**, an observed **99.51% reduction**. The periods are not controlled for game/traffic mix, but the production plans independently support the removal of the old scan. Writes went from **40,715 to 92,135**, approximately **2.26x**, so this audit does not claim overall write savings.

### Completed snapshots

For the 32 completed games currently in the feed, bounded indexed counts in 11:00–14:00 show:

- 29 games with 38 new final snapshots each;
- 2 games with 36 each;
- 1 MLB game with none;
- **1,174 final snapshots total**.

This is below one final per minute, and exact identical content is gated in code, but semantic deduplication is not working adequately. The latest eight snapshots from each of the 31 changing games yield **217 adjacent comparisons**. In **all 217**, the only difference under the deployed `finalContent` comparison is `line.provider`: **`DraftKings` versus `Draft Kings`**. Scores, state, rating, and the rest of that compared content did not change. These are cosmetic differences, not meaningful final corrections. Examples include NFL `401873010`, NHL `401892585`, and NBA `401909877`.

This is an observed remaining optimization defect, not a hypothetical worst-case model. Any future fix should preserve genuine final corrections; no fix was made here.

### NFL neighboring weeks

Production cache timestamps for adjacent week 7 and week 9 remained at **14:32:16.659 UTC** across two observations several minutes apart. Deployed source applies a 900-second TTL to static adjacent schedules. The initial feed contains 14 NFL games in week 7 and 14 in week 8, including neighboring completed games. There is no rapid repeated adjacent fetch evident in these observations. The short interval coincides partly with stalled canonical publication, so it cannot establish a full-day provider fetch rate or every next-week inclusion case.

## 6. Main-feed latency samples

All UTC on October 28. Age is client response completion minus `feed.updatedAt`. This timestamp represents **refresh start**, not provider publication or the atomic canonical commit. Small client/server clock differences are visible (about 0.2 seconds); precision beyond that is not justified.

| Start | Completion | HTTP / duration | updatedAt | Apparent age | Games/live | Revision / errors |
|---|---|---|---|---:|---:|---|
| 14:34:38.274 | 14:34:38.702 | 200 / 428 ms | 14:33:17.765 | 80.937 s | 295/0 | 1793197997765; 1 summary source error |
| 14:35:37.735 | ~14:35:47.735 | Aborted at 10 s | unavailable | unavailable | unavailable | No response body |
| 14:36:47.756 | 14:36:48.055 | 200 / 299 ms | 14:34:34.673 | 133.382 s | 295/0 | 1793198074673; 0 source errors; stale |
| 14:37:48.084 | 14:37:48.403 | 200 / 319 ms | 14:34:34.673 | 193.730 s | 295/0 | same revision; 0 errors; stale |
| 14:38:48.421 | 14:38:49.062 | 200 / 641 ms | 14:34:34.673 | 254.389 s | 295/0 | same revision; 0 errors; stale |
| 14:39:49.082 | ~14:39:59.082 | Aborted at 10 s | unavailable | unavailable | unavailable | No response body |

Timeout completion times are approximate because the harness recorded the start and timeout exception, not the final timestamp for failed requests. The initial summary error names NBA event `401909930`; its precise failure reason is not exposed.

The successful responses demonstrably reused older feed data. They did not return a revision initiated by that same request. The timed-out requests might have owned refresh work; attribution cannot be proved from their missing response bodies. A lease observed at 14:38:54 expired at 14:41:48.659, consistent with acquisition near 14:38:48.659 under the 180-second lease policy. No lease was changed by the audit.

**Two of five scheduled probes timed out.** This small, selected quiet-slate sample is not a general failure-rate estimate. Fast stale responses are not evidence of fast canonical refresh.

There were **no live games**. Actual real/provider-to-live-browser latency cannot be validated. ESPN availability delay is unknown; neither ESPN publication timestamps nor per-resource acquisition completion timestamps are exposed. A successful response creates a browser render opportunity immediately after parsing; the controlled probes did not measure DOM paint. Stale snapshots would still be stale at that opportunity. Under a healthy, uncongested live cycle, shortening 15 to 10 seconds could save roughly 2.5 seconds of average polling residual; that is conditional modeling, not observed improvement here.

## 7. Detail refresh verification

- Public deployed frontend contains the 10-second completion-based timer, one-in-flight guard, close/visibility cancellation, generation checks, latest canonical-game lookup, summary timestamp rejection, and chronology validation.
- Canonical game data supplies displayed score/state/rating; summaries are checked against that state and do not recalculate the canonical rating in the detail refresh path.
- One completed NFL detail GET at 14:38:07.990–14:38:08.798 succeeded in **808 ms** (tail: 661 ms wall, 50 ms CPU). It returned a fresh summary timestamp `14:38:08.409`, canonical timestamp `14:34:34.673`, and canonical revision `1793198074673`.
- Its D1 resource timestamp advanced from `14:35:38.255` to `14:38:08.409`, consistent with an expired-cache acquisition. This is expected ordinary GET behavior, not a fresh-cache-hit test.
- Source's fresh-cache return precedes lease/resource writes. Production fresh-hit write suppression was **not directly measured**. No recurring detail fetch/write loop appeared in the short tail, but no live detail panel was exercised.

The intended safeguards are deployed. Continuous rich-detail updates, actual 10-second live cadence, absence of overlapping browser requests, and visible non-rewind behavior remain **source-verified, not live-UI-validated**. A fresh detail response alongside an old canonical revision does not prove the canonical path is healthy.

## 8. Canonical refresh duration and contention

**Exact canonical-job p50/p95 are unavailable**: no refresh-stage duration field is published, and account analytics combine cron, research, cache reads, detail and feed handlers. Do not relabel the Worker wall-time percentiles as canonical-job percentiles.

The available evidence nevertheless fails the required headroom test:

- Actual `/feed` handler wall time of **11.489 seconds** in passive tail.
- Two direct browser-budget timeouts.
- Hourly invocation p50 around **18.5–19.3 seconds** during 12:00–14:00, with p95 around **73–76 seconds** and maximum **112 seconds** across the clean window.
- Reused publication 133–254 seconds old, with minute cron firing successfully but briefly during the stall.
- The quiet feed had **295 games, 263 upcoming, 32 completed**, and **132 enrichment candidates** under the deployed filter: **22 groups of six**. This is a source-derived candidate count applied to a production feed, not a logged per-job count.

The expensive work is not limited to currently live games. Summary fetches/lease operations and scoring/history precede canonical publication. Serial enrichment groups can accumulate provider delays. This is a plausible explanation, not a measured stage breakdown. No representative live normal slate or Saturday heavy slate was observed.

The observations are consistent with lease contention and/or abandoned work following client timeouts; they do not establish the exact cause or contention rate. The 180-second lease and client cancellation need investigation before increasing demand. Preserve completion-based scheduling; evidence does not support deadline scheduling or catch-up requests.

## 9. Current versus proposed workload

Let `d` be average successful request duration in seconds. A single visible/live tab produces `3600/(15+d)` requests/hour now, versus `3600/(10+d)` under the proposal. The increase approaches **50%** for cheap responses; at `d=2`, it is about **41.7%**. Hidden/idle demand and the minute cron do not change.

A globally demand-saturated, short-job canonical gate moves from at most 300 to 360 starts/hour: **+20%**. A single successful viewing tab can instead drive up to approximately **+50%**, depending on duration/phase/other viewers. These are different regimes, not a universal 20–50% bound. Long jobs, cache timing, lease failures and aborted clients invalidate simple frequency scaling.

| Resource | Observed baseline (3 hours) | Increment from 10/10 |
|---|---:|---|
| Worker invocation counter | 236 | HTTP live-feed component can approach +50%; cron/detail/idle unchanged; actual HTTP component unavailable |
| Full refresh count | Not measured separately | +20% eligibility ceiling in short-job saturated regime; potentially near +50% in a single-viewer regime; actual unknown |
| Provider/subrequests | 17,661 aggregate subrequests | Faster live-resource eligibility can increase fetches; static adjacent/future TTLs stay fixed; exact provider delta unknown |
| Worker CPU | 214,764 ms | More full jobs raise CPU; billable actual increment unknown without live-job mix |
| D1 reads | 234,367 | More feed reads and indexed per-job lookups; no need to reuse the old retained-history-scan model |
| D1 writes | 92,135 | More cache/lease/publication work; live snapshots retain 15-second buckets; cosmetic final churn remains |
| Storage | 1.671 GB | Does not scale directly with polls; retention, changed finals and live bucket occupancy dominate |

**For the observed no-live workload, changing only live eligibility and visible/live polling predicts approximately zero incremental traffic.** Thus applying a global multiplier to this quiet baseline would not be a forecast of the patch.

For budget sensitivity only, extending the three-hour rates for 30 days (factor 240) gives:

| Metric | Current quiet-rate extrapolation | Artificial 1.2x sensitivity | Artificial 1.5x sensitivity |
|---|---:|---:|---:|
| Invocation counter | 56,640 | 67,968 | 84,960 |
| CPU ms | 51.54 million | 61.85 million | 77.32 million |
| Subrequests | 4.239 million | 5.086 million | 6.358 million |
| D1 rows read | 56.25 million | 67.50 million | 84.37 million |
| D1 rows written | 22.11 million | 26.54 million | 33.17 million |

The sensitivity columns deliberately scale even unaffected work to show headroom, not to claim actual 10/10 usage. Live slate costs and subscriber/browser populations remain unknown. Storage growth is not multiplied by these factors.

## 10. Cost and headroom

Account settings report `default_usage_model: standard`. The subscriptions API rejected this credential with authentication error, so the actual subscription/invoice and all account-wide billable products were not verified.

Current official [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) lists a $5/month paid minimum, 10 million requests and 30 million CPU milliseconds included; excess is $0.30/million requests and $0.02/million CPU milliseconds. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) includes 25 billion row reads, 50 million row writes, and 5 GB; excess rates are $0.001/million reads, $1/million writes and $0.75/GB-month. Checked October 28, 2026.

Conditional on that paid plan and the quiet-rate extrapolation:

- Requests and D1 reads have very large headroom.
- D1 writes use about **44.2%** of the included monthly volume; 1.5x sensitivity uses **66.3%**. This is useful headroom, not a live-slate guarantee.
- CPU already extrapolates above the 30m inclusion: approximately **$0.43/month** overage. The artificial 1.2x/1.5x scenarios imply about **$0.64/$0.95** total CPU overage, an incremental **$0.21/$0.52** versus that baseline.
- Sports Radar storage is about **33.4%** of the 5 GB inclusion. Other database storage and mature 30-day retention were not fully assessed.
- Roughly $5–$6 for these measured Worker/D1 dimensions is plausible under steady quiet usage, but neither an exact invoice nor a live-season forecast. AI/research and other account products may add usage outside this model.

Cost is not the primary blocker. Current production does not demonstrate duration/reliability headroom for 10 seconds.

## 11. Limitations

No live game, no real-event/ESPN publication clock, no DOM timing, no per-stage canonical timing, no endpoint-specific historical traffic, no historical lease counter, no provider-origin/cache-hit breakdown, no production-wide D1 error count, and no paid invoice access. The selected historical hours include background research and mixed invocation types. Before/after periods differ in workload. Direct probes themselves exercise normal refresh behavior and can contend with existing viewers/cron; the historical analytics window predates the probes. A browser timeout may leave ordinary application work or a lease behind; nothing was manually cleared. No guarantees are inferred from empty error arrays.

## 12. Decision

**RED — do not increase frequency.** Keep 12/15 and the deployed 10-second detail timer, with 60-second hidden/idle polling.

The exact reasons are observed timeouts, an 11.489-second feed invocation, substantial invocation tails, multi-minute stale publication despite cron, and cosmetic-only completed-snapshot churn. Absence of a representative live slate is an additional limitation, not the sole reason for the decision.

Before revisiting cadence, investigate refresh ownership/cancellation and the cost of the 132-candidate quiet slate, remove cosmetic provider-label changes from meaningful-final detection, then measure successful canonical acquisition-to-publication durations and lease outcomes during actual live play. Re-measure D1 writes and detail-cache-hit behavior. These are follow-up investigation topics, not changes authorized or implemented by this report.

## 13. Exact next patch

**Not applicable: the recommendation is not GREEN.** No 10/10 patch is specified or implemented. Completion-based scheduling should remain in place on this evidence.

No application code, configuration, scoring, polling intervals, or production data was intentionally edited. No migration or deployment occurred. Only this report and local measurement evidence were added; ordinary public GETs retained their existing production side effects.
