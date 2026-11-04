# Live underdog calibration review — November 3, 2026

Implemented locally on `calibrate/live-underdog-20261103`, based on production commit `0f0eb90dc332e951afc3a20e3226f99e951a6cec`. **Not deployed.** The original working directory and its unrelated uncommitted work were left intact.

The public frontend asset revision matched that commit; the public Worker health endpoint reported `2026-11-02.clock-integrity.2`, matching its runtime. The candidate model is `2026-11-03.live-underdog.1`. An independent, hashed production bundle was built from `git archive` before editing; it does not import mutable candidate scoring modules. See [baseline provenance](../test/fixtures/live-underdog-before.provenance.json).

**Recommendation: ready for calibration review; hold deployment pending that review.** Review the complete threshold-crossing ledger and the final-possession examples below before approving a coordinated Worker/browser rollout. These deterministic calibrations are not fitted or validated predictions of winning probability.

## Root causes and production path

Worker feed and alerts use `alerts-worker/src/live-game-model.js` → `scoring/live-runtime.cjs` → the reviewed candidate aggregation. The browser bundles `scoring/browser-entry.cjs`, which selects the same live runtime. `rating-core.js` is an intermediate legacy calculation, not the final production score.

| Sport | Production defect | Targeted change |
|---|---|---|
| NCAAM (`NCAAB`) | The runtime reapplied legacy upset credit: a leading underdog activated at 35% elapsed, a tie at 70%, and any deficit received zero. Mixed spread qualification paths also caused the eight-point inconsistency. | Replace only the live upset factor with continuous spread, maturity, signed-margin and feasibility curves. |
| NBA | Inherited the same legacy time gates, an eight-point spread qualification, and no narrow-deficit credit. Unlike NCAAM, it did not reliably recompute the upset factor after recovering a closing line from the summary. | Use the same mathematical structure with separately checked NBA parameters, lower ceiling and slower early recognition; evaluate the validated market in the final production pass. |
| NFL | The existing gradual model allowed tied threat to reach .65, but a one-point lead reset to approximately .4365. | Keep the existing positive-lead curve, with the same-clock tie threat as a floor. |
| CFB | Same narrow-lead defect in its production surprise model. | Same small margin correction; retain its distinct strength, ranking, possession, Q3/Q4, overtime and context rules. |

The implementation changes three production files: the new basketball module, its integration in `live-runtime.cjs`, and the small threat-term correction in `football-live.cjs`. Legacy/completed formulas, UI, provider requests, AI budgets, notification thresholds and delivery logic are unchanged.

## Basketball formula

Let `S(x)` be smoothstep, `u²(3−2u)`, with `u` clamped to `[0,1]`; `s` is verified pregame spread, `p` elapsed regulation fraction, and `m` the underdog's signed lead. Overtime retains full elapsed maturity but uses the current overtime clock for comeback runway.

```text
strength = S((s−4)/6) × [.65 + .35 × (1−exp(−(max(s−10,0)/spreadScale)^1.2))]
maturity = S(p)^maturityPower
threat(m≥0) = tieWeight + (1−tieWeight) × (1−exp(−m/leadScale))
threat(m<0) = tieWeight × exp(−(−m/deficitScale)^1.35)
raw = cap × strength × maturity × threat × runway × probabilityGate
overlap = min(.25 × raw, .20 × correlatedHistoryPoints)
upset = round(clamp(raw−overlap, 0, cap))
```

| Parameter | NCAAM | NBA |
|---|---:|---:|
| Maximum upset points | 18 | 14 |
| Maturity power | 1.25 | 1.90 |
| Tie weight | .72 | .66 |
| Lead scale | 5 | 6 |
| Deficit scale | 6 | 7 |
| Spread scale | 12 | 8 |
| Estimated possession cycle, seconds | 30 | 24 |

These differences make ordinary NBA scoring swings less surprising early, while recognizing a credible late threat. In matched +25.5, one-point-lead simulations at 10%, 35%, 50%, 75% and 90% elapsed, NCAAM upset points are `0,3,5,10,12`; NBA points are `0,1,3,7,9`. The complete matrix tests both sports independently.

Estimated opportunities equal remaining seconds divided by the sport's possession cycle, plus an immediate opportunity allowance: `.75` for confirmed underdog possession, `.20` when possession is unknown, and zero for confirmed favorite possession. That allowance fades smoothly to zero during the last second. It is an estimate, not a claimed observed possession count. For a deficit `d`, required opportunities are `d/3 + .4×S(d/3)`; runway is `1−exp(−(opportunities/required)^3)`. Leads and ties use runway one. A confirmed expired clock with a deficit earns zero; the existing uncertain-clock safeguards still retain the last trustworthy state.

