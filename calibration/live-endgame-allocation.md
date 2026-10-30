# Opt-in live endgame allocation: scoped revision

Baseline remains committed history-relevance checkpoint `3b81ee8`, policy `live-owned-45-95-relevant-history`. The separately exported `LIVE_ENDGAME_ALLOCATION_POLICY` remains opt-in. This revision retains the original NFL calculation and withdraws NHL allocation entirely, using the requested fallback. No scoring redesign, weight search, regular-season cap, or quota of 99s.

## Exact activation and implementation

Only live evaluations explicitly opting into endgame allocation with history ownership, sport NFL, and an existing positive sport-model `competitiveFloor` enter the correction. The existing NFL model owns activation: fourth-quarter decisive drives with 0 < seconds <= 180, a supported possession and deficit from 0 through 8, or explicit critical two-point attempts with deficit 1 or 2 and 0 <= seconds <= 120. The increment must actually be positive. The experiment adds no clock/score threshold. NFL OT possession rules stay sport-owned; no new OT floor is introduced.

Let B be the unchanged candidate base, H+ the sum of positive already-allocated combined-history factors, and C the context already carried above ordinary Sport baseline/Schedule scarcity plus retained NFL postseason stakes. The unchanged calculation is:

`floorInputBase = B + H+ - C`

`F1 = min(F0, existingNFLModel(floorInputBase).competitiveFloor)`

Reaggregate the unchanged live components with F1 using the existing shared budgets; finalize B + newLive + existingEventHistory + existingSignedTrajectory, with existing rounding/clamping. Negative history is excluded from H+ and remains signed in the final total. Event/history caps, factor priority, history relevance, recovery protection, and trajectory taper are unchanged.

NHL's `hockeySituationImpact` exposes OT/shootout semantics, but its tied third-period target uses one continuous regulation branch spanning 20:00 to 0:00. Its `late` predicate means third period with a parseable clock, not a distinct late-regulation allocation branch. One-goal/manpower conditions share that block. There is no reliable separate late-regulation activation to reuse without choosing a new threshold. Therefore NHL is wholly outside this experiment, including late regulation, regular-season OT, postseason OT and shootout. This also avoids creating an allocation discontinuity at regulation-to-OT. Production NHL scoring is untouched.

The revision edits `calibration/trajectory-live-policy.cjs`, `calibration/endgame-allocation-fixtures.mjs`, `test/live-endgame-allocation.test.js`, `scripts/replay-input-comparison.mjs`, and this report. `calibration/shadow-candidate.cjs` retains the first experiment's opt-in integration without further edits. These are the six paths shown by git status relative to the committed baseline. Existing ignored work JSON/replay/parity logs are updated; no new manifest or provenance artifact is created.

Production/default behavior, completed scoring, Current Tension, Generic Leverage, context weights and history-relevance rules remain unchanged. No staging, commit, push, deploy or promotion occurred.

## Reviewed scores and NFL arithmetic

| Case | Baseline 3b81ee8 | First experiment | Revised NFL-only |
| --- | --- | --- | --- |
| R01 | 55 | 55 | 55 |
| R02 | 56 | 56 | 56 |
| R03 | 94 | 93 | 94 |
| R04 | 62 | 62 | 62 |
| R05 | 66 | 66 | 66 |
| R06 | 91 | 87 | 87 |
| R07 | 45 | 45 | 45 |
| R08 | 1 | 1 | 1 |
| R09 | 64 | 64 | 64 |
| R10 | 87 | 87 | 87 |
| R11 | 94 | 93 | 94 |
| R12 | 89 | 85 | 85 |
| R13 | 99 | 90 | 90 |
| R14 | 95 | 92 | 95 |
| R15 | 47 | 47 | 47 |
| R16 | 4 | 4 | 4 |
| R17 | 61 | 61 | 61 |
| R18 | 60 | 60 | 60 |
| R19 | 70 | 70 | 70 |
| R20 | 53 | 53 | 53 |
| R21 | 48 | 48 | 48 |
| R22 | 90 | 90 | 90 |

- R13 is Giants 27, Saints 34, fourth quarter 0:24, Giants possession, third-and-one at NO 14. Consequence .76, urgency 1, viability 1. Original floor round((99-47)*.76)=40; allocated floor round((99-(47+15))*.76)=28. Total 47+40+15=102 clamps to 99; 47+28+15=90. The decrease is not treated as a failure merely because the old score was 99.
- R06: 48+37+5.95047=90.95047 -> 91 becomes 48+33+5.95047=86.95047 -> 87.
- R12: 48+37+6-2=89 becomes 48+33+6-2=85. Its negative two-point adjustment remains signed. The matched pair retains its small two-point sustained-history advantage; its former exact levels are not targets.
- Goal-line, winning-try, major defensive championship and postseason NFL OT synthetic scores remain 94, 96, 99 and 99. The stagnant championship control remains 92. A regular-season extraordinary-event test still exceeds 95.

