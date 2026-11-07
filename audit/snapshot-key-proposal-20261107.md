# Proposed exception for snapshot identity

Status: Option 1 explicitly authorized by the user on 2026-11-07 and implemented locally. Production migration and deployment remain conditional on every release gate passing. Existing records and timestamps must be preserved; stop on data loss or ambiguity.

The existing key is `(game_key, observed_at)`. An upcoming observation at a minute boundary and the first live refresh ten seconds later both legitimately have bucket timestamp `T`. Keeping both rows while retaining that key and timestamp policy is impossible. Moving either timestamp, overwriting the upcoming row, storing one observation inside another, or deferring the live insert would violate the requested semantics.

The smallest proposed exception is to change only the uniqueness key to `(game_key, observed_at, state)`. All eleven columns and their values remain unchanged. Upcoming timestamps remain minute buckets, live timestamps remain 15-second buckets, and completed timestamps remain actual refresh-start times. Equal-time lifecycle states are ordered upcoming, live, completed. Retries within a state/bucket still deduplicate; different states coexist. Unsupported conflicts and other insertion errors must remain visible.

SQLite requires a table migration to replace a primary key. The migration copies existing rows without changing any field, preserves row identity where used by maintenance, recreates the existing indexes, verifies counts and exact typed field equality, and commits atomically. The subsequent user authorization requires a production backup and a complete database-copy rehearsal before production migration. The old two-column uniqueness cannot be reinstated once legitimate collisions exist without losing records, so rollback must retain the expanded key and compatible consumer code.

## Consumer inventory and required companion corrections

Tracked repository searches found these runtime consumers:

| Consumer | Current assumption and proposed treatment |
| --- | --- |
| `alerts-worker/src/sports-feed.js` snapshot insert | Keep all bucket calculations, lease fencing, batch sizes and polling. Deduplicate the new three-part key; do not use replacement writes. |
| `snapshot-history.js:recoverPregameBaselines` | The subquery filters upcoming, but the outer join matches only game/time. Add the lifecycle predicate to the outer join so a colliding live row cannot replace the observed pregame baseline. |
| `snapshot-history.js:completedLookupSql` | Likewise constrain the outer completed-row join; preserve settlement and completed-content comparisons. |
| `snapshot-history.js:upcomingLookupSql`, `shouldSnapshot` | Existing lifecycle filters remain; repeated upcoming observations remain suppressed. |
| `snapshot-history.js:NFL_RECORD_SQL`, `recoverPregameRecords` | Preserve pre-final cutoff and team validation; define ties between retained upcoming/live rows without admitting post-final records. |
| `snapshot-history.js:gameHistory` | Read both rows and order equal timestamps by lifecycle. Expose unchanged timestamps and explicit states. |
| `snapshot-history.js:pruneSnapshots` | Preserve age limits, batch cap, unresolved-audit hold and latest-final retention. Rowid-based pruning must remain valid after migration. |
| `sports-feed.js:historicalSignal`, `gameDetails` fallback | Completed-only lookup already disambiguates state; latest-any-state fallback needs lifecycle tie-breaking. |
| `alerts-worker/src/index.js:/audit` | Keep all rows; deterministic equal-time lifecycle order preserves opening/final selection and peak live calculation. |
| `live-audit-worker/src/index.js` prior snapshot | Define latest-state tie-breaking at the existing cutoff. Preserve audit cadence and freshness rules. |
| `live-audit-worker/src/export.js:retainedTrajectory` | Timestamp-only pagination can skip a row at page boundaries. Use a full identity cursor and deterministic sampling order, maintaining existing row/byte budgets. |
| Export detail selection and upgrade | `byTime` currently collapses equal-time rows. Match details by game/time/state; keep query budgets and original references. |
| Export IDs and raw/source references | Include lifecycle state so two rows cannot share an observation ID or ambiguous reference. Legacy references without state must not silently select an arbitrary row. |
| `live-audit-worker/src/quality.js`, `trajectory-quality.js` | Preserve lifecycle-separated measurements and propagate an unambiguous source reference. Equal bucket timestamps do not establish elapsed duration. |
| `game-center.js:observations`, `connections`, `timeline` and app history/timeline helpers | Preserve the opening row as pregame and first live row as live. Pregame/final rows are not live curve anchors; equal timestamps must not fabricate a connection or duration. |

The offline November 3 replay builds a local two-column-key table and must reflect the new identity if it exercises new rows. SQLite test fixtures and schema assertions must cover migration and collisions. Existing frozen production captures and audit reports must remain unchanged. Tracked historical incident scripts referencing the old schema are historical evidence, not active writers; do not rewrite them.

## Required validation before release

Use populated SQLite databases to prove unchanged existing rows and indexes, valid rowid maintenance, both observations retained at all four live-bucket alignments, repeated refresh/retry idempotency, concurrent insert attempts, lease fencing, and upcoming/live/completed ties. Check pregame recovery, completed recovery, export pagination/detail upgrades across equal timestamps, unambiguous references, timeline classification/order and retention. Preserve subsequent 15-second live buckets. Keep the original deterministic near-start assertion unchanged.

This collision is separate from the USF–ECU 51-minute gap. The retained incident audit evidence shows integrity rejection suppressing snapshots; no missing observations will be invented or backfilled.
