# Sports Radar live latency audit

Audit date: October 28, 2026. Source revision: `26a0d535f32dfbb98370bb3eca3abcccdfd37bb6` plus the working tree inspected. No application files, configuration, refresh intervals, or deployment were changed. This report is the sole deliverable added.

## Executive finding

**The current implementation already implements option C: minute cron plus synchronous, stale-aware, globally coalesced `/feed` ingestion.** Its live age threshold and live provider TTL are **12 seconds**. A visible browser polls **15 seconds after the preceding request completes**. It is incorrect to describe this checkout as minute-cron-only or to promise a fourfold improvement simply by introducing request-driven refresh.

For a healthy, already-live game and one viewing tab, a reasonable planning estimate is **about 10–20 seconds from availability in ESPN's API to the main UI**, assuming a roughly 2–5 second complete refresh. This is a modeled range, not a production measurement. The initiating browser normally receives the refresh it triggered, so a separate full browser interval should not be added to that same request. Cache phase, another refresh owner, heavy slates, and failures can increase this substantially. Real-world latency additionally includes **unknown ESPN acquisition/publication latency**.

The main controllable healthy-path latency is the completion-based 15-second polling cycle. The largest tail-latency risk is that **all eligible summary enrichment and history writes gate publication**. The game-detail panel has a more serious independent problem: **it fetches once when opened and never refreshes while left open**.

Before increasing frequency, address history scans, repeated completed-game snapshots, and refresh/detail coordination. Recommend the existing architecture with a **10-second live ingestion target and 10-second visible browser cadence**, adaptive to actual work duration; optionally 5 seconds for a single visible game detail after measurement. Keep the minute backstop and 60-second hidden/idle cadence. Do not adopt global 5-second full-slate refresh as the default. No additional Cloudflare product is necessary.

## Evidence and limits of this audit

Inspected runtime, schema, configuration, tests, browser, scoring, provider adapter, and service worker directly. Important references:

| Source | Relevant code |
|---|---|
| `alerts-worker/wrangler.toml` | Minute sports cron, two-hour research cron, AI and D1 bindings; no custom CPU/subrequest limit |
| `alerts-worker/src/index.js:88` | `/feed` reads D1, checks `refreshDue`, awaits refresh or rereads old feed |
| `alerts-worker/src/index.js:172` | Scheduled refresh and alert evaluation |
| `alerts-worker/src/sports-feed.js:6` | Freshness/refresh constants; `readFeed`, `refreshReader`, `providerJson`, `gameDetails`, `refreshSportsData` |
| `alerts-worker/src/providers/espn.js` | Collector, NFL neighbor weeks, NBA/NHL daily windows, summary URLs |
| `alerts-worker/src/game-model.js` | `normalizeEvent`, `applyContextsToGame`, `enrichGame` |
| `rating-core.js:930` | Live chronology/score validation; `applyLiveSnapshot` near line 1247 |
| `app.js:472` | `liveRefreshDelay`, `scheduleLiveRefresh`, `canonicalFeedGames`, `loadLiveGames` |
| `app.js:2457` | `renderDetailContent`, `fetchGameSummary`, `openGameDetails` |
| `sw.js` | Network-only feed; network-first same-origin shell; no detail response cache |
| `alerts-worker/schema.sql` | Resource, lease, revision, snapshot and alert indexes |

Ran `node --test alerts-worker/test/sports-feed.test.js test/startup-feed.test.js test/live-score-regressions.test.js`: **28 passed, 0 failed**. These cover request-driven ingestion, TTL boundary, reuse, lease contention, stale fallback, browser startup, summary chronology and scoring parity. They mock provider fetches and use local SQLite; they do not measure Cloudflare caching or deployed latency. No new tests were written.

An in-memory SQLite `EXPLAIN QUERY PLAN` using the checked-in schema confirms that the pregame-history query scans `sports_snapshots` using its primary-key index. An in-memory size sample of the 107 archived migration fixtures, normalized and enriched with the current model, produced JSON sizes of **1,253 / 1,844 / 7,422 bytes min / median / max**. These are illustrative completed-game fixtures, not a live production distribution.

No deployed version, production traffic, D1 size/query metrics, CPU telemetry, cache headers, or actual invoice was available in the audited inputs. No live `/feed` or `/game` probe was made: these nominal GETs can write D1 and fetch providers, conflicting with a strict read-only production audit. Exact real-world latency and a guaranteed $5 invoice cannot be established from source alone.

## 1. Current architecture