Authoritative current underdog win probability, when accepted by existing provider/clock validation, supplies only `S(probability/.12)`, a downward plausibility gate. Missing probability is neutral. It adds no second uncertainty bonus. The overlap discount covers existing comeback, lead-change, unanswered-run and win-probability-history awards. Ordinary closeness, generic leverage, decisive possession and historical drama remain in their current owners; the runtime inserts exactly one upset factor.

Pregame expectation requires a valid closing quote, an explicitly marked pregame quote, a valid timestamp no more than 48 hours before tipoff, or an actual observed pregame baseline. Live/in-play, invalid timestamp, stale, post-start and contradictory side/team evidence are rejected. A previously validated same-event pregame quote survives subsequent missing or live lines. Mere failure to cover a large spread does not create a major upset award: actual margin and comeback viability still govern it.

## Football formula

Only the leading branch of `threat` changes:

```text
tiedThreat = .65 × S((p−.5)/.4)
oldLeadingThreat = .35 + .65 × (1−exp(−m/7))
newLeadingThreat = max(tiedThreat, oldLeadingThreat)     for m>0
```

The existing deficit branch, spread/moneyline/ranking strength, elapsed maturity, reversal, sustained leadership, probability gain, overlap discount, caps and comeback feasibility are preserved. Early and larger leads retain their original behavior. This does not enforce monotonicity of total excitement after a score: the other team's comeback opportunity and generic tension can fall when the underdog gains a lead.

The existing football probability behavior is also preserved: current WP affects a small probability-gain multiplier, rather than vetoing the surprise component. Changing that would be a separate calibration. It is identified here as a limitation, not silently altered in this repair.

## Before and after

All rows below are controlled simulations, except the explicitly identified archived reconstructions. Wofford's +25.5 spread and 16–15 first-half score came from the user's observation; we do not possess its exact raw provider snapshot. The paired clocks reproduce the reported threshold defect. Later Wofford states are hypothetical, not historical results.

| Case | Total before → after | Upset before → after |
|---|---:|---:|
| Wofford 16–15, first half 6:01, +25.5 | 47 → 50 | 0 → 3 |
| Same score and spread, first half 6:00 | 60 → 50 | 13 → 3 |
| Hypothetical Wofford 45–45, second half 12:01 | 54 → 63 | 0 → 9 |
| Same hypothetical tie, second half 12:00 | 64 → 63 | 10 → 9 |
| Hypothetical Wofford 64–65, second half 4:00 | 58 → 68 | 0 → 10 |
| NBA +25.5, trails one, Q4 4:00 | 56 → 64 | 0 → 8 |
| NBA +25.5, tied, Q4 4:00 | 68 → 66 | 11 → 9 |
| NBA +25.5, leads one, Q4 4:00 | 73 → 65 | 17 → 9 |
| Archived Minnesota +12.5 at San Antonio play-prefix, 61–54, Q2 1:20 | 53 → 55 | 0 → 2 |
| NFL +25.5, tied, Q4 4:00 | 69 → 69 | 13 → 13 |
| NFL +25.5, leads one, Q4 4:00 | 62 → 67 | 9 → 14 |
| CFB +25.5, tied, Q4 4:00 | 83 → 83 | 15 → 15 |
| CFB +25.5, leads one, Q4 4:00 | 75 → 80 | 10 → 15 |
| Archived Notre Dame–Villanova play-prefix, 70–68 at 0:48 | 85 → 80 | 9 → 4 |

Notre Dame's five-point reduction is confined to upset context: its +7.5 market produces raw upside 5.920, then a 1.480 correlated-history discount, rounded to four. Current Tension 34, generic leverage 6, carried context 3, late lead-change 4, erased-deficit 6, win-chance swing 5 and total momentum 15 remain unchanged. The one old exact-score regression expectation was updated with this explanation. No historical fixture or saved rating was changed.

## Changes requiring review

The final replay covers **92 games and 17,895 reconstructed checkpoints**. Both engines withhold 12 zero-clock transition states; 17,883 checkpoints have numerical comparisons. There are 980 changed ratings, 141 changes of at least three points, and 198 rows requiring review by magnitude or threshold crossing. The separate 2,940-scenario matrix and 648 paired clock-boundary checks cover the requested controls. The maximum total jump across the former 35%/70% gates is one point.

| Sport | Games | Rated checkpoints | Changed | Largest decrease / increase | New 85+ states |
|---|---:|---:|---:|---:|---:|
| NCAAM | 3 | 1,070 | 521 | −5 / +4 | 7 |
| NBA | 6 | 2,622 | 382 | 0 / +2 | 0 |
| NFL | 31 | 5,449 | 9 | 0 / +3 | 0 |
| CFB | 52 | 8,742 | 68 | 0 / +2 | 10 |

