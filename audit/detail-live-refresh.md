# Open game detail live refresh

Date: October 28, 2026. Architectural reference: `audit/live-latency-audit.md`.
No deployment. The existing history/storage optimization and NFL neighboring-week changes in this working tree are preserved.

## Previous lifecycle and races

`openGameDetails(id)` found a game in `games`, saved the object in `activeDetailGame`, showed loading, and fetched `/game/:sport/:eventId` once. `fetchGameSummary` used a private seven-second abort controller. `gameDetails` authorized the game against the stored feed, fetched/reused its summary resource, and returned summary freshness. The browser rendered summary scores with the captured canonical rating. Object identity guarded some switches, but closing did not abort requests; reopening the same object could allow an earlier response to win. There was no resource-version guard or refresh timer.

`loadLiveGames` fetched `/feed`, replaced `games` through `canonicalFeedGames`, and called `render`. Neither the selected object nor its content was refreshed. Thus score/rating could freeze, and opening the panel could mix summary scores with a different canonical rating. Canonical summary acquisition used `refreshReader`'s deferred batch writes, bypassing `providerJson`'s URL lease. Concurrent requests and deferred old writes could regress stored summaries. Detail freshness was read separately from its payload, potentially labeling an older payload with a newer timestamp.

## Implemented lifecycle

```text
open / switch
  -> invalidate generation, abort previous request, clear timer
  -> select game, fetch detail
  -> accept only current selection generation + nondecreasing resource version
  -> resolve latest canonical game by sport + ID, render
  -> visible and live? wait 10 seconds after completion -> fetch again

/feed accepted -> replace canonical games -> render open panel with latest game
  live -> final -> render final immediately -> one final detail attempt -> stop

hidden -> clear timer + abort/invalidate
visible -> immediate live refresh (or interrupted final attempt) -> normal cadence
close -> abort/invalidate + clear selection and timer
```

Only one current request is active; no wall-clock interval or catch-up burst. The seven-second timeout now covers JSON parsing as well as receipt of headers. Nonlive games fetch on opening. Visibility cancellation preserves a pending final attempt. A final transition during an existing live request schedules the final attempt ten seconds after that request completes. A failed final attempt retains prior rich content and stops; reopening permits another attempt.

Failures retain the last accepted summary, mark it stale, and retry live games after the normal ten seconds. Canonical feed updates continue to render during detail failures. Temporary removal from the feed retains the most recent selected canonical object and marks available rich content stale. Ordinary feed updates never capture a replacement object in an old request callback.

## Authority and ordering

The canonical game alone supplies current team identity, score, phase/status, rating, explanation and moment. The summary supplies rich historical content (box scores, players, plays and scoring history), never the current scoreboard or rating. Ahead summary scores wait for canonical publication just as behind summary scores cannot rewind it.

`SportsRadarDetail.validateLiveSummary` reuses `refreshLiveState`'s existing team, score and chronology rules through a validation-only early return. It neither mutates the game nor calculates a rating. The public `SportsRadarScore` API, formulas and outputs remain unchanged. Because `sourceCompetition` is non-enumerable and absent from `/feed`, the browser reconstructs validator inputs from canonical teams and `liveRawStatus`. Nonlive state disagreements are also marked stale. A valid same-score advance may contribute rich content; the canonical clock/rating remain unchanged. Incompatible rich content is explicitly labeled as potentially behind or ahead using the existing cached-detail message.

Every selected-panel lifetime has a generation; switch, close and hiding invalidate it and abort. Responses must match both generation and the active request object. Resource timestamps cannot decrease. Feed responses older than the browser's accepted `updatedAt` are ignored. These guards also handle rapid A -> B -> A selection and transports whose cancellation arrives late.

## Worker coordination and impact

Both canonical and detail summary reads now call `providerJson` under the same URL lease. The per-refresh request map still coalesces duplicate reads. Scoreboards retain indexed-cache/batch acquisition, with monotonic resource upserts. Only the same summary contends; a detail request does not hold the global canonical refresh lease or block other games. A lease loser rereads and uses available data, marked degraded; a cold loser fails safely rather than launching a duplicate provider fetch.

The summary owner rechecks the resource after acquiring the lease. Its atomic `INSERT ... SELECT ... WHERE EXISTS` requires the matching lease owner; the upsert additionally requires a strictly newer timestamp. An expired owner displaced by a successor cannot write. After commit/rejection/error, the returned payload and timestamp come from the same row, not independent reads. Owner-qualified release cannot delete the successor's lease.

