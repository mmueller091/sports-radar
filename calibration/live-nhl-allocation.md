# Opt-in NHL target/history correction

Implemented candidate: `LIVE_NHL_ALLOCATION_POLICY`, ID `live-owned-45-95-relevant-history-nhl-allocation`. It extends the completed NFL-only policy; NFL keeps exactly that calculation. NHL changes only for live evaluations explicitly using this extension. Production/public defaults, completed scoring and every other sport remain unchanged. The historical [NFL-only report](live-endgame-allocation.md), first experiment evidence and prior result files are preserved without rewriting them. No staging, commit, push, deployment or promotion. No CFB work.

## Invocation and ownership

`shadow.candidateGameRating(core, game, competition, summary, null, LIVE_NHL_ALLOCATION_POLICY)`

Batch invocation: include that policy in `candidateTrajectoryRatings`. Replay: `node scripts/replay-input-comparison.mjs --nhl-allocation`; comparison baseline is `LIVE_ENDGAME_ALLOCATION_POLICY`, which retains 3b81ee8 NHL behavior and the completed NFL correction.

The shared NHL situation/history/state functions accept the opt-in option. There is no second NHL scorer. Two shared helpers gain default-off options: an event-position callback for correct NHL event age, and selection of the maximum of existing ordinary competitive support and the floor. The latter prevents a tiny newly positive floor from replacing a larger manpower contribution. The existing 20-point ordinary competition and 30-point event budgets and extraordinary-floor exceptions are unchanged.

## Exact changed rules and constants

1. **NHL timing, once.** `hockeyLiveTiming` uses the existing normalized clock parser. Structured period and regulation-format metadata take priority over labels; season metadata establishes regular/postseason format. The existing NHL lengths are 1,200 seconds for regulation/playoff OT and 300 seconds for regular OT. Standalone OT tokens are a fallback after whole clock strings have been removed. Depth does not imply postseason. Conflicting season metadata leaves format/depth unresolved where ambiguous; missing format leaves OT duration unknown. Diagnostics disclose source, period length, remaining/elapsed seconds and issues. Shootout and intermission do not manufacture another OT count.
2. **Correct clocks throughout the candidate's affected NHL calculations.** Targets, pressure, current-event age, live history headroom and the two-goal final-minute penalty use physical NHL clocks. The state-model penalty keeps its existing magnitude/shape; only its clock interpretation changes. Historical play-clock convention uses the existing NHL sequence/ledger inference. Current Tension, Generic Leverage, context weights and history-relevance/recovery formulas are unchanged.
3. **Continuous regulation targets.** Seconds remaining and target anchors are below. Existing smoothstep interpolation is retained. Candidate regulation targets retain fractions until final score rounding to prevent a rounded floor interacting badly with declining fractional history capacity. No case IDs, old-rating gates or arbitrary subtraction activation.

| Seconds left in third | Tied target | One-goal target |
| --- | --- | --- |
| 1200 | 52 | 52 |
| 720 | 62 | 60 |
| 600 | 68 | 64 |
| 300 | 78 | 72 |
| 120 | 83 | 78 |
| 60 | 85 | 80 |
| 0 | 87 | 82 |

The retained 52 start anchor joins ordinary current-state support. Tied 12-/10-/5-minute anchors rise from 58/65/77 to 62/68/78 to recognize compelling regulation before the final minutes using the correct 20-minute clock. Final 2-/1-/0-minute anchors fall from 84/88/90 to 83/85/87 to reserve space for context, history and extraordinary current action. The one-goal curve replaces the former absent early floor and 5-/2-/1-minute steps of 69/74/78; its 52/60/64/72/78/80/82 anchors provide continuous competitive runway without pretending that thirteen minutes left is five minutes left.

Existing power-play/two-skater/goalie-pull target endpoints (84/82, 89, 85/91) and two-goal extra-manpower targets (46/55) remain. They ramp smoothly from zero influence at third-period start to their existing 300-/180-second full-strength points. Existing pressure contribution, postseason regulation target uplift and target ceilings remain. Dead games do not acquire a competitive target from this change.

