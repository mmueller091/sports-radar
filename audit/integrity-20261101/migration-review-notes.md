# Independent migration review

Reviewed `alerts-worker/src/sports-feed.js` and `refresh-policy.js` after the first release rollback. The review used local fixture providers and in-memory SQLite; it did not call production endpoints or send notifications. Production sources were not edited by this reviewer.

Two blocking defects in the first migration draft were reproduced and corrected by the implementation agent:

1. Changed-version validation of already-enriched rows consumed the migration reserve before untouched rows could run. The mixed 485-game control stalled at **187 → 187 pending**. Exact failing output is preserved in `migration-review-progress-before.log`. Pending enrichment now runs before those validations, and validation has its own visible pending marker that keeps subsequent work bounded.
2. A five-minute-old cached **live, Q4 6:00, 14–14** summary was accepted for a current **final, 20–14** scoreboard. The initial implementation marked only `detailStale`, then wrote one completed historical snapshot without a partial qualification. `migration-review-stale-final-before.json` preserves that result. Migration caches now require matching lifecycle, team identity, and scores; otherwise the code obtains compatible current data within the reserve or publishes explicit pending/partial evidence.

Independent commands after correction:

```powershell
node --no-warnings --test alerts-worker/test/audit-refresh-migration.test.js > audit/integrity-20261101/migration-review-after.log 2>&1
node --no-warnings audit/integrity-20261101/migration-review-repro.mjs
node --no-warnings audit/integrity-20261101/migration-review-repro.mjs --provider-still-stale
node --no-warnings audit/integrity-20261101/migration-review-repro.mjs --missing-cache --provider-fails
```

All **5 migration tests passed**. The mixed fixture comprises 259 completed non-Tennis games, one live game, and all 225 captured Tennis matches. Enrichment pending counts converge **187 → 115 → 43 → 0**; deferred cache validation also converges after resource versions settle. Every poll publishes within the unchanged simulated 25-second budget. Live acquisition runs first. Old-model rating sentinels are never relabeled. Pending games and their nested scoreboard objects carry matching partial evidence labels, and pending finals do not enter completed history.

The independent stale-final probe additionally verified three outcomes, recorded in `migration-review-provider-*-after.json`:

| Provider outcome | Publication | Completed snapshots |
| --- | --- | --- |
| Returns a compatible final | Current-model final; pending absent; detail fresh | 1 |
| Continues returning the stale live resource | Current-model partial; enrichment pending on game and scoreboard | 0 |
| Cache missing and provider throws | Current-model partial; enrichment pending on game and scoreboard | 0 |

Code review confirms deferred validation retains the original input metadata instead of claiming that a new cached version was processed. Validation-pending rows remain partial and are reconsidered on later polls. Successful validation re-enriches a fresh normalized row to clear the temporary qualification. Live acquisitions retain their current-state validation path and occur before nonlive migration work. Tennis is excluded from unsupported summary work and therefore receives no permanent summary-pending marker.

**No remaining release blocker was found in this reviewed scheduling diff.** The 7-second publication reserve is a bounded scheduling policy, not proof of production latency. Cloudflare/D1 timing and current public detail consistency still require the release coordinator's full gates and another production smoke. Historical ratings and the scoring model are unchanged by this scheduling fix.