`sportsRadarFreshness` carries resource `updatedAt`, canonical `updatedAt`/revision, request `receivedAt`, and stale status. These are acquisition/request times, not verified ESPN observation times.

A fresh detail cache hit performs no D1 writes and no provider fetch. An expired owned resource still uses lease acquire, conditional resource write and release. Canonical summary misses now pay those per-resource coordination operations instead of a batched resource write. This is an intentional bounded coordination cost; cache hits bypass lease writes. Additional visible detail requests perform feed/resource reads and may refresh expired summaries, but never add snapshot/history writes. The unchanged 12-second resource TTL means a ten-second browser request can reuse cached content. Provider coalescing is per URL, not a promise of ten-second upstream updates.

## Files and functions changed for this task

- `app.js`: `loadLiveGames` revision guard; `renderDetailContent` canonical scoreboard/status; `fetchGameSummary` external controller and body timeout; `openGameDetails`, `hideGameDetails`; new `stopDetailRequest`, `latestDetailGame`, `renderActiveDetail`, `syncActiveDetail`, `refreshActiveDetail`, `detailVisibilityChanged`; integration in `render` and visibility listener.
- `rating-core.js`: validation-only branch in `refreshLiveState`, separate `SportsRadarDetail.validateLiveSummary` export. No scoring algorithm edits.
- `alerts-worker/src/sports-feed.js`: `refreshReader`, `providerJson`, `gameDetails`; shared summary ownership, conditional writes and payload-bound freshness. Existing snapshot/history policy is unchanged.
- `index.html`, `sw.js`: application/core asset revisions and shell cache version for the eventual frontend release.
- `test/detail-live-refresh.test.js`: fake timers, deferred transport, canonical markup and real chronology-validator checks.
- `test/startup-feed.test.js`: older feed rejection.
- `alerts-worker/test/sports-feed.test.js`: SQLite/provider contention, successor fencing, cache-hit write accounting and timeout fallback.
- `audit/detail-live-refresh.md`: this report.

## Validation

Focused checks cover start, one request, completion timing, hidden/visible, close, rapid switching and same-game old generations, resource ordering, canonical replacement/disappearance, older feed rejection, final transition including in-flight/hidden cases, nonlive fetch-on-open, transient failure, summary lag/advance, wrong teams, final/live disagreement, OT/intermission display and unchanged canonical ratings. SQLite tests exercise canonical/detail same-resource contention, stale-owner writes and matching returned versions, zero-write cache hits, and provider timeout. Existing suites cover browser/Node/Worker scoring parity, NFL A-P, CFB A-Y, NHL, completed scoring, pregame cap, alert behavior, history optimization, final dedupe and neighboring weeks.

Final commands:

- `node --test test/*.test.js alerts-worker/test/*.test.js`: 357 passed, zero failures. Includes frontend VM tests and bundled Worker execution. esbuild required a run outside the filesystem sandbox because parent-directory reads were denied.
- `node test-score.js`: score model, watchlist and timeline fixtures passed.
- `node scripts/cfb-calibration-report.cjs`: passed (25 synthetic cases, 14 relative assertions, 16 NFL cases, 50 real CFB fixtures).
- `node scripts/nhl-calibration-report.cjs`: passed (25 provider fixtures). Report movements are comparisons against its archived calibration baseline, not changes introduced here.
- `git diff --check`: passed.

## Limits and eventual release

No production latency or provider probes were performed. Provider timestamps and cross-region edge-cache age remain unknown; local resource ordering cannot detect every newly received but upstream-regressed payload. Chronology checks prevent those payloads from governing the displayed canonical scoreboard. Rich historical fields may temporarily lag or lead it and are labeled when validation detects disagreement. A temporarily missing live game retains its loop until canonical state returns, the panel closes, or the document hides. Cold lease contention may show the fallback until the next normal attempt. Final rich detail gets one attempt, not an indefinite correction loop.

Main-feed polling remains 15 seconds visible/live and 60 seconds hidden/idle; canonical live eligibility remains 12 seconds. Alert cadence, bindings, scoring, pregame cap and D1 snapshot/history policy are unchanged.

This task requires no migration. When deployment is later authorized: ensure the earlier history optimization's separate migration is already applied if shipping that existing working-tree work, deploy Worker coordination first, then publish frontend/core/assets together. Nothing was deployed during this task.