```text
Real-world event
  -> ESPN acquisition and publication [unknown, scoreboard and summary independent]
  -> trigger: minute cron OR GET /feed when snapshot age >=12s live / >=60s idle
  -> D1 global refresh lease [180s; loser does not wait]
  -> read previous feed, recheck age
  -> SELECT resource timestamp index
  -> collector reads scoreboards/schedules
       D1 valid resource -> reuse payload
       otherwise fetch ESPN with cf.cacheTtl + 7s timeout
       -> normalizeEvent / initial rating / live state
  -> flush fetched resource payloads to D1
  -> any scoreboard/resource acquisition error? retain previous canonical feed
  -> recover NFL pregame records + read D1 storyline contexts
  -> summary enrichment: eligible games in serial groups of six
       D1 cache or provider fetch -> chronology validation -> rating enrichment
       -> flush resource writes after each group
  -> snapshot/history writes in groups of 50
  -> write feed parts [50 games/part, revision = refresh start timestamp]
  -> switch singleton feed header to revision [publication point]
  -> retention DELETEs, release lease, return
  -> /feed JSON, Cache-Control: no-store
  -> browser JSON parse + replace canonical games + local history + render()
  -> next poll scheduled 15s live-visible / 60s otherwise after completion

Minute cron successful/non-stale result -> checkGames -> D1 alert state -> push
Two-hour research cron -> news/AI -> D1 contexts -> next sports refresh consumes

Separate detail route:
openGameDetails -> GET /game/:sport/:id
  -> read canonical feed to authorize known game and choose TTL
  -> summary resource D1 lookup
  -> on expiry, URL lease [15s], ESPN fetch [cf TTL, 7s timeout], D1 upsert
  -> return raw summary + detail freshness (+ basketball display model)
  -> renderDetailContent with captured canonical game + returned summary
  -> NO recurring detail request or automatic detail rerender
```

## 2. Exact refresh/cache behavior

TTL is resource eligibility, not proof that ESPN changed. All canonical resource timestamps use the **refresh start** `now`, even when fetched later. Detail timestamps use request start. Neither stores an ESPN observation timestamp or a separate edge-cache age.

| Stage/resource | Trigger / interval | TTL and stale behavior | Coordination and D1 work | Typical / worst latency contribution |
|---|---|---|---|---|
| ESPN publication | External | Unknown; scoreboard and summaries may disagree | None under project control | Unknown / no verified bound |
| Canonical gate | Cron every minute; every `/feed` request checks age | 12s if ANY previous game live; otherwise 60s | Feed header + revision parts read; global lease acquired; age rechecked | With one viewer, effectively ~15s + work per cycle; without viewer ~60s; failures unbounded |
| Global lease | Due refresh | 180s expiration, owner-qualified release | Conditional upsert `sports_leases`; losers return null immediately | Normally one DB round trip; abandoned lease can delay refresh until 180s plus next trigger |
| Live-sport scoreboards | Every collector invocation, resource-expiry gated | D1 12s AND outbound `cf.cacheTtl=12` | Timestamp scan once, cached payload lookup or fetched resource upsert | Often fresh fetch each viewing cycle; independently phased cache can add nearly a TTL |
| Other/current scoreboards | Same | 55s D1 and outbound TTL | Same | Roughly 0–55s resource eligibility wait plus next trigger; first-live discovery can be slow |
| NBA/NHL future dates | Seven dates each, every collector invocation | 900s D1 and outbound TTL | 14 resource keys; cache lookups even on warm cycles | Schedule changes up to ~15m + trigger; not intended for current live games |
| NBA/NHL yesterday/today | Two dates per sport | 12s when previous feed has that sport live, else 55s | Four resource keys | Yesterday also receives short TTL when sport live |
| NFL adjacent week scoreboards | After base NFL scoreboard reveals week metadata | 12s while NFL live, otherwise 55s: `dates=YYYY` is NOT classified as future schedule | Up to two additional resources | Needlessly frequent for adjacent schedules; see adapter defect below |
| Live summaries | Every eligible game, groups of 6 | 12s D1 and outbound TTL | Shared refreshReader map; writes after each group | Sum of group maxima, not one summary duration; timeout contribution up to 7s per group |
| Nonlive summaries | Completed games and upcoming games without line; excludes upcoming FCS | 55s D1 and outbound TTL | Same | Cached parsing/scoring still runs; expiry waves add provider latency |
| Odds | Embedded scoreboard/summary odds; no dedicated odds fetch | Inherits containing resource TTL; previous line retained if new line absent | Included in feed/resources | Can remain older than score indefinitely if provider omits replacement |
| Win probability, plays, drives, box scores | Summary fields | Same summary TTL; validation may reject stale chronology | No separate provider endpoints | Provider's summary may trail scoreboard despite successful request |
| Storyline context | Research cron `17 */2 * * *`, plus authorized admin research route | News fetch TTL 300s; stored context expiry; no news/AI invocation in normal sports refresh | `contextsForGames` SELECTs in <=90 IDs per query | Up to research cadence for contextual changes, not score updates |
| Normalize / score / enrich | Each accepted collection | No independent timer; current scoreboard normalized even if summary cached | CPU; optional NFL historical-record recovery reads | CPU unmeasured; can be significant on large slates |
| Snapshot persistence | Each successful canonical refresh before publication | Live bucket 15s; completed bucket 60s; upcoming once when found in history; 30-day retention | INSERT OR IGNORE; batches of 50 | DB time gates publication; bucket is NOT a feed refresh limit |
| Publication | After scoring and snapshot batches | Revision parts retained 10m | Parts then one header upsert; cleanup afterward | DB/serialization time; no deliberate timer |
| Public `/feed` | Browser/manual request | **No response edge TTL configured: `Cache-Control: no-store`** | Fresh read uses header + parts; due owner waits for work; loser rereads old feed | Owner gets new feed this request; loser may wait another browser cycle to see it |
| Browser main feed | Startup, manual refresh, visibility return, recurring timer | 15s visible/live; 60s hidden OR no live; HTTP `cache:no-store`; 10s abort | In-flight boolean blocks same-tab overlap; no DB | Mean residual ~half effective cycle; failed fetch retains old games without age bound |
| Browser rendering | `loadLiveGames` finally | No debounce or change-detection wait | Local preferences, lines/history; DOM render | Immediate after parse/local work; device-dependent, unmeasured |
| `/game` | Open detail / any API caller | Live 12s, other 55s; no public HTTP cache | Feed read + summary row + final timestamp row; miss adds 15s URL lease, upsert and release | Normally request duration; stale cached response on error/lease loss |
| Detail panel | One request per opening | No periodic refresh; 7s browser abort | No canonical feed update or rating recomputation | After opening, age grows without bound until reopened |
| Service worker | Fetch interception | Feed explicitly network-only; external detail falls through; same-origin shell network-first offline fallback | Cache API for shell only | No live-data cache delay; offline shell may be old code |