4. **OT targets.** Regular-season OT uses 88 -> 90 across its five-minute period, replacing 92 -> 94. This four-point reduction leaves room for supported context and bounded history while ordinary OT remains a strong viewing option. Shootout target 90 is unchanged and joins the OT end target. Playoff OT retains its existing 95 first-OT target, +2 per additional OT up to 98, deciding-game minimum 96, and deciding-final 99. The candidate explicitly preserves the game's non-enumerable source event when entering the shared model, so supported final/deciding labels are available instead of disappearing in an object spread.
5. **Context once.** C is only the non-postseason context already carried by state scoring above Sport baseline/Schedule scarcity. No new retention weight, full pregame restoration or minimum award is introduced. `floor = max(0, target - (B - C))`; the final total still includes B once. The floor therefore preserves C rather than absorbing it. Carried postseason stakes are not exempted from the floor base a second time; their existing target owns that priority.
6. **History once, independently of target.** The established positive-history cap is 12. Define E as relevant positive event history before caps, excluding sustained trajectory; the end budget is `2 + min(4, E)`. Two is the existing ordinary first-OT/shootout allowance; up to four more retains actual lead-change/recovery/late-event history instead of mechanically cancelling it. Regular OT/shootout uses this independent budget. During the final ten regulation minutes, the budget smoothly moves from 12 to that end budget using the same time knots as the target and values `endBudget + (12-endBudget)*min(1, seconds/600)`. Starting at 600 seconds and aligning interpolation knots prevents the cap from outrunning target growth at the tested boundaries. Earlier regulation keeps 12; postseason keeps the existing 12-point cap. The allocator applies relevance, existing factor priority, caps and headroom through `hockeyHistory` for both event-only and combined history. A lower target cannot release history because target/base/context are absent from this budget. Negative trajectory remains separately signed.

Final arithmetic is `clamp(B + existingAggregateLiveBonus + admittedCombinedHistory + signedNegativeTrajectory)`. Positive history is never added to the floor's input base. Diagnostics reconcile event-only history plus admitted trajectory to combined history, and combined history to the final total.

## Reviewed and preselected checkpoints

B is candidate base; C is context preserved by the floor, already present in B. Raw history is the combined requested positive factor sum before relevance/caps, not a separate score addition. H is admitted combined history. The live aggregate can exceed the floor for current events or existing competitive support; the JSON records both. Values below are rounded for display, while final scores use full precision.

| Case / event:play | Before | Candidate | B | Target | Floor increment | C | Raw history | Admitted H | Signed negative | Pre-round |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 401892521:401892521000005010 | 82 | 73 | 53 | 60.802 | 7.802 | 0 | 15.194 | 12 | 0 | 72.802 |
| 401892521:401892521000009890 | 81 | 72 | 53 | 59.748 | 6.748 | 0 | 15.193 | 12 | 0 | 71.748 |
| 401892521:401892521000009900 | 82 | 73 | 53 | 60.785 | 7.785 | 0 | 15.193 | 12 | 0 | 72.785 |
| 401892521:401892521000009910 | 82 | 73 | 53 | 60.802 | 7.802 | 0 | 15.194 | 12 | 0 | 72.802 |
| 401892521:401892521000009950 | 82 | 73 | 53 | 60.819 | 7.819 | 0 | 15.194 | 12 | 0 | 72.819 |
| 401892524:401892524000008960 | 99 | 83 | 59 | 69.557 | 12.557 | 2 | 15.223 | 11.833 | 0 | 83.39 |
| 401892524:401892524000009020 | 99 | 83 | 59 | 69.228 | 12.228 | 2 | 15.223 | 11.931 | 0 | 83.16 |
| R03 | 94 | 92 | 57 | 89 | 33 | 1 | 6.418 | 2 | 0 | 92 |
| R11 | 94 | 95 | 57 | 88 | 32 | 1 | 15.303 | 6 | 0 | 95 |
| R14 | 95 | 95 | 57 | 87.525 | 31.525 | 1 | 24.353 | 6.142 | 0 | 94.668 |
| 401892519:401892519000008130 | 18 | 18 | 15 | 0 | 0 | 1 | 3 | 3 | 0 | 18 |
| 401892519:401892519000009650 | 7 | 7 | 8 | 0 | 0 | 1 | 3 | 0 | -1.305 | 6.695 |
| 401892520:401892520000006830 | 61 | 61 | 55 | 0 | 0 | 3 | 4.688 | 4.688 | 0 | 60.688 |
| 401892520:401892520000008950 | 87 | 77 | 54 | 66.932 | 13.932 | 1 | 9.3 | 9.3 | 0 | 77.231 |
| 401892522:401892522000007140 | 18 | 18 | 18 | 0 | 0 | 4 | 0 | 0 | 0 | 18 |
| 401892522:401892522000009730 | 2 | 2 | 5 | 0 | 0 | 2 | 0 | 0 | -2.979 | 2.021 |

