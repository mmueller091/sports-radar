# Completed CFB calibration audit

Scope: one completed-CFB pass on the working tree as received, after live CFB and NFL calibration. No NFL, other-sport, pregame, possession, clock/runway or live OT formula changed. No deployment.

## Exact implementation files

- `scoring/sports/cfb.js`: completed upset, validated score-path evidence, aggregate retention floors and correlated-stakes limits.
- `rating-core.js`: dispatch the optional model `completedHistory` hook only for completed aggregation with adapter context.
- `alerts-worker/src/game-model.js`: pass the actual game and its existing finishing award to completed CFB aggregation. Browser and Worker share this adapter.

Existing four-argument `momentumImpact` returns exactly the same history as before. An optional fifth argument `{game, finishPoints}` supports completed aggregation. Public export keys and function arities are unchanged, and the return still has only `points`, `text`, and `factors`. `game.momentumPoints` includes the explicitly labeled completed adjustment when used through the adapter; the underlying history engine and its +25 cap are untouched. No live call uses the new context.

## Exact completed formulas

Let `u(x)=max(0,min(1,x))`. All final ratings still round and clamp to 1–99. Floors add only `max(0, round(target-currentAggregate))`, where `currentAggregate` includes the actual base, original history, and existing final-play/defensive-finish award. They do not add an independent history bonus.

### Overtime depth

Depth `d` comes from the final integer period minus four, falling back to explicit `nOT` text, then generic OT text as one overtime. Final margin must be at most eight.

The existing +13 generic OT factor remains and is counted toward the target:

`target = min(99, 78 + 18*(1-exp(-0.85*(d-1))) + 2*shootout + min(8, 0.5*stakes)) + stagnation`

`stakes` is the sum of existing stakes/consequence/advancement/elimination factors. Before the floor, any stakes beyond eight are removed from the aggregate as a labeled correlated-stakes adjustment. Thus championship context cannot independently add the existing full stakes award on top of OT depth. Ordinary targets round to 78 / 88 / 93 / 95 / 95 for 1–5 OT and approach 96. A confirmed conversion shootout can approach 98; a competitive postseason classic can reach 99.

`shootout` requires at least two distinct explicit two-point play records in the applicable shootout periods, and a known season: period 7+ from 2021, period 9+ in 2019–2020. Unknown seasons and period number alone do not assert shootout style. This completed detector is independent of live response-rights logic.

The original negative offensive-stagnation factor is also subtracted from each floor. Overtime cannot erase it.

### Verified path and late pull-away

Scoring records must have finite scores, explicit valid clock values, integer periods, monotone elapsed positions and scores, plausible single-team score increments of at most eight, and a final ledger score matching the actual home/away final. At least three records are required. Invalid or incomplete ledgers do not receive path retention. No win-probability sample index is treated as a timestamp.

Regulation position is `min(1, ((period-1)*900 + 900-clockSeconds)/3600)`. Between consecutive scoring events the prior score persists: the event that widens the lead marks the end of the verified competitive interval. `lastCompetitivePosition` is the last point when the margin was at most eight. `competitiveShare` sums those regulation intervals. Erased deficits are tracked for either team, regardless of which eventually won.

Require `lastCompetitivePosition >= 0.75` (Q4 reached). Define:

- `late = u((lastCompetitivePosition-0.75)/0.20)`
- `evidence = u(positiveHistory/25)`, excluding the existing stagnation deduction
- `magnitude = u(erasedDeficit/21)`
- `marginWeight = 1-u((finalGap-21)/21)`

For a final gap above eight, also require at least 35% competitive share:

`target = (35 + 30*late + 12*magnitude + 8*evidence)*marginWeight + stagnation`

This is bounded at 85 before stagnation for margins through 21, then tapers to zero at 42. It preserves Q4 tension without turning a late blowout into a maximum.

For a final gap at most eight and an erased deficit at least 14:

`target = 65 + 18*magnitude + 5*evidence + stagnation`

The close-comeback target is bounded at 88. A comeback completed in OT receives the higher applicable aggregate floor, not a sum of floors. Original comeback, lead-change, decisive-score and win-probability history factors are not duplicated. Early comebacks followed by a full-half blowout and garbage-time accumulation fail the late-contest requirement.

### Completed upset magnitude and ranks

Only an actually victorious qualifying spread underdog gets this CFB replacement. Qualification is unchanged; non-spread candidates retain existing fallback behavior. This is independent of live upset activation.

`m = u((spread-7)/23)`

`r = ((26-favoriteRank)/25) * u(((dogRank || 35)-favoriteRank)/20)` when a valid favorite rank exists; otherwise zero.

