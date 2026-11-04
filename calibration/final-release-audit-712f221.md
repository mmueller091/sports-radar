# Final release-readiness audit — November 3, 2026

Target: **712f221**, `calibrate/live-underdog-20261103`. **NO-GO for that commit unchanged:** it can repeat a notification across scoring-model versions, and publishing its older UI would omit production `3d14f00`.

The local candidate on `audit/live-underdog-release-20261103` applies the unchanged calibration as `254be17` above production `3d14f00`, plus the narrow notification repair below. **GO for this patched, production-based candidate, with the inherited Iowa metadata caveat disclosed below. No deployment or push; release requires the user's approval.**

| Release gate | Result |
|---|---|
| Every new 85/90 state and factor ownership | PASS: no implausible new upset award; no further recalibration |
| Partial evidence, first observations and model baselines | PASS: no partial alert or release-time baseline burst |
| Repeat notifications across models | Original FAIL; patched PASS, including actual SQLite concurrency |
| Expanded regular-season NCAAM / late NBA archive | PASS: eight extra games; all three late-NBA possession conditions |
| NCAAM/NBA maturity, markets, clocks and comeback controls | PASS |
| NFL/CFB narrow-lead correction and existing situation logic | PASS |
| Other-sport exhaustive scoring preservation | PASS: all 8,747 MLB/NHL comparisons byte-identical; Tennis/Soccer controls pass |
| Current production UI, explanations, timelines and budgets | PASS: byte identity, preservation tests and unchanged budgets |
| Full integrated suite and local packaging | PASS: 1,825/1,825 tests, 128 files, zero failures/skips; build and Worker dry run |

## Rating changes and threshold review

Across the original 92 games and eight added games: **100 unique games, 21,262 reconstructed states, 21,234 numerical comparisons and 28 jointly withheld zero-clock transitions**. There are **1,761 changed ratings and 638 changes of at least three points**. The [original 198-row review ledger](output/live-underdog-material-changes-20261103.csv) and [additional 497-row ledger](output/release-basketball-material-20261103.csv) include every material change and every 75/85/90 crossing in either direction. Smaller changes and full factor breakdowns remain in the linked JSON ledgers.

| Sport | Games / rated states | Changed | Changes ≥3 | Total-rating delta | Newly 85 / 90 states |
|---|---:|---:|---:|---|---:|
| NCAAM | 9 / 3,426 | 937 | 407 | −12 to +6 | 7 / 13 |
| NBA | 8 / 3,617 | 747 | 230 | 0 to +7 | 0 / 0 |
| NFL | 31 / 5,449 | 9 | 1 | 0 to +3 | 0 / 1 |
| CFB | 52 / 8,742 | 68 | 0 | 0 to +2 | 10 / 1 |

The [individual crossing audit](final-release-crossings-20261103.md) independently replays both engines, verifies source hashes, and reviews phase, clock, score, accepted closing market, current WP, possession, evidence and all factors for **17 newly 85+ and 15 newly 90+ states across six games**. Their increases are only +1/+2. **Nine partial states across three games cannot alert.** The remaining 23 states across three games are only conditionally eligible; these comparisons establish neither a chronological crossing nor a fresh publication, subscriber preferences or absence of a previous notification. They are not 32 notifications. Every original downward 85/90 crossing is also inspected; the supplemental archive adds no upward 85/90 crossing.

Concrete examples:

