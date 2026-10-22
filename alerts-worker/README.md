# Sports Radar alert Worker
Cloudflare Worker source for the one-minute Web Push service. See the repository's root README for deployment and iPhone setup.

## Central sports feed

`sports-feed.js` owns ingestion, persistence, freshness, and history. ESPN URLs and schedule-window selection live in `providers/espn.js`; `game-model.js` contains the normalization and summary enrichment moved from the browser. `rating-core.js` is unchanged by this migration.

- `GET /feed` serves the last published normalized feed, with `updatedAt`, `sourceErrors`, and `freshness`. Public reads never initiate scoreboard requests. Edge caching lasts 15 seconds; clients mark data older than two minutes as stale. A summary-only failure marks the feed as degraded and the affected game as `detailStale`; fresh scoreboards remain usable and incomplete games do not trigger alerts.
- `GET /game/:sport/:eventId` serves summary details for a game in the current feed. Details are shared through D1 and Cloudflare caching, with a D1 lease to coalesce concurrent misses. `sportsRadarFreshness` identifies cached/stale details.
- The minute cron refreshes data regardless of subscriptions, then evaluates alerts against the refreshed games. Failed scoreboard ingestion preserves the previous published feed and does not evaluate alerts against old data.
- Each game can include a `scoreboard` version before summary enrichment. The browser preserves its existing favorites/watchlist priority and 60-game enrichment selection using these two server-calculated versions. It does not acquire ESPN data or calculate the feed's ratings.
- NBA/NHL schedule windows use America/New_York calendar days; display dates still use the viewer's local timezone. Future daily schedules are cached for 15 minutes. Live resources are cached for 55 seconds.
- Live snapshots use `(game_key, observed_at)` with minute-resolution timestamps. Snapshots retain 30 days; raw resource caches retain seven days. Feed parts retain ten minutes to protect in-flight readers. Feed publication occurs only after all parts are written.

### Deployment order

1. Confirm the existing account authorization and Worker/D1 plan limits. Busy slates can exceed Free-plan per-invocation limits; do not enable billing or change plans without approval. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
2. Apply the additive schema with `wrangler d1 execute sports-radar-alerts --remote --file schema.sql` from this directory.
3. Run all root and Worker tests, `node test-score.js`, calibration report, syntax checks, and `wrangler deploy --dry-run`.
4. Deploy the Worker using existing authorization. Wait for a successful minute cron. Verify `/health`, `/feed`, a known `/game/...`, `/contexts`, and CORS from `https://mmueller091.github.io` before publishing frontend changes.
5. Verify snapshot rows, scheduled invocation success, and existing push infrastructure. Publish the frontend only after the backend is healthy, then inspect the Pages deployment and browser network traffic.

The migration tests use Node 22's built-in SQLite implementation to exercise the actual D1 SQL. The parity fixture contains expected ratings from 107 original browser fixtures. Its compressed input bundle retains the source event and summary fields consumed by the model, so these tests are independent of local calibration captures.

The historical parity check pins the original scoring core without changing its golden values. A separate 107-game comparison runs the original browser adapter and migrated Worker adapter against the current shared core. This preserves independently published scoring changes while detecting acquisition/normalization regressions from the migration.

### Included-usage guard

Research AI reserves from an 8,000-neuron daily allowance in the existing D1 database before calling the existing model. Reservations use conservative input-byte and output-token bounds and remain charged to the allowance if inference fails. Oversized requests, exhausted allowance, and unavailable quota storage use the existing deterministic research fallback. Prompts and classification rules remain unchanged for admitted requests. This leaves headroom beneath the 10,000-neuron free daily allocation; other account-wide AI workloads would consume that same allocation.

Workers Paid is usage-based: the base fee includes allowances, rather than an account-wide hard spending cap. Do not enable additional paid products or rely on overages. Monitor account-wide usage against the included CPU, request, D1 write/read, and storage allowances before increasing traffic or adding workloads.