The six additional checkpoints were selected and baseline-scored before implementation: 60% and 85% replay indices in the first three eligible NHL games outside the reviewed examples (401892519, 401892520, 401892522). They include competitive second-period/one-goal third-period states and settled three-/four-goal games. They were not selected for desired candidate scores.

The Tampa Bay 3-2 Vancouver examples at third-period elapsed 7:09-7:17 have **12:51-12:43 remaining**, not the old generic helper's 4:51-4:43. They retain all 12 admitted history points. For the first, 53 + 6.748 + 12 = 71.748 -> 72. The decrease from 81 reflects corrected urgency and the regulation curve, not twelve points of history cancelled through headroom. They remain in the product's Strong watch range.

Montreal-Buffalo's 3-3 examples have **9:33/9:17 remaining**. They move 99 -> 83: 59 + 12.228 + 11.931 = 83.160 and 59 + 12.557 + 11.833 = 83.390. Their prior near-finish targets were driven by the wrong clock convention. Almost the entire history allowance survives.

R03: 57 + 33 + 2 = **92** (regular OT, high watchability). R11: 57 + 32 + 6 = **95**, with materially stronger event history. R14: 57 + 31.525 + 6.142 = 94.668 -> **95**. R14's target falls while admitted history rises from 4 to 6.142 because the old erroneous <=15-second branch is replaced by the independent event budget; this is disclosed, not hidden compensation for a lower target. Ordinary OT's two-point history allowance does not increase when its target falls, as explicitly tested.

## Raw labels, clocks and postseason comparison

| Case | Retained provider label | Convention | Old depth | Candidate depth | Actual remaining |
| --- | --- | --- | --- | --- | --- |
| R03 | OT 2:28 | elapsed | 28 | 1 | 2:32 of 5:00 |
| R11 | OT 0:05 | elapsed | 5 | 1 | 4:55 of 5:00 |
| R14 | 3rd 19:41 | elapsed | 0 | 0 | 0:19 of 20:00 |

The same R03/R11 inputs expressed with remaining clocks produce the same candidate scores and admitted history (92/2 and 95/6). Real retained clock-bearing labels are also used in hypothetical postseason variants: their first-OT depth stays 1, but the same elapsed duration corresponds to 17:32/19:55 remaining in a twenty-minute OT. No regular/playoff format equivalence or missing manpower is invented. Tests also cover 2OT/3OT, regulation, intermission, shootout, absent periods, conflicting labels/structured periods, and conflicting/missing season metadata. Unknown counts/durations remain null with diagnostics.

## Explicitly hypothetical context and action comparisons

The first table holds 2-2 action, raw history, elapsed OT time and manpower fixed. Team quality, rivalry and former-captain-return storyline use their existing separate evidence rules; unverified storyline is the negative control. Postseason/final rows change supported stakes metadata and use the proper OT length. Postseason pregame rules continue to omit regular-season record-quality factors.

| Hypothetical first-OT context | Before | Candidate | Opening | B | Target | C | H |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary | 94 | 90 | 41 | 56 | 88 | 0 | 2 |
| strong-teams | 94 | 91 | 57 | 57 | 88 | 1 | 2 |
| unknown-records | 94 | 90 | 37 | 56 | 88 | 0 | 2 |
| rivalry | 94 | 91 | 48 | 57 | 88 | 1 | 2 |
| storyline | 94 | 91 | 51 | 57 | 88 | 1 | 2 |
| unverified-storyline | 94 | 90 | 41 | 56 | 88 | 0 | 2 |
| postseason | 99 | 99 | 64 | 72 | 95 | 1 | 6.489 |
| deciding-final | 99 | 99 | 90 | 97 | 99 | 0 | 6.489 |

Unknown records earn no invented poor-team penalty. Known .500 records can retain their existing positive factor; rounding can therefore distinguish known from unknown on some archived contexts. The new ordinary/strong-team comparison separates 90/91 without a forced minimum award.

Standardizing those same context inputs around the reviewed action produces:

| Standardized hypothetical context | R03 | R11 | R14 |
| --- | --- | --- | --- |
| ordinary | 91 | 95 | 95 |
| strong-teams | 92 | 96 | 96 |
| unknown-records | 91 | 94 | 94 |
| rivalry | 92 | 95 | 95 |
| storyline | 92 | 95 | 95 |
| unverified-storyline | 91 | 95 | 95 |
| postseason | 99 | 99 | 99 |
| deciding-final | 99 | 99 | 99 |

