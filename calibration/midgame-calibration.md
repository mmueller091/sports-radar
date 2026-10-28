# CFB midgame and NHL opening calibration

Immediate baseline: frozen working engine before this patch, including existing NHL calibration. Synthetic cases are not provider captures.

## CFB

| Case | Before | After |
| --- | ---: | ---: |
| Q1 8:00, gap 0 | 45 | 45 |
| Q2 10:00, gap 0 | 46 | 46 |
| Q2 2:00, gap 0 | 46 | 60 |
| Q2 2:00, gap 3 | 46 | 57 |
| Q2 2:00, gap 7 | 45 | 51 |
| Q2 2:00, gap 10 | 44 | 44 |
| Q2 2:00, gap 14 | 40 | 40 |
| Q3 12:00, gap 0 | 47 | 62 |
| Q3 7:30, gap 0 | 47 | 66 |
| Q3 2:00, gap 0 | 48 | 70 |
| Q3 2:00, gap 3 | 48 | 66 |
| Q3 2:00, gap 7 | 46 | 59 |
| Q3 2:00, gap 10 | 44 | 50 |
| Q3 2:00, gap 14 | 40 | 43 |
| Q3 2:00, gap 21 | 32 | 21 |
| Q3 12:00, gap 14 | 40 | 40 |
| Q3 7:30, gap 14 | 40 | 41 |

## CFB tied Q3/Q4 transition

| Case | Before | After |
| --- | ---: | ---: |
| 3:00 Q3 | 69 | 69 |
| 2:00 Q3 | 70 | 70 |
| 1:00 Q3 | 49 | 71 |
| 0:10 Q3 | 49 | 72 |
| 15:00 Q4 | 49 | 72 |
| 14:00 Q4 | 49 | 72 |
| 12:00 Q4 | 49 | 72 |
| 10:00 Q4 | 50 | 73 |
| 5:00 Q4 | 79 | 79 |

## CFB gap 3 Q3/Q4 transition

| Case | Before | After |
| --- | ---: | ---: |
| 3:00 Q3 | 66 | 66 |
| 2:00 Q3 | 66 | 66 |
| 1:00 Q3 | 48 | 68 |
| 0:10 Q3 | 49 | 69 |
| 15:00 Q4 | 49 | 69 |
| 14:00 Q4 | 49 | 69 |
| 12:00 Q4 | 49 | 69 |
| 10:00 Q4 | 50 | 69 |
| 5:00 Q4 | 77 | 77 |

## CFB gap 7 Q3/Q4 transition

| Case | Before | After |
| --- | ---: | ---: |
| 3:00 Q3 | 58 | 58 |
| 2:00 Q3 | 59 | 59 |
| 1:00 Q3 | 46 | 60 |
| 0:10 Q3 | 47 | 61 |
| 15:00 Q4 | 47 | 61 |
| 14:00 Q4 | 48 | 61 |
| 12:00 Q4 | 47 | 61 |
| 10:00 Q4 | 49 | 62 |
| 5:00 Q4 | 76 | 76 |

## CFB 14-point carryover check

| Case | Before | After |
| --- | ---: | ---: |
| 3:00 Q3 | 43 | 43 |
| 2:00 Q3 | 43 | 43 |
| 1:00 Q3 | 41 | 41 |
| 0:10 Q3 | 41 | 41 |
| 15:00 Q4 | 41 | 41 |
| 14:00 Q4 | 41 | 41 |
| 12:00 Q4 | 41 | 41 |
| 10:00 Q4 | 43 | 43 |
| 5:00 Q4 | 45 | 45 |

## CFB example-style states

| Case | Before | After |
| --- | ---: | ---: |
| 21-21 Q2 1:59 | 46 | 60 |
| 35-21 Q3 2:23, long leader TD | 45 | 43 |

## Explosive TD shock

| Case | Before | After |
| --- | ---: | ---: |
| closing | 5 | 5 |
| tying | 5 | 5 |
| lead | 5 | 3 |
| widening | 5 | 0 |
| wide | 5 | 0 |
| garbage | 5 | 0 |

## NHL opening grid