### Stale data and cache layering

There is no timer-driven HTTP stale-while-revalidate on `/feed`. There is application stale fallback:

* `refreshReader` serves expired D1 resources if fetch fails. A scoreboard-stage error prevents publication of a fresh canonical snapshot; summary errors instead allow a fresh but degraded feed with `detailStale`.
* A refresh lease loser does not join the winning promise. It rereads the currently published feed, potentially the old revision. “Coalesced” means one global producer, not that every requester awaits its result.
* `providerJson` serves the old summary on fetch error or URL-lease contention, marks the detail stale, and has no maximum stale-serving age. Canonical cleanup normally deletes resources older than seven days, but cleanup is not a reliable freshness bound during outages.
* Freshness becomes stale at **age >120s**, not at the 12s refresh threshold. An unchanged or stale underlying ESPN payload can receive a new local timestamp. `updatedAt` is not an upstream freshness guarantee.
* D1 TTL and `cf.cacheTtl` are separate cache layers. They should not always be summed: when fetches occur after both expire, only one eligibility wait is visible. But a different region/request may fetch an already-aged edge response and stamp it “now” in D1, preserving that age for another TTL. Detail and canonical callers also share URLs with different request phases/TTLs.
* Thus a nominal new refresh **can contain a 30–60 second old response**: nonlive/transition resource TTLs, mismatched cache phases, upstream delay, or failure fallback. Normally established live resources have 12s, not 30–60s, configured TTLs. No ESPN cache age is inspected, so actual origin freshness cannot be proven.

The collector's `scheduleWindowCache` is constructed inside `createCollector`, and `createCollector` is called anew for each refresh. Its advertised 15-minute in-memory lifetime does not persist across canonical refreshes. D1 still provides the effective future-date cache.

## 3. Explicit answers: canonical feed, browser, detail, scoring

### A. Canonical feed

Provider work is **demand-driven after 12s**, typically each 15s-plus-work viewer cycle, plus minute cron. It is not fetched exactly every 12s automatically. With no viewers, cron is the only ordinary sports trigger. A new live game in an otherwise idle feed must first cross the 60s feed gate and possibly the 55s scoreboard cache.

Yes, browser `/feed` triggers provider work. Repeated polls reuse a snapshot only while not due, when another lease owns refresh, or when refresh fails; they do not necessarily wait for cron. `/feed` has no configured edge-response cache and no `caches.default` implementation.

Publication is **atomic at the revision-pointer level**, not one transaction covering all work. Parts are written before the header; a reader uses one header revision and gets all its parts or an error. The old revision survives ten minutes. Failed work before pointer switch leaves the old revision visible. History/resources may already have changed. An exceptionally delayed reader can lose old parts to cleanup. An expired 180s lease does not fence an old producer from publishing later, so a very long refresh can race a newer owner and regress the pointer. There is no renewal or ownership check immediately before publication.

`feed.updatedAt` is refresh START time. At response time its apparent age already includes the full job and post-publication cleanup. A feed may say recently updated while carrying older resources. During failures, it can lag indefinitely. Conversely a fresh header may be older than a newly fetched summary resource's wall-clock arrival.

### B. Browser

Visible/live 15s; hidden or idle 60s, subject to browser timer throttling/suspension. Scheduling is from completion (`finally`), not fixed wall-clock starts. Request time and parsing/local storage extend the cycle. Returning visible calls `loadLiveGames` immediately.

The in-flight boolean prevents overlapping feed fetches in one tab. Separate tabs, cron, and detail requests can overlap server work. Browser timeout does not guarantee server cancellation; the demand route has no explicit `waitUntil` ownership for completing ingestion after client disconnect.

The browser retains the last successful in-memory games on failure and marks them stale. Local storage holds preferences, remembered lines and rating history, not a separate source of current scoreboard cards. It rerenders on every completion, including unchanged feeds and failures. There is no local per-second clock interpolation; the clock moves with delivered data.

### D. Game detail

Opening a known game invokes `gameDetails`, but provider fetch occurs only if the shared summary resource is absent/expired. Detail has the same 12s live / 55s other resource TTL and an independent 15s URL lease. Normal hit: feed header/parts + resource payload + timestamp SELECT. Expired owner: those reads plus lease upsert, provider request, resource upsert and lease delete. Lease loser gets stale data immediately if a row exists; a cold loser returns an error.

