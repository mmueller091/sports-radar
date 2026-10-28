# Canonical refresh optimization

October 28, 2026. Base release: `dd4ce08`. Implemented locally; **not deployed**. No scoring formulas, calibration targets/fixtures, global pregame cap, alert thresholds, products, bindings, browser timeout, or 12/15/10/60-second cadence changed.

## 1. Production failures addressed

The preceding [production measurement](production-latency-usage.md) found two timeouts among five scheduled feed probes, an 11.489-second feed invocation, 133–254-second-old successful responses, and a zero-live slate with 132 summary candidates. Completed snapshots changed solely because `DraftKings` and `Draft Kings` alternated. Worker wall-time p95 was 73.647 seconds, but that aggregate was not a canonical-job percentile.

This patch removes repeated unchanged enrichment from publication, bounds ownership and HTTP waiting, fences commits, and adds the stage timings needed to verify the result after a separately authorized deployment. Local fixture work counts are evidence of eliminated work, not production latency claims.

## 2. Original critical path and lifecycle

`GET /feed` read the header and parts, evaluated 12-second live / 60-second idle eligibility, acquired a global 180-second lease, reread freshness, loaded resource timestamps, collected provider scoreboards, normalized/scored games, flushed resources, recovered NFL pregame records, applied current contexts, selected summaries, processed all candidates in groups of six, enriched/scored them, persisted snapshots, serialized/wrote parts, unconditionally switched the header, cleaned retention tables, released the lease, and finally returned HTTP.

The minute cron entered the same pipeline through `ctx.waitUntil`, followed by existing alert evaluation. The HTTP path did not register refresh lifetime with `waitUntil`. The browser aborted at 10 seconds; this did not constitute reliable server cancellation or guarantee execution of `finally`. A lease loser returned null immediately and the request reread the previous feed. An abandoned lease could block acquisition until its 180-second expiry. Header writes had no owner/expiry or revision-order fence.

Collection, current normalization/context application, and changed/live rating inputs must precede publication. Historical record recovery must precede scoring. Snapshot persistence remains before publication to preserve ordering, NFL pre-final recovery, and audit evidence. Cleanup and revalidation of already-compatible nonlive enrichment were on the request path due to implementation structure rather than a requirement to change that published canonical state.

## 3. Root causes and scope

- Candidate membership depended on state/line presence, without proving whether inputs had changed. Every completed game and every eligible upcoming game still lacking a line could trigger repeated acquisition and enrichment.
- Provider acquisition, per-resource lease/DB operations, and serial batches amplified wall time even on a quiet slate.
- A single request lifecycle owned both delivery and maintenance, without a bounded HTTP wait or explicit HTTP continuation lifetime.
- Lease ownership and header ordering were separate: an expired producer could still publish.
- Final semantic comparison included cosmetic provider spelling.

These mechanisms are established from source and deterministic tests. The previous production stall's exact causal chain was not traced; this report does not claim proof that every stall was an orphaned lease.

## 4. Final-snapshot normalization

`providerIdentity` normalizes only `line.provider` during semantic comparison: trim, lowercase, collapse whitespace, and explicitly alias `draft kings` / `draftkings`. Stored and displayed text is unchanged. Punctuation is not deleted; `Draft-Kings` remains distinct. Other providers remain distinct identities.

Spread, total, moneyline, score, rating, factors/history, records, other canonical fields, and model-version changes still create corrections under the existing one-minute final-correction bound. Acquisition flags remain excluded as before. Existing history indexes, retention, live 15-second buckets, and upcoming existence rules are unchanged.

## 5. Candidate classification and priority

Candidate eligibility is unchanged; work selection is new:

| Class | New behavior |
|---|---|
| Live | Always eligible, acquired/enriched first; existing 12-second TTL and chronology guards |
| New game, state transition, scoreboard/scoring input change | Cannot reuse; critical acquisition/enrichment |
| Context or model change | Cannot reuse; critical acquisition/enrichment |
| Upcoming with a scoreboard line | Same noncandidate behavior as before; freshly normalized |
| Upcoming without a line, but successfully enriched previously | Reuse only with matching inputs and summary evidence; a provider's absence of a line is not treated as a fabricated line |
| Unchanged completed | Reuse matching enrichment; revalidate expired resources after publication |
| Changed cached summary | Hash comparison detects change; enrich from that cached correction before publication |
| Failed acquisition without certified metadata | Retry on the critical path; never certify a failed acquisition as reusable |
| Reused nonlive resource older than 120 seconds | Preserve output but mark `detailStale` and degraded source errors; schedule revalidation |