Rivalry/storyline still round away on R11/R14. The actual reviewed baseline records differ from these standardized hypothetical records, so an original reviewed score need not equal its hypothetical ordinary variant.

| Hypothetical situation | Before | Candidate | B + live + H + signed negative |
| --- | --- | --- | --- |
| quiet-tie | 90 | 87 | 57 + 26 + 4 + 0 |
| pressure-tie | 94 | 91 | 57 + 30 + 4 + 0 |
| one-goal-manpower | 97 | 95 | 53 + 38 + 4 + 0 |
| extraordinary-current | 96 | 94 | 57 + 30 + 7.2 + 0 |
| defensive-scoreless | 84 | 83 | 57 + 26 + 0 + 0 |
| settled | 1 | 1 | 1 + 0 + 0 + 0 |

The shorthanded-goal fixture is a valid latest tying goal and has six raw current-event points, subject to the unchanged shared event budget; its admitted history remains separately bounded. Scoreless defensive play can still rate strongly, and the settled four-goal case remains 1.

## One completed final corrected replay

7,944 checkpoints / 25 NHL games: **501 increased, 914 decreased, 6,529 unchanged**. Checkpoint-weighted mean **52.6811 -> 51.9383**; equal-game mean **52.2850 -> 51.5698**. Exact archived 99s **12 -> 0**. These describe the result, not optimization targets or evidence of accuracy. Synthetic supported playoff cases retain 99. All checkpoints pass final-accounting, input immutability, unchanged raw trajectory, Current Tension, Generic Leverage and context-weight assertions.

| Representative change | Situation and explanation |
| --- | --- |
| 401892530:401892530000009310, 95 -> 76 | Los Angeles-Boston 1-1, third elapsed 10:53 / remaining 9:07, giveaway. B=57; old target/floor 89/32 becomes 69.826/12.826. History stays 6.472. 57+12.826+6.472=76.298. Clock correction, not history cancellation, drives the largest decrease. |
| 401892527:401892527000008990, 89 -> 71 | Columbus-New York Rangers 0-0, third elapsed 11:10 / remaining 8:50, shot high/wide. No admitted scoring history. Target 89 becomes 70.379, preserved C=1, B=58 and floor=13.379. Defensive scoreline remains eligible; this earlier low-action state is Strong watch rather than near-finish urgency. |
| 401892520:401892520000008280, 63 -> 70 | Winnipeg 2, Carolina 3, third elapsed 6:43 / remaining 13:17 after a goal. Old target/floor 0/0 becomes 59.448/6.448, with C=1 and B=54. History stays 9.305. 54+6.448+9.305=69.753. The continuous one-goal branch now recognizes competitiveness before the old cutoff. |

Per-game checkpoint means (equal-game aggregate weights each of these games once):

| Event | Checkpoints | Before mean | Candidate mean | Delta |
| --- | --- | --- | --- | --- |
| 401892519 | 323 | 31.786 | 31.786 | 0 |
| 401892520 | 342 | 68.266 | 66.734 | -1.532 |
| 401892521 | 296 | 59.736 | 58.774 | -0.963 |
| 401892522 | 322 | 34.236 | 34.236 | 0 |
| 401892523 | 282 | 50.727 | 50.472 | -0.255 |
| 401892524 | 312 | 68.445 | 67.394 | -1.051 |
| 401892525 | 364 | 66.489 | 65.978 | -0.511 |
| 401892526 | 324 | 63.441 | 62.676 | -0.765 |
| 401892527 | 341 | 68.666 | 65.153 | -3.513 |
| 401892528 | 313 | 41.172 | 41.172 | 0 |
| 401892529 | 276 | 50.739 | 50.794 | 0.054 |
| 401892530 | 355 | 62.222 | 59.394 | -2.828 |
| 401892531 | 324 | 25.173 | 25.173 | 0 |
| 401892532 | 267 | 23.532 | 23.532 | 0 |
| 401892539 | 341 | 62.126 | 61.285 | -0.842 |
| 401892540 | 339 | 54.354 | 54.841 | 0.487 |
| 401892541 | 306 | 43.137 | 43.441 | 0.304 |
| 401892542 | 319 | 60.223 | 58.364 | -1.859 |
| 401892543 | 302 | 33.308 | 33.308 | 0 |
| 401892544 | 314 | 67.538 | 65.022 | -2.516 |
| 401892545 | 288 | 66.226 | 65.451 | -0.774 |
| 401892546 | 329 | 58.164 | 57.781 | -0.383 |
| 401892547 | 342 | 50.517 | 49.836 | -0.681 |
| 401892548 | 309 | 54.427 | 54.178 | -0.249 |
| 401892549 | 314 | 42.471 | 42.471 | 0 |