## Earlier-regulation NHL parity and boundaries

All five named checkpoints in event 401892521 are Tampa Bay 3, Vancouver 2, third period. The following clocks are provider **elapsed** clocks, not remaining time:

| Play suffix | Elapsed clock | Baseline | First experiment | Revised |
| --- | --- | --- | --- | --- |
| 000009890 | 7:09 | 81 | 69 | 81 |
| 000009900 | 7:13 | 82 | 70 | 82 |
| 000005010 | 7:15 | 82 | 70 | 82 |
| 000009910 | 7:15 | 82 | 70 | 82 |
| 000009950 | 7:17 | 82 | 70 | 82 |

Arithmetic is 53+16+9+3=81 for the first, and 53+17+9+3=82 for the others. Focused tests compare the entire result, allowing only the policy ID to differ. The replay makes the same full-result assertion for every out-of-scope checkpoint, including every NHL state:

| Sport | Checkpoints proved unchanged outside scope |
| --- | --- |
| CFB | 8409 |
| MLB | 776 |
| NBA | 1419 |
| NCAAB | 659 |
| NFL | 4454 |
| NHL | 7944 |

Boundary tests cover NHL regulation target anchors; one-goal/manpower activation around 5:00, 3:00, 2:00 and 1:00; history headroom around 0:15; end regulation to regular-season/postseason OT; OT depth; and shootout. Differences across boundaries exactly equal baseline differences, so this restriction introduces no rating drop. Existing baseline steps are not redesigned. The retained NFL correction also passes the R13-context 3:01 -> 3:00 -> 2:59 activation check without a score drop.

## Actual archived former 99s

These are inspections, not target labels or a tuning set. Provider situation inputs are reported as supplied by the corrected replay.

| Event:play | Actual archived situation | Baseline arithmetic | First experiment / revised |
| --- | --- | --- | --- |
| 401872981:4018729814685 | Jacksonville 16, Philadelphia 14; Q4 1:35; PHI second-and-10 at its 38 after an incomplete pass | 48+36+15=99 | Both: 48+26+15=89; H+=15, C=0, floor input 63 |
| 401872981:4018729814708 | Same score; Q4 1:31; PHI second-and-15 at its 33 after a false start | 46+38+15=99 | Both: 46+27+15=88; H+=15, C=0, floor input 61 |
| 401892524:401892524000009020 | Montreal 3, Buffalo 3; third-period elapsed 10:27 (9:33 remaining); even strength, giveaway | Existing target 87; 59+28+9+3=99 | First: H+=12, C=2, input 69, floor 18, total 89. Revised: unchanged 99 |
| 401892524:401892524000008960 | Same score; elapsed 10:43 (9:17 remaining); even strength, saved snap shot | Existing target 88; 59+29+9+3=100 -> 99 | First: H+=12, C=2, input 69, floor 19, total 90. Revised: unchanged 99 |

The NHL restorations follow the declared scope, not a goal of restoring 99s. The old targets and clock interpretation are left intact. The two NHL first-experiment calculations were reconstructed only for these inspected samples with the original documented headroom formula and existing sport/aggregation functions; no second full replay was run.

## Context: storyline, quality, meaningful stakes

The former-captain-return input is labelled **verified-storyline**, not matchup quality. First-experiment JSON is retained verbatim, so its historical `verified-matchup` labels remain there as comparison evidence only; they also denote a storyline.

All variants below are explicitly hypothetical counterfactuals. Verified/unverified context uses existing parser inputs; postseason uses supported season metadata and playoff/championship labels. No division race is inferred. NHL OT variants use clean first-OT labels to avoid the known OT-depth parser issue, retaining the checkpoint clock input; equal remaining time across OT formats is not claimed.

The added three-way comparison holds current score (2-2), clock/period, manpower, plays and raw history constant:

| Hypothetical NHL first-OT context | Opening | Base | Live floor | Event history + trajectory | Final |
| --- | --- | --- | --- | --- | --- |
| Ordinary: both records 5-5, regular season | 41 | 56 | 36 | 0+2 | 94 |
| Strong teams: both records 8-2, regular season | 57 | 57 | 35 | 0+2 | 94 |
| Same 8-2 inputs, supported playoff opener | 64 | 72 | 23 | 0+6.49147 | 99 |

Existing record factors recognize team quality, but the absolute NHL floor absorbs the one-point carried-base difference. The unresolved ordinary/strong-team tie is reported without a forced minimum bonus. Postseason uses its existing target/history rules; its admitted history differs despite identical raw history. Existing pregame rules omit regular-season record-quality factors in postseason, so the last row is not a claim that record quality and postseason bonuses stack.