`significance = 6 + 16*m + 6*r*(0.35+0.65*m)`

`quality = u((28-winningMargin)/25)`

`upsetPoints = round(significance*(0.25+0.75*quality))`

At three-point final margins, unranked +7/+14/+21/+28 winners get 6/11/16/21 points. Spread magnitude saturates at +30. A rank advantage contributes at most six before the competitiveness gate. A 28+ point win keeps just one quarter of the significance, at most seven points. If a negative margin base would erase even that small contribution, aggregate retention ensures at least `1+upsetPoints+stagnation`.

Final closeness supplies the initial upset quality gate; verified whole-game path can separately preserve the aggregate through the floors above. Postseason points are not embedded in upset magnitude; they are counted once as existing stakes, with caps on correlated OT or verified noncompetitive paths. The explanatory text retains the underdog spread, so a notable result remains explainable even with low excitement.

### Noncompetitive stakes and low scoring

For a final gap at least 21 and a validated path with no one-score contest reaching Q4, remove existing stakes beyond five (bounded so the aggregate stays at least one). A championship blowout therefore cannot rise merely because of its title context. If the ledger is missing or invalid, do not guess the path.

No new low-score penalty exists. Original stagnation and defensive-action offsets remain unchanged. Synthetic defensive classic/punt-fest scores remain 64/33.

## Test and report files

- `test/helpers/cfb-completed.cjs`: synthetic archetypes and frozen/provider replay helpers.
- `test/cfb-completed-calibration.test.js`: inequalities, evidence rejection, exact regression, API and runtime parity.
- `test/cfb-calibration.test.js`: keeps pregame/history pinned; isolates intentional completed upset changes.
- `test/live-score-regressions.test.js`: replaces only its obsolete completed flat-upset assertion with magnitude ordering; live checks remain intact.
- `test/scoring-regressions.test.js`: verifies that championship 1OT retains the stakes cap, while a 3OT classic still reaches the global 99 ceiling; standalone history stays at 25.
- `test/scoring-module-parity.test.js`: preserves other sports and all non-calibrated fields; completed CFB has dedicated immediate-baseline and runtime coverage.
- `alerts-worker/test/sports-feed.test.js`: archived adapter replay receives the modern sport-aware upset arguments and optional completed aggregation context. Original migration goldens remain unchanged.
- `test/fixtures/scoring-core-before-cfb-completed.js.gz`: immutable pre-pass browser bundle, including current live CFB/NFL calibration.
- `calibration/cfb-completed-baseline.json`: saved CFB live A–Y, NFL A–P, completed synthetic cases and all 107 provider outputs. Synthetic ledger refinements were replayed through the frozen pre-pass bundle; saved live/provider outputs were not overwritten.
- `scripts/cfb-completed-calibration-report.cjs`: reproducible before/after report with provenance and regression assertions.
- `scripts/cfb-calibration-report.cjs` and `calibration/cfb-calibration.md`: keep the existing live report runnable, replace its superseded completed-output identity assumption with exact standalone-history preservation, and link this completed pass.
- `calibration/cfb-completed-calibration.md`: generated matrix, all real games, formulas link, explanations and verification.
- `calibration/cfb-completed-audit.md`: this audit.

The existing generic provider report also ran for all 107 fixtures. Its generated CSV is retained in ignored `work/cfb-completed/provider-after.csv`; the pre-existing tracked `calibration/output/latest.csv` was preserved to avoid unrelated report churn.

Pre-existing live calibration edits elsewhere in the working tree were preserved; they are not changes made by this pass.

## Remaining completed-CFB edge cases

- Sparse/missing/malformed clocks, score corrections and incomplete scoring ledgers conservatively lose path retention. WP-only evidence still earns its original history points but cannot establish a timed late pull-away.
- There are 50 stored completed CFB captures: one 2OT and two 1OT games, but no stored 3OT+ conversion shootout or CFP final. Synthetic tests cover those interactions; there are no fresh provider captures in this pass.
- Historical rules are used only to identify explicit conversion shootouts. Unusual overtime final margins above eight do not qualify for the floor.
- The existing generic finishing-text heuristic can recognize `0:00` inside `10:00`, or describe a last score as decisive without checking whether it changed the winner. This pass counts that existing award toward its floors and leaves the shared finishing policy unchanged. Synthetic blowout clocks avoid that unrelated ambiguity.
- Broader history factors still describe the game even when a floor supplies no points, and independent legacy finish/defensive awards remain. Result significance is not a separate numerical public metadata field; its candidate, explanatory text and labeled contribution remain available.
