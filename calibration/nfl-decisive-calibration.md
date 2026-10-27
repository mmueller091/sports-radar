# NFL decisive-possession calibration — October 27, 2026

Implemented and tested locally. Nothing deployed. This pass starts from the
previous NFL audit's working-tree state, rather than from Git HEAD or the frozen
pre-extraction engine. All prior audit edits were preserved.

## Exact files changed by this pass

- `scoring/sports/nfl.js`: compute the stronger competitive floor in the existing
  NFL situation hook; reuse field-position parsing and timeout runway.
- `rating-core.js`: allow that NFL floor to exceed the ordinary competitive caps
  and survive a negative WP contribution. Other sports retain existing behavior.
- `test/helpers/nfl-calibration.cjs`: optional goal-to-go and probability inputs;
  optional sport argument for CFB comparisons.
- `test/nfl-calibration.test.js`: stronger A–P assertions, focused boundary cases,
  browser/CFB parity, WP overlap and repeated-refresh regressions.
- `test/late-football-drive.test.js`: verify the new NFL floor exactly; preserve
  CFB's exact 18/20-point expectations and all existing directional assertions.
- `test/scoring-modules.test.js`: compare all A–P enriched snapshots against the
  executed, self-contained Worker bundle.
- `scripts/nfl-calibration-report.cjs`: distinguish pre-audit, prior-audit and
  current scores in the generated report.
- `calibration/nfl-decisive-baseline.json`: saved prior-audit scores for reporting.
- `calibration/nfl-decisive-calibration.md`: this report.

`scoring/shared/football.js`, other sport models, probability weights, pregame,
upset, final/history and OT formulas were not edited in this pass. The old NFL
bonus assertions were replaced with exact checks of the new floor, not deleted
or relaxed. The prior 20-point no-stacking assertion now checks exact headroom
floor equality, reinforced by independent WP overlap tests.

## Exact floor and interaction

For an identified tied/trailing offense with a deficit of 0–8, an existing
decisive drive, and 0 < Q4 seconds <= 180, calculate:

```text
F = round(max(0, 99 - refreshedBaseScore) × consequence × urgency × viability)
urgency = clamp((240 - seconds) / 120, 0, 1)  // existing drive urgency
territory = clamp((fieldPosition - 25) / 55, 0, 1)
consequence = 0.70 + 0.06 × territory
```

Field position is yards advanced from the offense's own goal line. Missing
position gives territory zero. Consequence is replaced by 0.80 when the deficit
is less than three and position is at least 58 (the existing winning-FG range
threshold). The following use `max`, not addition:

- Final trailing fourth down: at least `0.82 + 0.04 × shortness`, where
  `shortness = clamp((10 - distance) / 9, 0, 1)` for a valid positive distance,
  otherwise zero.
- Explicit goal-to-go at the opponent ten or closer: at least 0.86.
- Explicit pending two-point try in the final two minutes: 0.86 to tie (down two),
  0.90 to lead (down one). Urgency and viability are one, including a live untimed
  try at 0:00. Tries down nine/ten retain prior leverage rather than this floor.

A fourth down is final when the unchanged `footballClockRunway` estimate after
a turnover leaves at most 15 seconds for another possession. This estimate uses
the current trailing team's timeouts and assumes the opponent's new first down.
If timeout inputs are missing/invalid, use the conservative <=60-second fallback.
No timeout points are awarded; leader-possession runway math is untouched.

For ordinary drives, `viability = min(1, seconds / (8 + 0.65 × yardsNeeded))`.
`yardsNeeded = max(0, targetPosition - fieldPosition)`, where targetPosition is
65 for deficits <=3 and 100 for TD-required deficits. Missing position uses 75
yards. Explicit goal-to-go and critical tries have viability one because an
immediate snap can score. This is a calibration heuristic, not a new WP model.

The existing legacy drive floor `D = round(urgency × (18 + min(2, positionBonus)))`
remains. With `S` the capped situation component, `P+` positive probability,
`R` pressure, and `E` milestone plus event-shock components:

```text
competitive = min(max(20,F), max(D,F,P+ + S + R))
positive = min(max(30,F), competitive + E)
negative = max(-8, min(0, probabilityComponent))
liveBonus = F > 0 ? max(F, positive + negative) : positive + negative
```

`F` is zero outside the new NFL states. Situation still caps at 12; ordinary
competitive/positive caps remain 20/30. The floor is an interaction inside the
existing competitive mechanism, with no additive FG, fourth-down, try or OT
award. WP estimates and weights remain identical. Headroom scaling yields a
smaller increase for an already-high upset/stakes state. No A–P case identifier
or target final score is used by runtime code. OT remains on its existing logic.

## Before/after A–P matrix

These synthetic archetypes share the original calibration context. Scores are
context-dependent and include existing history adjustments.