Detail can be **fresher than feed**, because it fetches one summary on demand without waiting for a full canonical refresh. It can be **older than feed**, because the summary lags ESPN's scoreboard, stale fallback occurs, or the panel has remained open. `renderDetailContent` prefers summary scores but uses the captured game's rating and often its live phase. Therefore even a freshly opened panel can mix two versions. It does not apply the canonical summary chronology guard before displaying summary scores.

`render()` for the main feed does not refresh the open detail content or replace `activeDetailGame`. Repeatedly reopening can fetch fresher detail; merely viewing it does not. A visibility-aware, one-request-at-a-time detail loop could safely poll faster, but polls below 12s cannot guarantee new provider work with the current TTL. Detail and canonical refresh use **different leases**: canonical `refreshReader` bypasses URL leases. They can fetch/write the same summary concurrently, and an older resource write can overwrite a newer one. Faster detail polling should first resolve that coordination and add version checks.

### E. Excitement rating

`normalizeEvent` calls `rateGame` and `applyLiveSnapshot` on every collected scoreboard. Contexts can rerate the normalized game. `enrichGame` then validates summary chronology/teams/score before adding live enrichment. `applyLiveSnapshot` reconstructs live score from `baseScore + live.bonus`; accepted history, pressure, upset, and other components follow. All this completes **before feed publication**.

A lagging summary does not intentionally replace the fresh scoreboard. Summary rejection prevents stale predictions from governing the new state. A small compatible advance with unchanged scores may retain 90% (floored) of positive prior historical enrichment while progress difference is <=0.04; it sets `staleEnrichment`. A genuine score change does not qualify. A failed summary can publish the newly calculated scoreboard-based rating with `detailStale`.

Thus main-card score and base/live rating update together in one canonical object, but the rating's richer evidence can still be older, missing, or degraded. “Rating recalculated” does not mean every input was freshly fetched. The detail panel can explicitly show a new summary score with an older captured feed rating. Browser timeline reconstruction is separate from canonical card rating.

Some comments in `sports-feed.js` and a test assertion describe the browser using the saved pre-enrichment `game.scoreboard`. **Current `canonicalFeedGames` discards that nested property and uses the enriched top-level game.** Likewise the comment about a “60-game enrichment selection” is stale: the filter is not followed by a 60-game cap.

## 4. Latency budget

Let `U` = real event to ESPN endpoint availability, `J` = full ingestion/publication/response duration, `P` = browser delay after completion, `I` = interval between successful relevant provider acquisitions, `K` = additional cache/provider-age penalty, and `R` = parsing/render time.

For the initiating single viewer, healthy steady-state live `I` is approximately `P + J` when every request is due. Expected visible delay from provider availability is approximately **I/2 + J + R + K**, best roughly `J + R` for an event just before acquisition, upper normal single-cycle roughly `I + J + R + K`. These are useful approximations; summary acquisition occurs later than scoreboard acquisition within `J`.

For an independent cron/other-viewer producer, add the observing browser's residual polling delay (about P/2, up to P plus its request time). Do not count that delay twice for the browser that awaited its own ingestion.

| Scenario | Best | Typical planning range | Conditional adverse case |
|---|---|---|---|
| Existing visible/live; J assumed 2–5s | ~2–5s | ~10–20s | ~20–30s without extra cache phase; ~30–60s possible with cache/lease phase and an extra poll |
| Cron-only ingestion, 15s browser | ~J | ~30s + 7.5s + J, about 40–45s | ~60s + 15s + J; resource cache can extend it |
| Hidden tab | ~J when actually scheduled | ~30s plus job/poll alignment | Timer suspension has no finite upper bound |
| First live game after idle | ~J if lucky | Tens of seconds | 60s idle feed gate + up to ~55s cached scoreboard + next trigger/work; not a 12s guarantee |
| Current detail just opened | Request duration | Usually cached-summary age + request time | Stale fallback unbounded; panel left open unbounded |
| Recommended 10s live/browser, J improved to 1–3s | ~1–3s | ~6–10s | ~12–20s healthy, before extra cache phase |

All ranges exclude **U**, which is not measured and may dominate. They are not SLAs or observed percentiles. There is no finite absolute worst case during provider outage, repeated timeouts, tab suspension, or persistent publication failure.

Serial summary groups give a concrete tail mechanism: `J_summary ≈ sum(max(summary times in each group)) + group D1 flushes`. With 60 candidates, ten 7s timeout groups can approach **70 seconds**, before collection, SQL and serialization. With 180 candidates, the corresponding contribution can exceed the 180s global lease. One slow group can already push `/feed` beyond the browser's 10s timeout. The headline “7s provider timeout” is not a 7s refresh timeout. Scoreboard fan-out also contends for connection capacity; SQL has no application timeout bound here.

## 5. Bottlenecks and defects, ranked

