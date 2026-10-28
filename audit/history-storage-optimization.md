# First history/storage optimization pass

October 28, 2026. Implements the backend history and NFL schedule portion of `live-latency-audit.md`. No scoring formulas, model version, NHL/CFB/NFL calibration, browser code, live refresh interval, or Cloudflare bindings changed. Nothing was deployed.

## Changes

| File | Purpose |
|---|---|
| `alerts-worker/src/snapshot-history.js` | Indexed upcoming/final lookups, bounded NFL record recovery, canonical final comparison and persistence eligibility |
| `alerts-worker/src/sports-feed.js` | Uses the history helper; persists changed finals at actual observation time; assigns adjacent schedule TTL |
| `alerts-worker/src/providers/espn.js` | Removes undefined neighboring callback reference; supplies explicit adjacent-resource purpose |
| `alerts-worker/schema.sql` | Includes three new partial indexes for new databases |
| `alerts-worker/migrations/0002_history_lookup_indexes.sql` | Additive, idempotent index migration for existing databases |
| `alerts-worker/test/history-storage.test.js` | Ten focused regression tests, including populated-database query plans |
| This report | Design, evidence, cost model and rollout instructions |

## Root causes and design choice

The previous upcoming lookup selected distinct game keys across the retained snapshot table on every refresh. Its timestamp argument used seconds against a millisecond column. Correcting the units alone would still leave a retained-history-dependent lookup.

NFL completed-record recovery was a different lookup: it paged pre-final snapshots, validating JSON and records in JavaScript until it found a usable record. A long or malformed game history could require many pages. Both paths now have bounded, indexed reads.

The smallest design that also preserves existing historical data is **partial indexes on the existing snapshot table**, rather than a new metadata table plus backfill/dual-write logic. No snapshot rows are deleted, rewritten, or reduced by the migration. Existing valid records become immediately searchable when indexes are built. The build itself necessarily reads history once; that is migration work, not recurring feed work.

Three indexes:

1. `sports_snapshots_upcoming(game_key, observed_at DESC) WHERE state='upcoming'`.
2. `sports_snapshots_completed(game_key, observed_at DESC) WHERE state='completed'`.
3. `sports_snapshots_nfl_records(game_key, sorted_team_id_1, sorted_team_id_2, observed_at DESC)`, a partial expression index restricted to valid NFL upcoming/live record snapshots.

The third index validates JSON, sport/event identity, two distinct nonempty team IDs, pre-final state and both record strings. The SQL record predicate implements the existing `digits-digits[-digits]` syntax, using GLOB, allowed-character checks, nonempty components and hyphen count. It uses the same stored `pregameRecords[index]` or team record fallback as normal historical recovery. The full predicate is checked into the schema/migration and repeated verbatim in the runtime SQL so SQLite can select the partial index. Keep those definitions synchronized; tests detect a broken plan.

Team IDs are sorted only for the index key. Returned records still map by team ID through the unchanged `preservePregameRecords`, preserving home/away order changes. A post-final record is never inferred backwards. Recovery excludes observations at/after the earliest retained final; absent a final, it uses the previous-feed/current-time cutoff as before. It applies the existing 30-day cutoff in **milliseconds** and reads at most one valid record payload per missing NFL game.

## Before/after query evidence

Tests create the old schema, insert **7,000 snapshots** (5,000 unrelated games plus 1,000 valid and 1,000 invalid observations for one game), inspect the old plan, apply the migration twice, and verify row count remains unchanged. The new plans are asserted on this populated database.

### Before

```sql
SELECT DISTINCT game_key FROM sports_snapshots
WHERE state='upcoming' AND observed_at > ?;
-- Old binding: floor(now/1000) - RETENTION_MS/1000
```

Observed SQLite plan before adding indexes:

```text
SCAN sports_snapshots USING INDEX sqlite_autoindex_sports_snapshots_1
```

