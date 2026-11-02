# Tennis Grand Slam coverage release

## Scope and identity evidence

This release restricts coverage; it does not change scoring semantics. Work is isolated at `C:/Users/mmuel/Documents/Codex/tennis-grand-slams-20261102`, based on production `6c87aab89017343e144b726c2349f350606425b2`. The original dirty checkout is untouched.

ESPN site-v2 ATP and WTA scoreboards were retrieved for the final day of each major in 2024 and 2025 (16 requests). Selected unmodified tournament metadata and individual match records are in `alerts-worker/test/fixtures/tennis-grand-slams/`; each file records its exact source URL and capture time. Full tournament/group/round identity inventories are in `espn-identity-evidence.json`. The fixture selector keeps one qualifying and one verified main-draw match per adult draw where available. It does not rewrite match scores or format metadata.

| Tournament | ESPN base ID | Accepted normalized names |
| --- | --- | --- |
| Australian Open | 154 | Australian Open |
| Roland-Garros | 172 | Roland Garros, French Open |
| Wimbledon | 188 | Wimbledon, The Championships Wimbledon |
| US Open | 189 | US Open, U S Open |

Identity requires an allowlisted `baseId-YYYY` edition, matching `season.year`, `major: true`, and exact corroborating names. Case, punctuation, apostrophes and whitespace normalize consistently; a matching edition year may prefix/suffix a name. Every supplied name must agree. Names alone, `major` alone, and broad substrings never admit an event. Annual edition changes do not require new allowlist entries; an unknown base ID fails closed.

Adult grouping/type IDs are `1` men's singles, `2` women's singles, `3` men's doubles, `4` women's doubles, `6` mixed doubles. Supplied ID/slug/name metadata must agree. Match `tournamentId` must agree with the parent's base ID. Main-draw round IDs `1`–`7` require corroborating Round 1–4, Quarterfinal, Semifinal or Final labels. Qualifying IDs `11`, `12`, `14`, unknown rounds, junior/wheelchair/exhibition labels and contradictory metadata fail closed. The 2024 Australian Open source includes an anomalous men's `15 / Group Stage` entry; this remains excluded as ambiguous.

Both feeds can contain every adult draw under the same major and match IDs. ATP and WTA are independently collected through the existing resource cache, then deduplicated by `sport:matchId`, preserving existing identity and detail routes. Two shared scoreboard discovery requests are needed to discover current coverage; excluded tournaments cause no participant normalization, scoring, per-match provider request, enrichment, snapshot write or research AI call. The research subsystem already excludes Tennis.

## Boundaries and retained behavior

- The collector rejects excluded tournaments before normalization and excluded draws/rounds before competitor work.
- The publication boundary, stored-feed reads (inline and multipart), browser ingestion, notification preference eligibility, and queue's current-game eligibility apply the same shared policy in `tennis-coverage.js`.
- Current coverage requires the provider's tournament start/end window. Stale prior majors cannot fill an out-of-season feed; missing dates fail closed. There is no fixed calendar or invented annual schedule.
- Main scoreboard, Tennis filters, Game Center listings/search, rankings and watch recommendations all consume the filtered canonical `games` collection. The Tennis empty state explains the four-major scope.
- Existing snapshots, raw caches, favorites, sport preferences, subscriptions and watchlists are not destructively migrated. Cached excluded scheduled/live matches cannot resolve through the current Game Center API. Completed historical bookmarks remain readable as explicitly archived/stale records, without re-entering current listings.
- Scoring modules, global weights, model version (`2026-11-01.audit-integrity.3`), experiment defaults, set-score inference, timelines, evidence protections and partial-history disclosure are unchanged. Provider `format` values are retained verbatim, including unusual mixed-doubles data; no new scoring rules or detailed point state are inferred. Scoreboard-only started matches retain partial evidence and existing alert suppression.

## Validation and rollback

Focused tests cover all 16 verified ATP/WTA tournament samples, all five adult draw types, season/name variations, nested/flat structures, duplicate feeds, missing/conflicting identity, qualifying and unsupported draws, unrelated Open events, existing non-major captures, current windows, inline/multipart cache reads, publication fencing, API/archive distinction, preferences/history preservation, and both new/queued alert exclusion. Tests retain the earlier captured adapter score/evidence controls as explicitly labeled synthetic major-metadata scenarios; original non-major captures are preserved and asserted excluded.

Frontend controls verify the shared policy before any current consumer, actual application empty-state behavior and repeated refresh, and service-worker caching of the new policy asset with the existing storage-preserving revision upgrade. The complete regression suite, score fixtures, calibration report, site build, syntax checks and Wrangler dry-run are release gates.

Existing rollback tags and Cloudflare versions are preserved. The immediate pre-release source is `6c87aab89017343e144b726c2349f350606425b2`; the active Worker version before this release is `19039379-a2f7-4639-bb09-f1306f174b15` (100% traffic). No D1 migration or data deletion is required for this coverage change. Roll back the Worker using the established Wrangler rollback command to that exact version and republish the prior source through the existing `main` Pages workflow if necessary. A rollback intentionally restores prior Tennis coverage; it does not require reversing history or preference changes.

Production deployment and final observation results are recorded separately after validation.
