# SlateMeter alert Worker
Cloudflare Worker source for the one-minute Web Push service. See the repository's root README for deployment and iPhone setup.

For the SlateMeter domain release, follow [the coordinated migration guide](../SLATEMETER-MIGRATION.md). No schema migration is required for that release. CORS explicitly permits `https://slatemeter.app` and the legacy `https://mmueller091.github.io` origin; the Worker URL and device authorization workflow remain unchanged.

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

### Automatic discovery and scoring evidence

GDELT is dormant: no scheduled caller, enablement flag, retries, or scoring promotion. Cached GDELT evidence is rejected. ESPN league/team news and previously captured source snippets continue to supply discovery hints for NFL, NHL, NBA, MLB, CFB and men's college basketball. Ranked college games receive priority and existing unranked exploration slots remain. Wikipedia supplies periodic exact-pair historical hints, never scoring proof.

All providers share **six requests per run**. On ordinary passes, two slots are reserved for bounded source verification; the other four rotate among league feeds and spare CFB team lookups. Periodic Wikipedia passes reserve one slot and rotate five league feeds. Unused slots make no requests. The existing limits remain **three AI requests**, 30 games, 60 snippets, four snippets per game and **8,000 reserved neurons per day**. AI classification cannot certify a fact. No service, credentials, plan, cron, table or subscription is added.

Evidence hierarchy:

- **Authoritative primary:** explicit objective statements from trusted team/league releases or a named head coach's transcript can qualify. League commentary and player opinions do not suffice. Current claims must identify a subject, owning team and the unique scheduled game date. Sport-specific starter roles, injury importance, first-appearance significance and expiration are checked.
- **Independent reporting:** two trusted publisher identities must report the same subject, team, type and game date, with distinct named original sources explicitly attached to that claim. Shared authors, wire copies, duplicate text, shared original links, attribution to the same source and unsupported AI confidence fail. Different domains alone never suffice.
- **Durable history:** authoritative records can establish exact-pair rivalries and eligible previous-season postseason meetings without fresh articles for each game. The reviewed CFB registry retains its source/date/pair/expiry safeguards; the separately reviewed Alabama-LSU history is the only registry addition. It carries no rating override.
- **Single-source information:** directly supported, current, relevant snippets can appear as `editorial_storyline`, `editorialOnly: true`, `verification: single-source`, `scoringEligible: false`. Their headline is retained; AI cannot invent an explanation or scoring effect. Unsupported and speculative claims fail closed.

Version 7 scored cache rows retain source documents, the exact passage, verification rationale, subject, ordered opponents, event ID, start time and expiration. Every read reconstructs the evidence decision and existing injury significance; missing, expired, modified or mismatched proof cannot score. Legacy scored rows have no exemption and become informational only if still relevant. Personnel facts are deduplicated across fresh and cached evidence before the unchanged scoring weights and caps apply. Full source bodies stay in research storage; public factors contain compact source metadata, the passage and rationale.

Source verification follows observed links on configured official indexes, or retained ESPN article links and their actual references. It never fabricates article URLs. At most two HTML requests are allowed, with seven-second deadlines, manual redirects, a one-MiB response limit, 32,000-character article-body limit, 100 inspected clauses, 24 retained documents and a 768-KiB serialized document-cache limit. A failed source backs off six hours. Only structured article bodies are accepted; opaque pages, redirects and ambiguous language remain unverified. The source-identity catalog is deliberately limited and falls back to each sport's league index. It does not promise exhaustive source coverage. Categories without sufficient objective, game-bound evidence remain informational.

Current facts expire no later than seven days after publication or twelve hours after the scheduled start, whichever is earlier. Historical source documents may be reused for one year after retrieval, with opponents and eligible season checked anew. Completed/uncertain events are rejected. A major trade needs explicit material first-appearance significance, so a completed debut cannot award the following games.

The policy covers league/team feeds, cached feed snippets, AI classifications, NFL summary/team news and extracted preview clauses, old editorial reviews, legacy D1 rows and dormant GDELT rows. Sports ingestion, live formulas, notifications and audit infrastructure are unchanged. The only UI change is the user's requested removal of a Key Storylines entry when its sentence already appears in Pregame outlook; unique stories and links remain.

**Release gate:** compare every upcoming rating and complete factor ledger against production and obtain explicit deployment approval. No production data mutation, push or deployment is authorized by passing tests. A release that preserves an existing legacy factor must first have its automatically acquired source evidence available in the shared cache; otherwise the safe default is informational-only. The prepared preload is an approval-gated release artifact, not an executed mutation. Rebuild the existing static bundle with the Worker when deployment is approved so the reviewed registry matches on both sides; the existing UI receives only the requested duplicate-story suppression.

Workers Paid is usage-based: the base fee includes allowances, rather than an account-wide hard spending cap. Do not enable additional paid products or rely on overages. Monitor account-wide usage against the included CPU, request, D1 write/read, and storage allowances before increasing traffic or adding workloads.