Dependency: visits retained history, including live/final rows unrelated to the current slate. The old NFL recovery additionally used `ORDER BY observed_at DESC LIMIT 100 OFFSET ?` and could page through the target game's history to reject invalid/wrong-team rows.

### After: upcoming existence

```sql
WITH keys(game_key) AS (VALUES (?),(?),...)
SELECT game_key FROM keys k WHERE EXISTS (
  SELECT 1 FROM sports_snapshots s
  WHERE s.game_key=k.game_key AND s.state='upcoming'
    AND s.observed_at > ? LIMIT 1
);
-- Binding: now - RETENTION_MS, in milliseconds
```

Observed relevant plan:

```text
SCAN k
SEARCH s USING COVERING INDEX sports_snapshots_upcoming
  (game_key=? AND observed_at>?)
```

`SCAN k` visits only the explicit list of current game keys, in batches of at most 40. It is not a snapshot-table scan. Each existence check stops at its first index match. The cost is proportional to current upcoming keys and B-tree seeks, not retained snapshot rows.

### After: NFL pregame record recovery

The actual query in `NFL_RECORD_SQL` uses the complete partial-index predicate, then:

```sql
AND game_key=? AND min(team_id_1,team_id_2)=?
AND max(team_id_1,team_id_2)=? AND observed_at>=?
AND observed_at < COALESCE((
  SELECT MIN(observed_at) FROM sports_snapshots
  WHERE game_key=? AND state='completed'
),?)
ORDER BY observed_at DESC LIMIT 1;
```

Here `team_id_1/2` abbreviate the JSON extraction expressions shown in the migration, not new columns.

Observed plan:

```text
SEARCH sports_snapshots USING INDEX sports_snapshots_nfl_records
  (game_key=? AND <expr>=? AND <expr>=? AND observed_at>? AND observed_at<?)
SEARCH sports_snapshots USING COVERING INDEX sports_snapshots_completed (game_key=?)
```

Invalid record rows never enter the partial index; wrong-team rows are excluded by equality on the two indexed IDs. `MIN` seeks the first final and the outer ordered limit fetches the latest eligible valid record. There is no pagination, retained-history scan or temporary sort.

### After: final comparison

For each current completed game, a correlated ordered `LIMIT 1` finds the latest retained final timestamp, then joins the snapshot by its primary key to read the payload and model version.

```text
SCAN k
SEARCH f USING COVERING INDEX sports_snapshots_completed
  (game_key=? AND observed_at>?)
SEARCH s USING INDEX sqlite_autoindex_sports_snapshots_1
  (game_key=? AND observed_at=?)
```

Only one final payload per requested game is returned. Larger history increases B-tree depth logarithmically; it does not increase rows enumerated by these lookups. Query plans are local SQLite evidence, not production D1 metrics. Production query metrics should still be checked after an authorized rollout.

## Snapshot policy

**LIVE:** unchanged 15-second buckets and `INSERT OR IGNORE`, same full normalized payload and 30-day retention. Live timeline fidelity and persisted excitement peaks are unchanged.

**UPCOMING:** retains one snapshot while an upcoming observation exists inside the retention window, now checked by requested game key with the correct millisecond cutoff. Existing pregame data remains available to recovery/calibration.

**COMPLETED:** first observed final is written. Later refreshes compare canonical content with the latest persisted final, independent of the in-memory feed. Identical content produces no INSERT. A meaningful correction remains eligible and is written when at least 60 seconds have elapsed since the latest final snapshot. This bounds correction writes to one per minute per game without a short hard deadline that would discard legitimate late corrections. Corrections remain eligible while the game is collected and its history retained; a skipped correction is reevaluated on subsequent refreshes, never marked as persisted prematurely.

Final observations use the actual refresh-start millisecond timestamp rather than rounding down to the minute. This avoids placing the first final in an earlier live snapshot's bucket and allows the existing first-final cutoff to accurately separate live records from finals. Upcoming and live bucket timestamps are unchanged.