1. **Healthy visible main feed: completion-based 15s polling and 12s eligibility.** This is the primary known intentional delay, not minute cron. Unknown ESPN latency may exceed it.
2. **Full-slate enrichment and persistence before publication.** Includes every completed game, upcoming games without a line, NBA/NHL schedule processing, parsing/scoring cached resources, and potentially slow summaries unrelated to the game being watched. Drives timeout and lease tails.
3. **Detail does not refresh at all while open.** Highest-priority UI freshness defect for game center; mixed summary/feed versions can disagree immediately.
4. **History scan on every refresh.** `priorPregame` passes `Math.floor(now/1000)-RETENTION_MS/1000` into a query against millisecond `observed_at`. The cutoff is ~1.8 billion instead of ~1.8 trillion, so effectively all retained contemporary rows qualify by time. There is no state-oriented index. Local query plan confirms a full index scan. Fixing units alone does not eliminate the scan over retained history; redesign this lookup or index it appropriately.
5. **Completed history grows every minute, even when unchanged.** `state==='completed'` is always eligible, with only minute-bucket deduplication. NFL completed games can remain through the weekly window; other sports keep completed games through their collection windows. Full normalized JSON is retained 30 days. This affects bill, storage limit and the scan above.
6. **Double cache / timestamp semantics / idle transition.** Locally new does not imply provider-new. A sport entering live state still starts with slower eligibility. Both resource and publication ages need explicit semantics.
7. **Leases suppress duplicate work incompletely.** Global refresh vs detail URL leases do not coordinate; global lease expiration lacks fencing; losing viewers receive old data; repeated failures have no failure backoff and may cause repeated provider retries despite unchanged canonical timestamp.
8. **Alerts are cron-only and can skip a busy tick.** `/feed` demand refresh never calls `checkGames`. Cron losing the refresh lease gets null and skips alert evaluation. Cron acquiring the lease while data is still fresh does return the existing feed and evaluates it. Brief threshold excursions between evaluated snapshots can be missed; faster demand refresh does not automatically accelerate alerts.
9. **NFL neighboring-week adapter defect.** In `fetchNFLWindow` the neighbor callback references `feed.url`, but `feed` is undefined in that scope. Nonempty neighbor results reject inside `Promise.allSettled` and are silently discarded after fetching. This is separate from latency but wastes requests and harms schedule completeness. Current mocked freshness tests do not cover nonempty neighbors with NFL week metadata.

## 6. Cloudflare pricing, limits and workload model

Official pages checked October 28, 2026. Workers Paid Standard: $5/month minimum, **10 million incoming requests/month**, **30 million CPU ms/month**, then $0.30/million requests and $0.02/million CPU ms. Waiting for network/DB is not equivalent to billed CPU. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

D1 Paid includes **25 billion rows read/month**, **50 million rows written/month**, **5 GB storage**; additional reads $0.001/million, writes $1/million, storage $0.75/GB-month. Scanned rows count, not just returned rows; index maintenance and deletes also count as writes. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Relevant limits: six concurrent connections waiting for headers, default paid subrequests 10,000/invocation, default HTTP CPU 30s (configurable), minute cron CPU 30s. The two-hour research cron has a different budget. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). D1: 1,000 queries per paid Worker invocation (a batch counts as one for this limit), 100 bound parameters, 2 MB row/string, 10 GB per database; the database processes queries serially. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

The repository declares D1 and Workers AI, but not Durable Objects, Queues or another scoring backend. AI research is separate and should not scale with score cadence. Preserve its existing budget controls. Account-wide usage by other projects and subscriptions also shares allowances; repository configuration cannot prove the account plan or remaining allowance.

### Model assumptions, not observed traffic

Use a 30-day month, 8 live viewing hours/day (864,000 seconds/month), remaining 16h/day at minute cron. During viewing: 10 live games, 20 completed games, 10 eligible upcoming summaries, 100 total feed games (2 parts), six active scoreboard URLs. Total collector URLs can be **28**: 10 base feeds, replace NBA/NHL base with 18 dated feeds (+16), plus up to two NFL neighbors. Fourteen are future dates; of the other fourteen assume six live, eight slower. A busy slate sensitivity is 40 live games / 150+ eligible summaries, not a claimed average.

For comparable arithmetic below, slower resources are approximated at 60s rather than their exact 55s; future resources at 900s. The ten live summaries plus six active scoreboards give **16 fast resources**. During idle hours, assume the 30 nonlive candidates and 14 nonfuture boards persist as a deliberately conservative steady workload. Live games disappearing and schedule windows changing can lower these totals; at 5s polling a 55s resource can refresh more often than the 60s approximation.

“Provider subrequests” below means outbound `fetch` attempts, including possible Cloudflare cache hits; actual ESPN origin requests may be lower. These are not additional incoming Worker requests. Each attempt has an implicit edge-cache lookup and possible fill; no explicit application Cache API operation exists for sports data. D1 cache reads/writes are modeled separately.

### Full-path cadence comparison

This compares hypothetical aligned fast-resource TTL and trigger targets. Merely requesting faster without changing 12s eligibility cannot achieve the 10s/5s rows. Request-driven demand must actually exist; cron cannot supply a subminute guarantee by itself.