- Iowa +6.5 trails Illinois 39–41 at H2 14:02, WP 28.4%, possession unknown: **84→85**, upset 0→1. Purdue +5.5 trails Arizona 43–44 at H2 14:01 with possession, WP 38.1%: **84→85**.
- Florida +13.5 leads Texas 27–24 at Q4 4:21, WP 71.72%, possession unknown: **84→86**. Kentucky–Oklahoma, Oklahoma State–Iowa State and Titans–Colts partial states remain ineligible regardless of their totals.
- Memphis +15.5 leads Iowa State 32–31 at H1 5:29: **58→46**, upset 14→2, the largest archived reduction. Its H2 13:10 tie at 48–48 becomes **52→58**; its 53–50 lead at 12:04 becomes **71→62**. Non-upset factors are unchanged.
- Brooklyn +13.5 leads Boston 102–99 at Q4 5:34, WP 53.3%, possession unknown: **61→68**, the largest archived NBA increase. Its peak is **77→82**. At three seconds, trailing 114–117 with the ball and 4.7% WP, it remains **70→70**, upset zero.
- Notre Dame–Villanova, 70–68 at 0:48: **85→80**, entirely from upset 9→4 after overlap discount; other factors stay unchanged.

## Iowa–Illinois: genuine stakes and inherited metadata

Raw provider notes verify the **Elite Eight**, so substantial postseason context is justified. The old model already scored H1 19:26 at 87 and the first H2 18:36 tie at 90; this patch produces 87 and 91. The exact first-91 ledger is baseline 12 + transient context 12.552 + persistent postseason 20 + tension 30 + upset 1, rounded to 76, then recovery 6 + WP swing 4 + trajectory 4.758, rounded to 91. Illinois's recovery from ten down and Iowa's continuing underdog threat are distinct facts; the new award receives a correlation discount. Persistent stakes are removed from transient carry, trajectory replaces sustained history inside the existing cap, and current WP earns no second bonus.

**Known inherited metadata caveat:** tournament seeds 3/9 are interpreted as poll ranks, adding 13 opening points; broad “Championship” matching also calls the stage “Final round.” A labeled seed-removal diagnostic, retaining postseason stakes, changes the early 87 to 74 and first second-half 91 to 85. These are not corrected historical observations. This is a real existing evidence-label issue, not a newly excessive upset factor; it is documented for separate metadata work to preserve the prior calibration required here. The [factor audit](final-release-crossings-20261103.md) quantifies its contribution at every affected Iowa state.

## Evidence coverage and sport safeguards

The [supplemental basketball report](final-release-basketball-20261103.md) covers six ordinary-season NCAAM games and two NBA games. Memphis supplies close states in both halves; Brooklyn supplies **55 late-Q4 one-possession states: four confirmed underdog possession, seven opposing, 44 unknown**, including trailing states in all categories. Famous older upset archives without verified closing markets correctly earn no invented market credit. Source URLs, capture times and hashes are retained. Every added completed-game score/factor and every reconstructed opening score remains unchanged.

Adjacent-clock controls keep Wofford 16–15 at **50/50/50** for H1 6:01/6:00/5:59, with no 35%/70% jump above ordinary one-point rounding. NBA retains its lower cap and slower maturity. Missing/stale/live/unverified markets, missing or stale WP, period transitions, expired clocks and impossible comebacks pass. The +11 NCAAM final-shot increase (75→86, down one with the ball and two seconds) is explicitly a controlled simulation; unknown/opposing possession score 55/43, and seven-/fourteen-point deficits earn zero upset credit. No synthetic state is presented as historical evidence.

The [separate controlled-simulation audit](../audit/final-release-712f221/controlled-crossings.md) reproduces all seven hypothetical newly high rows (five at 85, two at 90); all are partial and alert-ineligible. Its [complete material ledger](../audit/final-release-712f221/controlled-material-changes.csv) retains 741 changes of at least three points plus every high crossing (744 distinct rows). Material simulation ranges are NCAAM −18 to +11, NBA −18 to +9, NFL 0 to +5 and CFB 0 to +6; these are not archived rating distributions. The CFB overtime 89→90 case combines upset 6→8 with its existing adaptive floor 44→43, rather than duplicating that floor or a history/WP award.

NFL/CFB changes only floor a late narrow lead at the same-clock tie threat. Deficit, tie, early and larger-lead controls remain exact; possession, timeouts, ranking, market, comeback, history and overlap logic are preserved. No scoring weights, alert thresholds, UI, stored historical ratings or provenance assertions were changed during this audit.