**Seventeen reconstructed states across five games newly reach 85; these must be reviewed before rollout.** They are all +1/+2 total changes. The seven NCAAM cases involve Iowa–Illinois and Purdue–Arizona in the second half, including clocks around 14 minutes: one or two upset points lift existing 83/84 ratings to 85. They have current provider WP supporting a viable underdog, but the high total depends mainly on already-existing game/history scoring. Treat their watchability at 85 as an explicit calibration question, not an automatically correct alert.

The ten CFB cases involve Kentucky–Oklahoma, Florida–Texas and Oklahoma State–Iowa State, with the identified underdog leading by one or three in Q4. Seven of these ten reconstructed observations carry partial-evidence status. They do not show an impossible comeback or a favorite merely failing to cover, but the missing historical inputs limit certainty. NCAAM also drops **29** previously 85+ states below 85; across the whole numerical replay, there are twelve fewer 85+ states and eight fewer 90+ states. The ledger records crossings in both directions rather than suppressing concerns behind aggregate averages.

A simulated NCAAM +25.5 underdog trailing by one with confirmed possession and two seconds remaining rises from **75 to 86** (upset 0→11). That is a plausible winning-shot situation. With possession unknown it scores 55; with the favorite holding the ball it scores 43 and earns no upset points. Seven- and fourteen-point deficits with two seconds remaining earn zero upset points, even with the ball. Authoritative near-zero WP further suppresses the threat.

A simulated two-second NCAAM tie with confirmed possession remains extremely high: **97→98**. Its existing decisive-possession scoring already supplied the high total; this change adds one upset point. The comparable NBA case decreases **87→85**. These examples require judgment at review time and are not evidence of real delivered notifications.

The complete [replay evidence report](live-underdog-evidence-20261103.md) records game counts, distribution changes and every new historical 85+ crossing. The [material-change CSV](output/live-underdog-material-changes-20261103.csv) makes all 198 flagged rows easy to scan. Its [JSON ledger](output/live-underdog-20261103.json) includes every reconstructed checkpoint and simulation, all absolute changes of at least three points, **every** crossing of 75/85/90 in either direction, full before/after factors for flagged historical changes, and source hashes. Smaller changes remain visible in the full rows. No new threshold crossing should be described as an actual alert sent.

The base NBA archive mostly has small spreads. Two supplemental genuine captures strengthen its coverage: Minnesota +12.5 at San Antonio contributes 280 available checkpoints through Q3 (105 change, at most +2; peak 68→70), and New Orleans +5.5 at Memphis contributes 488 through overtime (180 change, all +1; peak 92→93, completed rating 97 unchanged). Neither introduces a crossing of 75, 85 or 90. The +12.5 quote is recovered from the archived closing market; the old NBA production path left its upset factor at zero in this reconstruction, even though calling its legacy upset function in isolation would return 12. These observations supplement the independent sport matrices; the archive still does not provide a large-spread NBA underdog in the final minutes for every tested condition.

## Regression protection and reproducibility

The original 107 approved archived fixtures and historical hashes remain intact. Recorded ratings retain their original model versions. The candidate model version separates future observations from earlier ratings; no timeline is rewritten. Pregame and completed comparisons check both totals and factors, and observed opening-baseline comparisons span the model-version change. Other-sport end states and existing chronology, notification and budget tests remain covered.

Browser parity uses the actual esbuild browser entry in an isolated JavaScript context and the active Worker normalization/enrichment facade. It checks 432 paired live scenarios across all four sports, phases, margins, missing/available WP and possession, in addition to the existing production integration tests. This is executable scoring parity; no UI changes or visual browser QA are needed for this patch.

Run from this worktree:

```text
node scripts/build-site.mjs
node --test test/*.test.js test/*.test.cjs alerts-worker/test/*.test.js
node test-score.js
node scripts/live-underdog-report.mjs
```

The final command is offline and intentionally exhaustive within the selected archived corpus. Its past states are causal reconstructions, not exact original raw live responses. Missing possession/WP remains missing; later WP, box scores and recaps are excluded. Explicit archived closing or timestamped pregame quotes may establish expectations, but their availability to the app at that historical instant is not proven. Original source snapshots are never overwritten. Hypothetical inputs are labeled simulations throughout.

**All 1,790 tests across 124 files pass, with zero failures or skips.** The standalone scoring/watchlist/timeline tests and browser build also pass. See [validation results](output/live-underdog-validation-20261103.json) for counts and commands. Rollout should occur only after this calibration review, with the matching browser and Worker model published together through the existing versioned release process. Do not backfill old historical ratings or adjust alert thresholds as part of that release.

Windows validation note: Git's `core.autocrlf=true` initially converted 21 untouched byte-verified files. Restoring their exact HEAD blobs reproduced the existing manifest hashes and reviewer artifacts; no archive content, expected hash, or provenance assertion was changed. Byte-sensitive historical checks require the repository's original file bytes.