| Fast target T | Full refreshes/month incl. idle | Provider subrequests/month | CPU at assumed 50–200ms/full refresh | Successful snapshot rows/month | Logical writes before indexes/deletes, approximate |
|---|---:|---:|---:|---:|---:|
| 60s cron baseline | 43,200 | 2.09m | 2.16–8.64m ms | 1.008m | 3.31m |
| 30s | 57,600 | 2.32m | 2.88–11.52m ms | 1.152m | 3.76m |
| **15s: current one-viewer approximation** | **86,400** | **2.78m** | **4.32–17.28m ms** | **1.440m** | **4.65m** |
| 12s: current high-demand eligibility ceiling | 100,800 | 3.01m | 5.04–20.16m ms | 1.440m | 4.95m |
| 10s | 115,200 | 3.24m | 5.76–23.04m ms | 1.440m | 5.25m |
| 5s | 201,600 | 4.62m | 10.08–40.32m ms | 1.440m | 7.07m |

Formulas: refreshes `864000/T + 28800`; fetch attempts `1854720 + 13824000/T`; snapshots `20*43200 + 10*864000/max(T,15)`; logical writes `fetches + snapshots + 5*refreshes` (2 part rows + header + lease acquire/release). Upcoming first snapshots, resource/part retention deletes, snapshot expiration deletes, indexes, failed attempts, alert state, detail requests and cron contention are extra. Successful history inserts plateau below 15s; attempted INSERT OR IGNORE work does not. For non-divisor cadence, bucket occupancy/phase changes exact counts.

This is a capacity model, not a bill forecast. Current completion-based requests usually produce fewer than the idealized 15s row; extra viewers can push toward 12s. Current 30s would be a slowdown while watched. Full scoring CPU is not measured: use production CPU ms, not local test elapsed time. The 50–200ms range is a sensitivity input. At 5s, 200ms exceeds the included CPU allocation before request-serving and research overhead; dollar CPU overage itself is small compared with potential D1 scans/storage.

### Incoming Worker requests and cache work

One tab for the assumed 8h/day generates approximately 28,800 / 57,600 / 86,400 / 172,800 feed requests/month at 30 / 15 / 10 / 5 seconds, before request-duration reduction. Add 43,200 minute cron invocations and 360 research invocations/month; background hidden tabs at 60s add 28,800 each for 16h/day. Detail requests are additional. Ten equivalent visible viewers at 5s yield ~1.73m feed requests, well within 10m before other traffic; 100 do not. Fresh feed reads still execute Worker/D1 because responses are no-store.

For G=100, a fresh `/feed` normally issues two D1 reads returning three rows (header + two parts). A due owner additionally reads previous feed, resource index, contexts, history, and resource payloads. A lease loser pays contention and reread costs. RefreshReader reads timestamps for **all retained resources**, including seven-day-old keys, once per job; let that count be R. Base resource-index row reads are `R * refreshes`. At R=1,000, current idealized 15s is 86.4m reads/month, 10s 115.2m, 5s 201.6m, before other work.

Warm resources still need payload SELECTs and JSON parsing each cycle. More rapid refresh therefore scales D1 lookup/CPU work even when provider TTL suppresses fetches. Public detail hit costs feed reads + two resource reads; an expired detail owner adds three logical writes for lease acquire, resource update and lease release. A detail poll reusing canonical ingestion may produce no extra provider fetch.

### The existing D1 scan can dominate all of those numbers

At steady state with 30-day retention, the illustrative history counts above are approximately retained row counts, too. One full pregame-history scan per refresh then implies:

| T | Rows visited/month by this one query, approximate |
|---|---:|
| 60s | 43.5 billion |
| 30s | 66.4 billion |
| 15s | 124.4 billion |
| 12s | 145.2 billion |
| 10s | 165.9 billion |
| 5s | 290.3 billion |

These are steady-state estimates using the locally observed query plan, not D1 telemetry. A newly empty database ramps up more slowly. Fewer retained games lower them dramatically; a populated account can already exceed included reads without changing polling. At the published rate, 124.4b reads is roughly $99 beyond the 25b inclusion **for that modeled query alone**, not a claim about the user's actual bill. A ~$5 observed invoice means this workload/history assumption is not yet realized, usage is lower, deployment differs, or timing/metrics need checking. Do not extrapolate a safe $5 bill from incoming requests alone.

At 1,844 bytes per snapshot, 1.44m rows are roughly **2.66 GB of JSON alone**, before indexes, row overhead, resource summaries and revision parts. At 7,422 bytes, the same row count would exceed 10 GB. The fixture median is not a guarantee of live size. Even the 60s scenario has ~1.01m rows because completed snapshots dominate. Persisting finals only when meaningfully changed is a much larger storage improvement than adjusting live refresh from 15 to 10 seconds.

At 40 simultaneous live games, fast resources become roughly 46 instead of 16. Live subrequests at 10s grow from 1.38m to 3.97m/month (plus slow work). Live snapshot rows rise from 576k to 2.304m with the same 15s buckets. Combined with completed history, this can exceed included storage even at fixture-median size. Under these conditions global 5s full refresh is unjustified without first bounding history and enrichment.

## 7. Architecture options

Latency figures exclude ESPN delay and assume healthy responses. `J` includes enrichment/history overhead. Provider rates below use the illustrative live window: fast resources/T plus ~0.65 slow-resource requests/sec. Faster browser polling by itself does not change a cron-only source.