## Notification repair and preservation

Exact original sources reproduce **seven duplicate-delivery failures**. The two-file repair checks consumed history by device + exact sport/event at enqueue and atomic claim, across current, older and legacy model keys. Sent, ambiguous and in-flight deliveries suppress repeats. Model-specific baselines, legitimate verified recrossings, canonical freshness/evidence/preference revalidation and definite-rejection retries remain intact. **22 new regressions, 143 combined notification tests and 20/20 cross-model SQLite claim races pass.** See [proof and reproduction](../audit/final-release-712f221/alerts.md).

Normal-path DB statement counts and all provider/AI budgets remain unchanged. Indexed per-device subqueries add row reads; denied claims add at most ten exceptional cleanup statements per drain. Existing seven-day retention and device identity remain unchanged, so this is not an indefinite account-wide dedupe guarantee.

The [candidate identity check](../audit/final-release-712f221/candidate-identity.json) verifies 1,067 tracked files, all 17 original calibration files, and all 34 production root/font assets. Only the two alert source files and two stale halftime assertions in one test file differ from the integrated baseline; new files are audit evidence/tests/tooling. The assertion updates verify production's existing short badge and retained explanatory tooltip; production UI bytes are unchanged.

The [non-target preservation proof](../audit/final-release-712f221/preservation.json) covers 25 NHL games (7,944 replay states plus 25 end states) and two MLB games (776 plus two): **8,747 byte-identical serialized scoring results**. Another 80 actual Tennis observations represent 40 unique matches; 72 Soccer and 252 Tennis controls are explicitly simulated. Their scoring is also byte-identical. The original worktree's source-byte gate encountered CRLF conversions; a separate check verifies equivalent scoring text across all 67 graph files and exact untouched source bytes in the release candidate. This resolves an environment discrepancy without changing scoring or fixtures.

## Final verification

- **PASS:** [full suite](../audit/final-release-712f221/full-tests-verified.log), 1,825 tests / 128 files, zero failures or skips; standalone score/watchlist/timeline fixtures; browser bundle build; [Worker compile-only dry run](../audit/final-release-712f221/worker-dry-run-final.log).
- **PASS:** 432 browser/Worker parity cases; 2,940 controlled scenarios; 648 paired clock checks; original and supplemental historical factor reviews; source hashes; notifications; budget and timeline suites.
- **PASS:** [fresh original replay comparison](../audit/final-release-712f221/replay-reproduction.json), all 20 sections and 119 provenance hashes, plus the expanded non-target-sport preservation proof above. All scores, factors, evidence, WP, markets' scoring fields and thresholds match. Exact report comparison identified 1,140 omissions of six unused spread-price/display leaves across 183 material rows and seven repeated high rows; original values were checked against unchanged source quotes. Only these exact omissions are permitted, with five negative controls rejecting changes to lines, timestamps, WP, scores or price values. The [difference ledger](../audit/final-release-712f221/replay-reproduction-differences.json) preserves every omission. Original committed report/CSV bytes were restored; no historical rating was rewritten.

Reproduction: `node scripts/build-site.mjs`; `node --test --test-concurrency=4 test/*.test.js test/*.test.cjs alerts-worker/test/*.test.js`; `node test-score.js`; `node scripts/live-underdog-report.mjs`; `node scripts/final-release-replay-compare.mjs`; `node scripts/final-release-crossings.mjs`; `node scripts/release-basketball-report.mjs`; `node scripts/final-release-preservation.mjs`; `node scripts/final-release-candidate.mjs`. Windows esbuild needs normal filesystem access; byte-sensitive fixtures use exact committed blobs.

Release must use the production-based candidate with matching browser/Worker model versions, after approval and a fresh production-head check. Do not publish the older target branch wholesale, backfill ratings, change thresholds, or replay queued historical notifications.