| Case | Before | After |
| --- | ---: | ---: |
| Opening 40, P1 18:00, gap 0 | 45 | 45 |
| Opening 40, P1 13:00, gap 0 | 46 | 46 |
| Opening 40, P1 13:00, gap 1 | 43 | 43 |
| Opening 40, P1 13:00, gap 2 | 36 | 36 |
| Opening 40, P1 13:00, gap 3 | 31 | 31 |
| Opening 40, P1 5:00, gap 0 | 47 | 47 |
| Opening 40, P1 5:00, gap 1 | 45 | 45 |
| Opening 40, P2 15:00, gap 0 | 49 | 49 |
| Opening 40, P2 15:00, gap 1 | 47 | 47 |
| Opening 40, P2 10:00, gap 0 | 50 | 50 |
| Opening 40, P2 10:00, gap 1 | 47 | 47 |
| Opening 40, P2 5:00, gap 0 | 50 | 50 |
| Opening 40, P2 5:00, gap 2 | 30 | 30 |
| Opening 55, P1 18:00, gap 0 | 51 | 55 |
| Opening 55, P1 13:00, gap 0 | 51 | 55 |
| Opening 55, P1 13:00, gap 1 | 48 | 54 |
| Opening 55, P1 13:00, gap 2 | 41 | 41 |
| Opening 55, P1 13:00, gap 3 | 36 | 36 |
| Opening 55, P1 5:00, gap 0 | 52 | 52 |
| Opening 55, P1 5:00, gap 1 | 50 | 50 |
| Opening 55, P2 15:00, gap 0 | 53 | 53 |
| Opening 55, P2 15:00, gap 1 | 51 | 51 |
| Opening 55, P2 10:00, gap 0 | 54 | 54 |
| Opening 55, P2 10:00, gap 1 | 51 | 51 |
| Opening 55, P2 5:00, gap 0 | 53 | 53 |
| Opening 55, P2 5:00, gap 2 | 33 | 33 |
| Opening 65, P1 18:00, gap 0 | 54 | 65 |
| Opening 65, P1 13:00, gap 0 | 55 | 65 |
| Opening 65, P1 13:00, gap 1 | 52 | 64 |
| Opening 65, P1 13:00, gap 2 | 45 | 45 |
| Opening 65, P1 13:00, gap 3 | 40 | 40 |
| Opening 65, P1 5:00, gap 0 | 55 | 61 |
| Opening 65, P1 5:00, gap 1 | 53 | 59 |
| Opening 65, P2 15:00, gap 0 | 56 | 56 |
| Opening 65, P2 15:00, gap 1 | 54 | 54 |
| Opening 65, P2 10:00, gap 0 | 57 | 57 |
| Opening 65, P2 10:00, gap 1 | 54 | 54 |
| Opening 65, P2 5:00, gap 0 | 56 | 56 |
| Opening 65, P2 5:00, gap 2 | 36 | 36 |
| Opening 80, P1 18:00, gap 0 | 60 | 80 |
| Opening 80, P1 13:00, gap 0 | 61 | 80 |
| Opening 80, P1 13:00, gap 1 | 58 | 78 |
| Opening 80, P1 13:00, gap 2 | 51 | 51 |
| Opening 80, P1 13:00, gap 3 | 46 | 46 |
| Opening 80, P1 5:00, gap 0 | 60 | 75 |
| Opening 80, P1 5:00, gap 1 | 58 | 72 |
| Opening 80, P2 15:00, gap 0 | 60 | 60 |
| Opening 80, P2 15:00, gap 1 | 58 | 58 |
| Opening 80, P2 10:00, gap 0 | 61 | 61 |
| Opening 80, P2 10:00, gap 1 | 58 | 58 |
| Opening 80, P2 5:00, gap 0 | 59 | 59 |
| Opening 80, P2 5:00, gap 2 | 39 | 39 |
| Opening 90, P1 18:00, gap 0 | 64 | 90 |
| Opening 90, P1 13:00, gap 0 | 64 | 90 |
| Opening 90, P1 13:00, gap 1 | 61 | 88 |
| Opening 90, P1 13:00, gap 2 | 54 | 54 |
| Opening 90, P1 13:00, gap 3 | 49 | 49 |
| Opening 90, P1 5:00, gap 0 | 64 | 85 |
| Opening 90, P1 5:00, gap 1 | 62 | 81 |
| Opening 90, P2 15:00, gap 0 | 63 | 64 |
| Opening 90, P2 15:00, gap 1 | 61 | 61 |
| Opening 90, P2 10:00, gap 0 | 63 | 63 |
| Opening 90, P2 10:00, gap 1 | 60 | 60 |
| Opening 90, P2 5:00, gap 0 | 62 | 62 |
| Opening 90, P2 5:00, gap 2 | 42 | 42 |

## NHL example-style states (supplied opening approximations)

| Case | Before | After |
| --- | ---: | ---: |
| Bruins–Carolina style, opening 61 | 51 | 60 |
| Devils–Dallas style, opening 54 | 49 | 53 |

## CFB A–Y

| Case | Before | After |
| --- | ---: | ---: |
| A | 46 | 46 |
| B | 77 | 77 |
| C | 87 | 87 |
| D | 19 | 19 |
| E | 44 | 44 |
| F | 93 | 93 |
| G | 45 | 45 |
| H | 30 | 30 |
| I | 1 | 1 |
| J | 89 | 89 |
| K | 94 | 94 |
| L | 97 | 97 |
| M | 93 | 93 |
| N | 4 | 4 |
| O | 96 | 96 |
| P | 95 | 95 |
| Q | 94 | 94 |
| R | 93 | 93 |
| S | 90 | 90 |
| T | 96 | 96 |
| U | 97 | 97 |
| V | 99 | 99 |
| W | 1 | 1 |
| X | 77 | 77 |
| Y | 77 | 77 |

## NFL A–P