| Option | Expected visible latency | Provider rate while live | D1 / usage | Complexity and races | Alerts and rating fidelity |
|---|---|---|---|---|---|
| A. Minute cron only, existing 15s browser | ~37.5s + J typical; ~75s + J upper normal | ~0.92/sec overall (all resources effectively minute) | Fewer refreshes, same dangerous history design | Simple; still requires lease and pointer safety | Minute alerts retained; full rating each minute, coarse evidence |
| B. Minute cron, browser 5s, no demand ingestion | ~32.5s + J typical; ~65s + J upper normal | Same as A | 3x feed reads vs 15s browser, almost no improvement in source freshness | Simple; no new ingestion race | Same alerts and ratings as A |
| C. Minute backstop + coalesced demand | **Already current.** ~10–20s at 15s browser; optimized 10s target ~6–10s | Current ~1.72/sec at 15s; ~2.25/sec at 10s | Full refreshes +33% versus current idealized 15s; modeled provider total +17%; scan issue must be removed | Moderate; existing global lease, fix detail coordination and fencing | Keep minute alerts; improve independent alert evaluation on lease loss; full rating pipeline preserved |
| D. Lightweight scoreboard cycle, slower summary/enrichment | 5s scoreboard/browser can target ~3–8s for basic state; rich fields slower | With boards every 5s, 10 summaries every 15s: ~2.52/sec including slow resources; far below full 5s | Lower summary fetch/parse load than full 5s; frequent small publication; history must be independent | Highest complexity: merge versions, single writer, fresh rating rebasing, context retention | Must recompute base/situation each fast cycle; historical components explicitly older; summary-only possession may lag; alerts require consistent canonical version |
| E. Retain existing 12/15s, fix critical-path overhead and add live detail loop | Main feed improves by reduction in J; detail stops freezing, ~10–20s with 10–15s detail loop | Near current, often lower after nonlive/final work dedupe | Best immediate resource reduction; avoid repeated final snapshots and full scans | Smallest practical change; same architecture | Preserve full scorer and minute alerts; fix mixed detail versions |

For option A's rate, `(14+40)/60 + 14/900 ≈0.92/sec` includes ten live plus thirty nonlive summaries. Option C/D rates depend on how many nonlive resources are still refreshed; remove repeated final summary work to reduce them further. These rates are request attempts, not measured ESPN origin hits.

Option D can preserve scoring correctness only if every current score/clock/situation recomputes the live/base model and cached summary evidence goes through the existing rejection rules. Simply overlaying scores onto an old rated object is unacceptable. It also cannot make summary-derived football situation or historical excitement evidence update at scoreboard speed without additional summary fetches. Keep one canonical writer rather than introducing independently racing feed publishers.

## 8. Recommended architecture and implementation sequence

**Use E as the preparatory work, then modestly tune the existing C.** Aim for 10s visible live refresh and 10s browser polling once measured complete-refresh duration is comfortably below the browser timeout. Preserve 60s idle/hidden and minute cron. Poll the visible open detail panel at 10s with the same canonical version discipline; consider a 5s selected-game mode only with a corresponding resource freshness policy and measurements showing benefit. There is no need for Durable Objects, Queues, WebSockets or another service.

Expected improvement is incremental because request-driven ingestion already exists: roughly **10–20s to 6–10s** healthy provider-to-main-UI latency if critical-path work drops to 1–3s, not a promised improvement from 60s to 5s. If J remains 2–5s, changing P from 15 to 10 alone saves only about 2.5s average polling residual. Fixing a frozen detail panel is much more visible than that.

The intended $5 budget is plausible for personal traffic **after** history work is bounded and measured. It is not supportable as an unconditional assertion for the current full-history scan. Do not change global live cadence until read/write/storage telemetry confirms headroom. Retain explicit CPU/D1 budgets and adaptive backoff when refresh duration, provider errors or lease contention rise.

Proposed sequence (none implemented):

1. Establish deployed/source parity and collect existing Cloudflare read-only metrics: Worker CPU/request counts, D1 rows read/written/size, refresh duration, provider latency/errors/cache age, candidate count and published age. Separate ESPN payload observation from fetch time and publication time. Record representative quiet, normal and Saturday college slates.
2. Fix pregame lookup units and eliminate the full-history scan, using a small game metadata lookup or an appropriate state/key index. Persist completed snapshots once per meaningful change, with a bounded final-correction window. Decouple history/retention frequency from feed frequency while retaining useful audit and live peak evidence.
3. Correct NFL neighbor metadata handling and TTL classification. Avoid frequent next-week/future/final summary refreshes. Bound candidates/work by priority without silently omitting rating-critical live summaries. Reuse immutable completed calculations when model/context/provider version has not changed.
4. Coordinate canonical/detail resource fetching under compatible ownership; prevent older resource timestamps and older feed revisions from overwriting newer ones. Ensure ownership survives client cancellation for bounded work, and add a refresh deadline/lease renewal or fencing. Decide explicitly whether losers return stale data or briefly await a committed revision.
5. Fix detail: one in-flight request, visibility-aware polling, close cancellation, selected-game identity/version guard, latest canonical game lookup on each render, chronology-consistent score/rating presentation. Do not let an old response overwrite a newly selected game.
6. Preserve alert semantics: on a cron lease loss, evaluate the last valid canonical revision if appropriate, with deduplication and revision ordering. If faster alerts are desired, explicitly move evaluation to serialized publication with idempotent threshold tracking; do not accidentally run duplicate alert checks from every poll.
7. Measure again, then tune live age/TTL and visible polling together to 10s; keep hidden/idle at 60s. Consider deadline-based scheduling with a single in-flight guard to avoid adding work duration to every interval, but never run a catch-up burst or overlapping requests. Use adaptive slowdown on large slates/errors.
8. Only if measured score latency still warrants it, trial option D internally with one canonical publisher. Use score/clock/period/possession changes to prioritize summaries, keep a maximum summary age, and retain 10–15s live rich-state refresh until scoring parity is proven. A 5s scoreboard lane is an optional later optimization, not the initial recommendation.