The comparison sorts object keys recursively and retains array order. It includes canonical scores, rating/base rating, explanations, factors, historical components, normalized state, records, broadcast/context and other canonical fields. Model-version changes also warrant a new observation. It ignores the nested scoreboard duplicate and these acquisition/presentation fields: `detailStale`, `staleEnrichment`, `lastSummaryAccepted`, `summaryState`, `favorite`, `updatedAt`, `freshness`. A different property insertion order or refresh timestamp cannot create another identical final.

The stored snapshot remains the complete existing normalized payload (excluding the nested scoreboard), not the reduced comparison representation. This pass does not begin storing raw summary boxscores: a raw stat correction creates a new snapshot if it changes canonical content. A raw field that was never stored and changes no canonical field cannot be audited through snapshots, just as before.

Limitations: a transient correction that reverts within the 60-second correction interval may not be recorded, as minute-bucket history also could miss transient updates. Canonical feed updates are never delayed by this persistence gate. There is no unlimited guarantee of final corrections after a game leaves the collector. Existing stale/degraded enrichment may change canonical ratings and therefore warrant a snapshot; this task does not alter scoring or provider error behavior.

## NFL neighboring-week fix and freshness

`fetchNFLWindow` previously fetched neighbors successfully, then referenced undefined `feed.url` inside their callback. `Promise.allSettled` hid the resulting rejection and dropped nonempty results. The redundant assignment is removed; `gamesFromScoreboard` has already assigned the correct `providerPath` from its valid feed argument.

The collector now marks explicit neighboring-week requests with `purpose:'adjacent-schedule'`. The resource reader assigns them **900,000ms (15 minutes)** in D1 and **900 seconds** in outbound `cf.cacheTtl`, reusing the existing future-schedule policy. Current live NFL scoreboard eligibility remains **12 seconds**. Global feed live/idle gates, browser cadence and summary TTLs are unchanged.

An adjacent week containing a **known live game in the previous canonical feed** retains the 12-second live policy; a postponed game should not be slowed merely because its week differs from the base scoreboard. A newly discovered live neighbor becomes eligible for that policy next refresh. If a cached adjacent schedule transitions to live before any feed has observed it, discovery can wait for the schedule TTL; the ordinary current-week scoreboard stays live-fresh.

Regression fixtures include current week 8 plus nonempty completed week 7 and upcoming week 9. All three games are returned with correct week keys and provider paths. Tests verify D1 reuse before 15-minute expiry, refetch at expiry, current scoreboard's 12-second fetch TTL, and the known-live-neighbor exception.

## D1/storage impact: proved versus modeled

| Area | Before | After | Evidence/model |
|---|---|---|---|
| Upcoming existence | Retained-history scan every refresh | Indexed seeks for current upcoming game keys | Proven local query plan, correct cutoff tests |
| NFL record recovery | Paged validation over pre-final game history | First-final index seek + one valid record row by game/team IDs | Proven populated-history query plan; invalid/newer/wrong-team cases tested |
| Final snapshots | Eligible INSERT per completed game/minute bucket, even unchanged | First final + meaningful corrections, at most one/minute | Full refresh test survives feed deletion/restart and verifies corrected final |
| Live snapshots | 15s buckets | Same | Full refresh test retains consecutive live rows; no new deletion policy |
| Static NFL neighbors | Could fetch at 12s while NFL live, then drop nonempty results | Consumed; 15-minute resource TTL | Provider/TTL regression tests |

Illustrative arithmetic, **not measured production savings**:

* A database with one million retained snapshots and 1,000 refreshes incurs roughly one billion row visits from the old upcoming scan alone. With 100 upcoming games per refresh, the replacement performs roughly 100,000 short indexed existence checks instead, plus B-tree overhead. Other queries, retention work and resource reads are not eliminated.
* A final game retained in the feed for 24 hours previously could occupy roughly 1,440 minute-bucket rows. If unchanged it now occupies one final row; if it receives two distinct persisted corrections, three rows. Existing duplicate rows are not retroactively deleted; their storage falls through normal retention.
* A single static adjacent resource continuously requested at the 12s eligibility ceiling could receive 300 fetch attempts/hour; a 15-minute TTL permits about four/hour once warm. Two static neighbors scale correspondingly. Actual demand cadence, fetch duration and edge caches change origin-call counts. Known-live neighbors are intentionally exempt.

The new indexes have storage and write-maintenance costs: upcoming/final snapshots maintain their respective index; valid NFL upcoming/live rows maintain the record index. Index construction reads existing history once. The existing age/primary-key indexes remain. This is a trade of modest index maintenance for removal of repeated scans and duplicate final payloads, not zero-cost reads/writes. No account usage, invoice, real row size distribution or production savings were measured.

## Migration, deployment order and rollback

**A D1 migration is required to get the indexed performance guarantee.** It adds only indexes. The new code remains logically functional without them but may scan history, so deploy the indexes first. The old Worker is compatible with the new indexes. Do not reapply `0001_scoring_audit.sql`; it contains a non-idempotent column addition and was not changed.

Nothing below was executed against production. If/when deployment is authorized, from `alerts-worker`:

1. Confirm the target database and take the normal restore/export precaution. Apply/test `0002_history_lookup_indexes.sql` against a local or staging copy with realistic retained history; allow for index-build time/storage.
2. Apply **only the new additive index migration** to the existing production database:

   ```powershell
   npx wrangler d1 execute sports-radar-alerts --remote --file=migrations/0002_history_lookup_indexes.sql
   ```

   This explicit-file path does not assume that the legacy `0001` file is registered in Wrangler's migration ledger. If the project uses a managed migration ledger, register/apply 0002 through that established process instead, ensuring 0001 is not replayed.
3. Verify all three indexes exist and the recovery/existence queries use them on the target schema. Inspect D1 error and size metrics before continuing.
4. Deploy the Worker only after successful migration:

   ```powershell
   npx wrangler deploy
   ```

5. Verify canonical feed and NFL record recovery, live history, final transition/correction counts, NFL schedule inclusion, and D1 query metrics. Frontend deployment is not needed; no browser assets changed.

Rollback: restore the prior Worker version first. Leave indexes in place; they are compatible and preserve data. Removing them is optional after rollback and would remove the performance guarantee if the new Worker were redeployed. Existing snapshots and newly stored corrected finals remain readable by the old code. Old code resumes redundant final writes and old lookup behavior. No reverse data migration or snapshot deletion is required.

## Validation

Focused suite: **20/20 passed**, including 10 new history/storage tests and 10 existing feed/scoring tests.

Full suite: `node --test test/*.test.js alerts-worker/test/*.test.js` — **339 passed, 0 failed, 0 skipped**. An initial sandboxed run failed only because esbuild was denied a parent-directory read; the complete local suite passed when rerun with the needed filesystem access. No production access was involved.

Also passed:

* `node test-score.js` — score, watchlist and timeline fixtures.
* `node scripts/cfb-calibration-report.cjs` — CFB A–Y and embedded parity checks.
* `node scripts/nhl-calibration-report.cjs` — NHL synthetic/provider replay.
* `git diff --check`.

Coverage includes NFL A–P, CFB A–Y, NHL calibration, global pregame 90 cap, completed NFL unbeaten-start significance, stored provider fixtures, and browser/Node/Worker scoring parity, including actual Worker bundling. The regenerated tracked calibration reports have **no content diff**. Their printed historical-baseline deltas describe earlier scoring calibration, not changes from this optimization. Scoring files and model version are untouched. Neighboring NFL events that were previously erroneously omitted now appear intentionally; other fixture rating outputs remain unchanged.