## Validation and preservation

- Initial focused set: 30/30 passed. A stricter one-second check then found tiny-floor activation and fractional-cap/rounded-target drops. The in-progress first replay attempt was interrupted before producing results. Those defects were fixed and the tests strengthened before the **single completed final replay**. No replay distribution was used for tuning.
- Final affected set: **51/51 passed**, covering new NHL semantics, retained NFL experiment, NFL/NHL calibration and public/browser/Node/Worker parity across the archived fixtures. Afterward, one additional direct classic-browser test of the opt-in NHL timing/target/history/aggregation helpers passed. The earlier broader relevant suite passed 78/78; only affected checks were repeated after the boundary fix.
- Final syntax checks passed for all changed/new executable files; `git diff --check` passed. Existing module-type and CRLF notices only.
- Cross-sport candidate/baseline comparisons cover NFL, CFB, NBA, NCAAB and MLB; default production parity additionally covers Soccer/Tennis. The NHL branch is explicitly sport-gated. The existing NFL policy and allocation arithmetic remain intact, including R13=90 and R06/R12=87/85. Completed and default scoring match their old outputs. Input immutability and non-live isolation pass.

Commands:

`node --test --test-reporter=spec test/live-nhl-allocation.test.js test/live-endgame-allocation.test.js test/live-history-relevance.test.js test/trajectory-live.test.js`

`node --test --test-reporter=spec test/scoring-module-parity.test.js test/replay-inputs.test.js test/replay-input-comparison.test.js test/shadow-candidate.test.js test/shadow-candidate-report.test.js test/trajectory-live-calibration.test.js test/current-tension-calibration.test.js test/nfl-calibration.test.js test/nhl-calibration.test.js`

Final affected rerun: `node --test --test-reporter=spec test/live-nhl-allocation.test.js test/live-endgame-allocation.test.js test/scoring-module-parity.test.js test/nfl-calibration.test.js test/nhl-calibration.test.js`

Additional direct browser check: `node --test --test-reporter=spec --test-name-pattern='opt-in NHL shared' test/live-nhl-allocation.test.js`

Replay: `node scripts/replay-input-comparison.mjs --nhl-allocation`

[Results and full component diagnostics](../work/live-nhl-allocation-results.json), [replay log](../work/live-nhl-allocation-replay.log), [parity log](../work/live-nhl-allocation-parity.log), [final affected tests](../work/live-nhl-allocation-final-tests.log). Existing endgame/history reports and results are untouched; no manifest or new provenance workflow.

## Specific remaining disagreements

- **R14 remains 95**, the current UI's Exceptional band. That may overstate the supplied ?would switch, high urgency, not immediate? judgment. No exact target was supplied, and the result was not tuned after replay. The candidate fixes its clock and accounts explicitly for the two-goal recovery but does not establish that 95 is the best human recommendation.
- Rivalry/storyline differences still disappear through rounding on R11/R14. Strong-team context separates by one point on those same action histories; there is no universal guaranteed context bonus.
- Ordinary playoff opener and deciding-final variants with substantial history both clamp to 99, despite distinct underlying targets (95 versus 99). The regular/playoff separation is clear; finer distinctions at saturation remain unresolved.
- Quiet fixed-manpower states can soften over longer intervals as historical credit fades even when manpower persists. Tests rule out drops at the declared adjacent-second activation/clock knots, not all decreases from event aging or changing pressure.
- Defaults deliberately retain their old OT/clock behavior. Correct real-label postseason depth is verified in the opt-in path, including counterfactuals on actual provider labels; this is not a production promotion or proof over every provider format. Missing/conflicting timing metadata remains explicitly uncertain.

Changed this task: `scoring/sports/nhl.js`, `scoring/shared/events.js`, `scoring/shared/pressure.js`, `calibration/shadow-candidate.cjs`, `calibration/trajectory-live-policy.cjs`, `scripts/replay-input-comparison.mjs`; added `calibration/nhl-allocation-fixtures.mjs`, `test/live-nhl-allocation.test.js`, and this report. Existing uncommitted endgame fixtures/test/report were preserved.