### Exact files/functions that would change

| File | Proposed functions/areas |
|---|---|
| `alerts-worker/src/sports-feed.js` | Constants/`refreshDue`; `refreshReader` and `providerJson` resource age/lease coordination; `refreshSportsData` candidate scheduling, timestamp semantics, snapshots, retention and fenced publication; `gameDetails` version metadata |
| `alerts-worker/schema.sql` and a new migration | Pregame lookup/index or compact metadata; optional resource/feed revision fencing metadata; do not rewrite historical migration |
| `alerts-worker/src/providers/espn.js` | `fetchNFLWindow` undefined `feed`; `fetchDailyWindow`/collector cache lifetime and resource categorization |
| `alerts-worker/src/index.js` | `/feed` bounded work lifecycle; scheduled handler lease-loss behavior; `checkGames` only if changing alert evaluation ownership |
| `app.js` | `liveRefreshDelay`, `scheduleLiveRefresh`, `loadLiveGames`; `openGameDetails`, `hideGameDetails`, `fetchGameSummary`, `renderDetailContent`, visibility handler |
| `alerts-worker/src/game-model.js` | `enrichGame` only if adding separated summary cadence; preserve stale-enrichment/score-change guards |
| `rating-core.js` / `scoring/` | No algorithm change needed for recommended 10s cadence; regression coverage required if introducing option D |
| `sw.js` | Shell version bump when eventually shipping frontend changes; retain network-only sports data |
| `alerts-worker/wrangler.toml` | Keep existing crons; optional explicit measured resource limits only; no new service bindings needed |
| `alerts-worker/test/sports-feed.test.js`, `alerts-worker/test/worker.test.js`, `test/startup-feed.test.js`, `test/live-score-regressions.test.js` | Refresh timing, leases, stale fallback, publication, alert and scoring regressions; add detail lifecycle coverage |

## 9. Required validation before any implementation ships

* Deterministic fake-time checks at TTL boundaries, variable request durations, first-live transition, completion-to-next-poll timing and hidden/visible transitions. Verify no overlaps or catch-up loops.
* Simulate separate edge-cache/D1 ages, unchanged ESPN payloads and independent scoreboard/summary lag. Check `updatedAt`, resource age and degraded indicators describe the correct thing.
* Concurrent cron/feed/detail callers, lease loser, expired owner, client abort, provider timeout, DB failure between parts and header, and cleanup while an old reader holds a revision. Verify no old revision/resource overwrites newer data.
* Reopening/switching/closing detail during fetch; live panel receives updates; older summary never rewinds canonical score/clock; rating is associated with the displayed canonical state.
* Fresh scoreboard with lagging summary at same clock/different score, wrong teams, final-summary/live-scoreboard disagreement, possession-only changes, overtime/intermission, baseball inning changes and tennis state. Compare existing model outputs and flags.
* History query plan and D1 row metrics: bounded work independent of retained live history; correct milliseconds; final corrections retained without one identical final row per minute; useful audit peaks and pregame recovery preserved.
* Alert threshold crossing during concurrent demand refresh, minute cron lease loss, degraded summary, first baseline, repeated revision and failed push. Confirm idempotency and understand that minute sampling can miss transient peaks.
* Replay a normal slate and a 150+ candidate slate with delayed summaries; measure p50/p95/p99 acquisition-to-publication, request timeout rate, CPU, resource fetch count, rows read/written, DB growth and response size. Validate the cost model with actual account metrics before faster cadence.

## Concise terminal summary

```text
Current: already demand-refreshed; 12s live eligibility, 15s-after-completion browser.
Practical latency: modeled ~10–20s after ESPN API availability; add unknown ESPN delay.
#1 healthy main-feed delay: browser cadence; #1 tail risk: full-slate enrichment/history.
Detail: fetch-on-open only; remains frozen while open.
Recommend: fix history/coordination/detail first, then 10s live + 10s visible browser.
Expected: ~6–10s healthy provider-to-UI if refresh work becomes 1–3s; not an SLA.
Usage: ~33% more full refreshes and ~17% more provider attempts in the example model;
       bounding scans/final-history writes should offset much more D1 work.
Budget: $5 plausible after fixes and telemetry; current history scan prevents a guarantee.
Validation: 28 focused tests passed. Report only; no implementation or deployment.
```