| Case | State | Prior audit | This pass |
| --- | --- | ---: | ---: |
| A | Three-point game, Q2 | 53 | 53 |
| B | Three-point game, 4:00 Q4 | 64 | 64 |
| C | Down five, own 25, 1:30 | 77 | 87 |
| D | Down five, opponent first down, 1:30, zero TO | 40 | 40 |
| E | Same as D, three TO | 52 | 52 |
| F | Tied, opponent 35, 1:00 | 85 | 92 |
| G | Leader possessing, opponent three TO, 2:30 | 56 | 56 |
| H | Leader possessing, opponent zero TO, 1:20 | 42 | 42 |
| I | Low scoring with defensive action | 64 | 64 |
| J | Same score, empty punt-fest | 55 | 55 |
| K | +14 underdog trailing three with ball | 90 | 92 |
| L | +14 underdog trailing ten | 39 | 39 |
| M | Championship sudden-death OT | 99 | 99 |
| N | Early fourth-and-one | 56 | 56 |
| O | Final meaningful fourth down, down five | 80 | 93 |
| P | Critical two-point try to tie | 81 | 94 |

B/D/E/G/H/I/J/L/M are unchanged. K remains high with the same nine-point upset
component; L retains its three-point upset component. C/F/O/P meet the requested
ranges without changing state-rating, history or upset formulas.

## Relative assertions and focused outcomes

The matrix verifies `F > C > B`, `O > C`, `P > C`, `M >= O`, `M > C/F`, `M >= P`,
`K >= L+15`, `E > D`, `G >= H+10`, `I >= J+5`, and `O > N+20`. Existing `B > A`
and `C > E` assertions also remain. Broad ranges cover B/C/F/K/O/P.

Additional assertions:

- Tied at opponent 35 (92) > tied at own 20 (89), both 1:00.
- Down five at opponent 20 (90) > own 20 (87), both 1:30.
- Final fourth-and-one (94) > fourth-and-ten (92) > C (87).
- Final fourth down O (93) > ordinary late fourth down at 2:30 (82).
- Fourth down with no realistic return after failure (93) > same state with
  three timeouts and return runway (89).
- Critical try to win (95) > try to tie (94) > routine early try (54) + 25.
- Tied goal-to-go (94) > F (92); trailing goal-to-go (94) > trailing red zone (90).
- M (99) exceeds tied goal-to-go (94) and winning try (95).
- Desperate full-field drive at 0:01, unknown possession, expired ordinary drive,
  missing clock, and a try down ten each stay below C.
- Explicit untimed try at 0:00 exceeds an expired ordinary drive.
- C exceeds clock-draining leader H by more than 30; losing possession removes
  the floor and drops the score by more than 30.

For C/F/O/P and tied goal-to-go, probabilities .01/.50/.80/.99 leave the decisive
score unchanged while the probability component exactly matches the archived
engine. Reapplying an identical snapshot three times leaves C unchanged.
All focused cases and probability variants match browser/Node execution and
retain exact CFB parity with the frozen engine.

## Validation and artifacts

- NFL calibration plus late-drive tests: **14 passed, 0 failed**.
- Full scoring and Worker suite: **244 passed, 0 failed, 0 skipped**.
- Browser fixtures (`node test-score.js`): both score-model and watchlist/timeline
  groups passed. Full suite also validates classic-script equivalence.
- Worker bundle: builds and executes locally, with A–P snapshot equality.
- NFL matrix report and real-game calibration report: completed successfully.
- Independent comparison with the engine captured at the start of this pass:
  **all 107 real-game calibration outputs unchanged**.
- CFB: archived rating/history/snapshot parity plus the new focused-state and
  probability comparisons pass; no CFB behavior was changed.
- `git diff --check`: passed.

The first sandboxed full run passed 243/244; esbuild could not read parent
directories. The unchanged bundling test passed with that access, and the final
full run with access passed all 244. No checks were skipped or weakened to bypass
that environment limitation.

Logs, the starting engine/matrix, and generated real-game CSV are retained in
ignored `work/nfl-decisive-pass/`. The repository's previously clean `latest.csv`
was restored after report generation to avoid unrelated historical report churn.

## Remaining modeling limits

Running versus stopped clocks, exact runoff penalties, spike/out-of-bounds
sequences, and exact drive or conversion probabilities remain heuristic.
Offensive timeout effects on a march are not separately reconstructed; timeouts
inform return-possession viability. Kicker/weather-specific range, onside-kick
opportunities and ambiguous OT possession rights are unchanged. Pending tries
still require an explicit provider flag, and goal-to-go requires explicit state
or goal text plus usable field position. Very-low-clock non-goal-line miracle
plays keep the older modest drive floor; the new viability gate does not erase
that prior behavior. Finite tests cannot establish parity for every future feed.