| Case | Before | After |
| --- | ---: | ---: |
| A | 53 | 53 |
| B | 64 | 64 |
| C | 87 | 87 |
| D | 40 | 40 |
| E | 52 | 52 |
| F | 92 | 92 |
| G | 56 | 56 |
| H | 42 | 42 |
| I | 64 | 64 |
| J | 55 | 55 |
| K | 92 | 92 |
| L | 39 | 39 |
| M | 99 | 99 |
| N | 56 | 56 |
| O | 93 | 93 |
| P | 94 | 94 |

## NHL P3/OT

| Case | Before | After |
| --- | ---: | ---: |
| Tied 12:00 third | 58 | 58 |
| Tied 10:00 third | 65 | 65 |
| Tied 7:30 third | 71 | 71 |
| Tied 5:00 third | 77 | 77 |
| Tied 2:00 third | 84 | 84 |
| Tied 1:00 third | 88 | 88 |
| Down 1, 2:00 | 74 | 74 |
| Down 1, goalie pulled, 1:00 | 85 | 85 |
| Down 1, 6-on-4, 1:00 | 91 | 91 |
| Down 2, 10:00 third | 33 | 33 |
| Down 2, 5:00 third | 24 | 24 |
| Down 2, 2:00 third | 15 | 15 |
| Down 2, 1:00 third | 8 | 8 |
| Down 3, 10:00 third | 10 | 10 |
| Down 3, 5:00 third | 7 | 7 |
| Down 3, 2:00 third | 5 | 5 |
| Down 3, 1:00 third | 5 | 5 |
| Regular-season OT | 80 | 80 |
| Shootout | 82 | 82 |
| Playoff OT | 90 | 90 |
| Playoff 2OT | 93 | 93 |
| Playoff 3OT | 96 | 96 |
| Stanley Cup Final deciding game OT | 99 | 99 |

## All provider movements ≥10

| Case | Before | After |
| --- | ---: | ---: |

Provider counts and score changes:

```json
{
  "CFB": {
    "total": 50,
    "changed": 0
  },
  "MLB": {
    "total": 2,
    "changed": 0
  },
  "NBA": {
    "total": 3,
    "changed": 0
  },
  "NCAAB": {
    "total": 2,
    "changed": 0
  },
  "NFL": {
    "total": 25,
    "changed": 0
  },
  "NHL": {
    "total": 25,
    "changed": 0
  }
}
```

All unaffected sports and all non-live provider outputs are deeply identical. Completed history and capped pregame outputs are included.

## Boundary behavior

The CFB floor rises through the end of Q3 and carries into early Q4. The existing Q4 score overtakes it before 5:00, so calibrated late-Q4 behavior remains authoritative. Margins above ten lose carryover smoothly and a 14-point game receives none after 2:00 Q3.

NHL opening retention reaches zero at P3. The existing P3 situation floor already changes some boundary scores (opening 40 tied: 50 → 52); that pre-existing behavior is preserved.

## Exact formulas

Let S(x)=clamp(x,0,1)^2*(3-2*clamp(x,0,1)); p is regulation progress. All floors use max(existing live score, round(target)), so rankings, stakes, WP and generic context are consumed rather than added again.

CFB target = [60+44*max(0,min(.75,p)-.5)+S((p-43/60)/(2/60))+6*max(0,p-.75)] * S((p-23/60)/(5/60)) * V(margin) * C. It is active for 23/60 < p < 11/12. V uses smoothstep interpolation through (0,1),(3,.955),(7,.85),(10,.72),(14,.62),(21,.30),(28,0). C=1 through 2:00 Q3, then C=S((14-margin)/4), which leaves close games intact and removes carryover at 14 points.

CFB Q3 expected possessions: B + (Q-B)*W, where B=max(0,14*(1-p)+0.5+possessionAdjustment), Q=max(0,2.1+6*max(0,43/60-p)+0.15*possessionAdjustment), and W=S((p-.5)/(43/60-.5))*S((.75-p)/(2/60)). Existing Q4 runway overrides this unchanged.

CFB scoring shock weight: verified shrinking absolute margin gets 1-S((postGap-8)/13); tied to a lead of at most 8 gets .6; all other widening or unknown scoring direction gets 0. Non-scoring events retain weight 1. Existing event decay and 12-point cap remain.

NHL target = min(90,openingScore)*R(elapsed)*M(gap,elapsed). R uses smoothstep interpolation through minute/weight anchors (0,1),(10,1),(20,.88),(30,.55),(40,0); no floor at or after P3. Let A=.98-.04*clamp((elapsed-10)/10,0,1). M=1-(1-A)*gap for gap<=1, otherwise A*exp(-3*(gap-1)^2).

NHL first-ten-minute one-goal retention is 98%, slightly above the requested approximate 90–95%, to also reach the low/mid-opening example targets. At end P1 it is .88*.94=82.72%.

## Validation

Final full suite on the completed handoff tree: 327/327 passed. test-score.js, both existing calibration report commands, this immediate-baseline report, and git diff --check pass.

The historical CFB report harness now adapts its old pregame oracle using the existing cap helper and defers independently calibrated NHL comparisons to the immediate baseline. Its pre-existing working report file was preserved.