Live acquisition runs before nonlive cache inspection. Changed completed candidates precede changed upcoming candidates. There is no `slice(0,N)` eligibility cap. Groups of six bound concurrency, not the number of eligible games. Cached payload reads also run with a six-request concurrency bound so 132 version changes do not create 132 serial D1 round trips.

## 6. Safe reuse

A small `enrichment` map is persisted in the existing canonical header. Each eligible game's metadata contains:

- SHA-256 fingerprint of the freshly normalized/context-applied game, full source event, and model version;
- model version;
- summary resource timestamp/version;
- SHA-256 fingerprint of the summary content, with deterministic object-key ordering.

Reuse requires matching game state, model, and input fingerprint, plus a previous successful summary fingerprint. Live games never use this shortcut. Full source inputs are included conservatively: an unfamiliar provider input change forces recomputation rather than risking an incorrect cache hit.

If the summary resource version matches, there is no summary payload read, parse, or enrichment. If its timestamp changed, read/hash it: identical content reuses output; changed content runs the original `enrichGame`. Context and model changes invalidate even when the summary is unchanged. No ID-only reuse exists.

Scoreboard collection, normalization/base scoring, and context application still run. They establish safe inputs; this patch does not pretend to eliminate that work. A version-changed but content-identical resource still requires parsing/hash comparison. No new cache table, service, or persistent telemetry table is introduced. Metadata grows the existing header and public feed somewhat.

## 7. Publication versus maintenance

Phase 1 retains current scoreboards, fresh normalization, current contexts, all live enrichment, changed/new rating-critical enrichment, history, parts, and header commit. Failure of this phase leaves the old header intact. A summary provider failure retains the existing degraded-scoreboard fallback behavior; deadlines fail the whole attempted publication rather than silently dropping remaining live candidates.

After the fenced header switch, a waiting HTTP caller can receive the new revision immediately. The global canonical lease is released before network maintenance. Retention cleanup and expired, unchanged nonlive summary revalidation follow under the same overall deadline.

Nonlive TTL remains **55 seconds**. Revalidation is moved, not stretched to an arbitrary long TTL. A separate key in the existing lease table, `summary-maintenance`, prevents duplicate sweeps. The sweep orders resources oldest-first, runs six at a time, and stops at the job deadline. It uses existing per-URL ownership shared with details and canonical acquisition.

Maintenance writes resources only; it does not mutate published games, history, or the header. A genuine correction found after publication enters the next canonical revision through the resource-version/content check. Failed maintenance cannot rewrite the just-published error array or score. Persistently old rich data is explicitly degraded in subsequent revisions.

**Deliberate boundary:** new/changed nonlive games whose correctness requires enrichment can still gate publication. Reusing an incompatible prior rating merely to finish faster would be incorrect. Cold starts and mass transitions are therefore not promised to behave like the warm quiet fixture. History was not deferred because its cross-refresh ordering is meaningful.

## 8. Ownership, browser cancellation, and bounded waiting

- Canonical lease: **30 seconds**, owner-qualified acquisition/release, no renewal loop.
- Shared job deadline: **25 seconds**, measured with a monotonic clock, covering critical work and maintenance together.
- Provider timeout: existing **7 seconds**, combined with the job cancellation signal.
- HTTP refresh wait: at most **8 seconds**, excluding the initial D1 feed read and response serialization/network transit; no frontend timeout increase.
- The entire refresh promise is registered with the request's real `ctx.waitUntil` before awaiting it. Returning early or aborting the browser does not cancel the independently owned job.
- A publication promise wakes the HTTP caller as soon as a complete revision commits, without waiting for cleanup or revalidation.
- If nothing commits in budget, return the previously read valid feed with its original `updatedAt` and freshly computed age/staleness. With no prior feed, return the existing warming-up/503 response.
- A contender loses the D1 lease and does not start duplicate collection. It can return the prior valid revision promptly.
- Deadline/failure runs qualified release. A killed isolate or failed release leaves at most the short lease lifetime, not the former 180-second lease. Actual next recovery also depends on the next request/minute cron and provider/D1 health.
- Early collection failure aborts and drains sibling provider requests; they are not left running outside the registered lifetime.

Cloudflare documents up to 30 seconds of HTTP continuation after response/disconnect through [ctx.waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/). The 25-second job budget leaves room for cancellation/release. This is bounded best-effort continuation, not a durable queue or guaranteed retry service.

## 9. Publication fencing and atomicity

The header switch is a single SQL statement conditional on:

1. the `refresh` lease still matching the owner;
2. its expiry exceeding both the supplied current job time and SQLite's current time;
3. the new ISO `updatedAt` being strictly later than the committed header's `updatedAt`.