| Hypothetical variant | Baseline | Revised |
| --- | --- | --- |
| R13-regular-season | 99 | 90 |
| R13-postseason | 99 | 99 |
| R13-verified-rivalry | 99 | 90 |
| R13-verified-storyline | 99 | 90 |
| R13-unverified-rivalry | 99 | 90 |
| R14-regular-season | 95 | 95 |
| R14-postseason | 99 | 99 |
| R14-verified-rivalry | 95 | 95 |
| R14-verified-storyline | 95 | 95 |
| R14-unverified-rivalry | 95 | 95 |
| R03-regular-season | 94 | 94 |
| R03-postseason | 99 | 99 |
| R03-verified-rivalry | 94 | 94 |
| R03-verified-storyline | 94 | 94 |
| R03-unverified-rivalry | 94 | 94 |
| goal-line | 99 | 94 |
| winning-try | 99 | 96 |
| major-defensive | 99 | 99 |
| stagnant-control | 92 | 92 |
| postseason-ot | 99 | 99 |
| synthetic-500-teams-ot-regular-season | 94 | 94 |
| synthetic-500-teams-ot-postseason | 99 | 99 |
| synthetic-500-teams-ot-verified-rivalry | 94 | 94 |
| synthetic-500-teams-ot-verified-storyline | 94 | 94 |
| synthetic-500-teams-ot-unverified-rivalry | 94 | 94 |
| hypothetical-quality-ordinary | 94 | 94 |
| hypothetical-quality-strong-teams | 94 | 94 |
| hypothetical-quality-strong-teams-postseason | 99 | 99 |

Rivalry/storyline context also remains undifferentiated on R13/R03/R14 and the ordinary NHL OT comparison. With NHL withdrawn, the first experiment's 92-vs-93 context separation disappears; the baseline 94-vs-94 tie remains. This is an unresolved differentiation limitation, not grounds to add another scoring layer.

## Single corrected replay and validation

One baseline-versus-revised corrected-v2 replay: **23,767 checkpoints, 107 games; 96 decreased, 23,671 unchanged, zero increased**. Every decrease is NFL. All 7,944 NHL checkpoints and all CFB/NBA/NCAAB/MLB checkpoints are unchanged, including full diagnostics except policy ID. All 23,767 state, signed history/trajectory, live component and input immutability checks pass. NFL aggregates exactly equal the first experiment.

| Measure | Baseline | First experiment | Revised |
| --- | --- | --- | --- |
| Checkpoint-weighted mean | 50.8471 | 50.6017 | 50.8163 |
| Equal-game mean | 50.0811 | 49.8965 | 50.0432 |
| Decreased checkpoints | ? | 949 | 96 |
| Exact 99s overall | 168 | 100 | 112 |
| Exact NFL 99s | 56 | 0 | 0 |
| Exact NHL 99s | 12 | 0 | 12 |

Counts are descriptive only. No target distribution or accuracy improvement is inferred from them.

Validation order: focused tests first (23/23), then the single replay plus relevant production/browser/Node/Worker parity/regression checks (78/78). An additional in-memory comparison against source loaded directly from commit 3b81ee8 passed 80 default/original-policy evaluations; original policy objects match exactly. A git diff check confirms production scoring, Worker source, trajectory policy and Current Tension source/artifacts are unchanged. Only existing Node module-type warnings appeared.

`node --test --test-reporter=spec test/live-endgame-allocation.test.js test/live-history-relevance.test.js test/trajectory-live.test.js`

`node scripts/replay-input-comparison.mjs --endgame-allocation`

`node --test --test-reporter=spec test/scoring-module-parity.test.js test/replay-inputs.test.js test/replay-input-comparison.test.js test/shadow-candidate.test.js test/shadow-candidate-report.test.js test/trajectory-live-calibration.test.js test/current-tension-calibration.test.js test/nfl-calibration.test.js test/nhl-calibration.test.js`

Focused coverage includes named earlier NHL states, late regulation, regular/postseason OT, shootout, signed history, existing event/history caps, R13/R06/R12, input immutability, opt-in/non-live isolation, original policies and activation boundaries. No parameter search, new test framework or repeated full-suite run.

## Evidence and remaining prerequisite

[Existing comparison JSON](../work/live-endgame-allocation-results.json) contains the revised results and the entire first output under `firstExperiment`; all reviewed baseline scores match that preserved evidence. [Replay log](../work/live-endgame-allocation-replay.log) and [parity log](../work/live-endgame-allocation-parity.log) were appended, preserving their first-experiment entries. No frozen calibration output or manifest was regenerated.

The known OT-depth parser remains untouched: real clock-bearing labels can still report R03 depth 28 and R11 depth 5. Their regular-season targets ignore depth. **Correct real-label postseason behavior remains a separate release prerequisite**; clean-label synthetic OT tests do not resolve it. The final implementation is the scoped NFL-only opt-in experiment, with the context limitations above documented.