Parts use an owner-qualified revision key, `refreshStartMilliseconds:ownerUUID`. Thus an old producer cannot corrupt a successor's parts even if attempts share the same start millisecond. Parts are inserted before the header switch; failed or fenced attempts can leave harmless unreferenced parts, not a partially exposed feed. Readers continue to select only the header's exact revision. Snapshots are also owner/expiry-guarded and retain `INSERT OR IGNORE` behavior.

Old numeric revisions remain readable. The existing `sports_feed_parts` table is not STRICT and uses a composite primary key, so its INTEGER-affinity revision column accepts the new text keys without migration. This is covered by tests against the unchanged schema and consistent with [SQLite flexible typing](https://www.sqlite.org/datatype3.html) and [D1 binding conversion](https://developers.cloudflare.com/d1/worker-api/). Cleanup casts the timestamp prefix to INTEGER, supporting both formats, and retains the existing ten-minute reader grace period. This small retained-parts scan does not scan snapshot history.

Lease release always includes owner. An old producer cannot release a successor's lease. Equal/older headers are rejected even if the caller otherwise holds a valid lease.

## 10. Failure recovery and alert behavior

On provider collection failure, deadline, missing critical DB operation, or publication fence loss, the prior coherent revision remains available. No timestamp is refreshed to disguise old canonical data. The next eligible caller can acquire after normal release; failed release/isolate termination is bounded by the 30-second lease.

Maintenance failure after commit returns the committed revision and logs incomplete maintenance. Retried source resources remain coordinated by per-URL leases. D1 operations already dispatched cannot be forcibly canceled by the application; deadline checks stop new stages and SQL expiry fencing blocks late header commits. An 8-second refresh wait does not bound a completely stalled initial D1 read or guarantee an end-to-end network SLA.

Minute cron still runs refresh and then the unchanged `checkGames` policy on the resulting nonstale feed. Alert thresholds, scoring, subscription handling, dedupe, and provider-failure suppression are unchanged. As before, a global lease loser does not independently evaluate alerts. Maintenance can delay cron's post-refresh check up to the shared budget; it cannot extend the job through unbounded revalidation.

## 11. Observability

One structured `canonical_refresh` completion log reports:

- trigger (`cron`, `feed`, or direct test), owner, start time;
- outcome, publication/reuse state, lease acquisition/loss/fencing/release failure and acquisition duration;
- publication elapsed time and total duration;
- collection, record recovery, context lookup, summary work, snapshots, serialization/part writes, header publication, cleanup, and maintenance timings;
- candidate/live/critical/reused/cached-enriched/deferred counts, cached summary reads, successful revalidations;
- provider request/failure/timeout counts and degraded resource count.

`canonical_feed_response` logs reused/stale flags and age for due HTTP requests. No headers, client IPs, subscription identifiers, tokens, or user-specific data are logged. No new per-request D1 telemetry write is required. Existing header metadata is reuse state, not an accumulating timing history.

A later audit should calculate **publicationMs** percentiles separately from **totalMs**, filter by trigger/outcome/live count, and check timeout/fence/lease outcomes. This avoids mistaking a cheap stale response or long maintenance pass for a canonical-job duration.

## 12. Deterministic fixture results

No real network is used. The fixture exercises the actual collector, normalizer, scorer, D1 SQL, history, and publisher with stubbed provider responses.

| Work | Old eligibility/pipeline | New warm quiet publication | New live-plus-large-slate publication |
|---|---:|---:|---:|
| Games | 295 | 295 | 298 |
| Upcoming / completed / live | 263 / 32 / 0 | 263 / 32 / 0 | 263 / 32 / 3 |
| Eligible candidates | 132 | 132 | 135 |
| Nonlive outputs reused | 0 | 132 | 132 |
| Critical summary acquisitions/enrichments | 132 | **0** | **3 live** |
| Critical provider-summary groups | 22 | **0** | **1 live group** |
| Deferred eligible revalidations | 0 | 132 | 132 |

The old work count follows the unchanged eligibility predicate and the old six-wide algorithm; the first cold run also performs those 132 critical acquisitions. Warm runs are measured through the actual new pipeline's publication callback and provider call counter. The live fixture holds unrelated nonlive summary responses unresolved and proves the new live revision is already committed and the global lease released.

With all synthetic responses healthy and instantaneous, maintenance still revalidates **132 summaries** after quiet publication. **Total provider work is not claimed to drop from 132 to zero.** On the next run, all 132 summary timestamps have advanced but payloads are unchanged: 132 cached payload reads/hash checks, bounded concurrency six, **132 output reuses and zero repeated enrichments**. Normalization of all scoreboard games remains.

Local elapsed milliseconds are intentionally not a performance target. Removed acquisition/lease/scoring work on the publication path, bounded response behavior, and preserved output parity are the useful assertions. Reproduce using `node --test alerts-worker/test/refresh-optimization.test.js`; it prints `HEAVY_FIXTURE` and `LIVE_FIXTURE` summaries.

## 13. Expected resource impact

- **Worker:** less repeated rich enrichment/scoring for unchanged nonlive games, but input hashing, scoreboard normalization, and maintenance still cost CPU. New timing logs and modest header metadata add overhead.
- **D1:** same-version reuse avoids summary payload reads and per-URL lease work before publication. Changed versions still require payload reads; six-wide concurrency prevents a serial chain. Revalidation retains cache/lease writes, with one maintenance lease acquire/release per sweep. Final snapshots no longer churn on the demonstrated provider alias. No persistent telemetry rows or new history scans.
- **Provider:** existing TTLs and eligible games remain; unchanged nonlive acquisitions move after publication and are deadline-limited/coalesced. Total fetch reductions depend on deadline, contention, cache sharing, and traffic. No unmeasured monthly savings claim.
- **Storage:** small reusable hash metadata in the current header; final alias dedupe reduces unnecessary retained rows. Old history is not rewritten or deleted by a migration.

## 14. Known limits

This is not a production performance measurement. A cold deployment has no reuse metadata; first-load/mass-input changes can still be expensive, and many slow live/changed candidates can exhaust the 25-second budget. The safe result is the old coherent feed, not omitted rating-critical data. Provider or D1 outages can still cause prolonged staleness; the patch removes a particular long ownership blockage, not every source of stale feeds.

Unchanged nonlive corrections found during maintenance become canonical on a later eligible refresh. Deadline-limited sweeps prioritize oldest resources, but do not guarantee a maximum correction-discovery delay during sustained overload. Expired rich-data freshness is exposed. Six-wide resource reads bound concurrency but still have a D1 cost. Current normalization/base scoring is intentionally retained to establish correctness.

Revision IDs are now opaque strings for new publications; consumers in this repository use them only for identity and continue to use `updatedAt` for chronological comparison. External consumers must not assume new revision IDs are numeric. The checked-in schema's non-STRICT behavior is required; a separately modified STRICT production schema would require an explicit schema plan before deployment.

Already-running old Worker code does not acquire the new fencing behavior retroactively. A mixed-version deployment/rollback interval must be observed until old-version work drains. Rollback to the old cleanup implementation would not age out new text revision keys correctly; prefer a forward fix or retain the compatible cleanup/fencing code if preparing a rollback.

## 15. Validation

- New focused optimization tests: **25 passed**. Covers provider aliases and genuine corrections; quiet and live heavy fixtures; cached-read concurrency; summary/context/model/score/state invalidation; deferred corrections and failures; atomic multipart publication; owner expiry, successor fencing and qualified release; cron/feed contention; actual request-signal abort plus registered lifetime; bounded response; provider deadline cancellation; failure recovery; stale flags; cancellation/draining of sibling requests; timing fields and absence of new telemetry-table writes.
- Final `node --test test/*.test.js alerts-worker/test/*.test.js`: **382 passed, 0 failed**. Includes Worker bundle execution, all scoring graph parity checks, 107-game browser/Worker parity, NFL A–P, CFB A–Y, NHL/completed scoring, history indexes/buckets, neighboring NFL schedules, detail cache/coordination/10-second lifecycle, and alert behavior.
- `node test-score.js`: passed score-model and watchlist/timeline fixtures.
- `node scripts/cfb-calibration-report.cjs`: exit 0 (25 synthetic cases, 14 relative assertions, 16 NFL cases; retained provider fixtures).
- `node scripts/nhl-calibration-report.cjs`: exit 0 (25 provider fixtures). Its before/after labels compare the repository's historical calibration baseline, not changes introduced by this patch.
- `git diff --check`: passed.

An initial sandboxed full-suite run could not let esbuild traverse the parent directory. Re-running the unchanged test command with local filesystem access passed; no test was weakened. No scoring source, calibration fixture, or expected score was changed.

## 16. Files and deployment requirements

Implementation: `alerts-worker/src/sports-feed.js`, `alerts-worker/src/refresh-policy.js`, `alerts-worker/src/snapshot-history.js`, `alerts-worker/src/index.js`.

Tests: `alerts-worker/test/refresh-optimization.test.js`. Documentation: this report.

**No migration, new binding/product, frontend deployment, or cadence change is required.** When separately authorized: deploy the Worker as one bundle against the existing indexed schema; observe old-version invocations draining and the new structured logs; allow successful refreshes to populate reuse metadata; then repeat the production latency/usage audit during a representative live slate. Keep 12/15 and completion-based browser scheduling while measuring. Do not infer GREEN for 10/10 from these local tests.

Nothing was deployed or intentionally changed in production during this implementation task.
