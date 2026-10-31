# NHL pressure replay comparison

Production experiment disabled. No scoring changes published.

Corrected final NHL public PBP replayed as chronological prefixes. Ratings reconstructed with current production policy; no recorded historical rating observations or historical market/roster context claimed.

| Game | Score | Frames changed | Delta range | Peak old / experiment | Final old / experiment |
| --- | --- | ---: | --- | --- | --- |
| 2024-06-24 EDM at FLA (2023030417) | 1-2 | 127/331 | -2 to +2 | 99 / 99 | 70 / 70 |
| 2024-10-09 CGY at VAN (2024020009) | 6-5 | 50/323 | -1 to +2 | 94 / 96 | 75 / 75 |
| 2024-10-11 PHI at VAN (2024020022) | 3-2 | 174/348 | -2 to +2 | 92 / 93 | 61 / 61 |
| 2025-06-04 FLA at EDM (2024030411) | 3-4 | 85/480 | -2 to +1 | 99 / 99 | 92 / 92 |
| 2025-06-06 FLA at EDM (2024030412) | 5-4 | 175/525 | -3 to +2 | 99 / 99 | 99 / 99 |
| 2025-06-09 EDM at FLA (2024030413) | 1-6 | 46/360 | -2 to +0 | 93 / 92 | 20 / 20 |
| 2025-06-12 EDM at FLA (2024030414) | 5-4 | 105/412 | -3 to +2 | 99 / 99 | 99 / 99 |
| 2025-06-17 EDM at FLA (2024030416) | 1-5 | 58/308 | -1 to +1 | 92 / 92 | 25 / 25 |

{"games":8,"checkpoints":3087,"changed":820,"minDelta":-3,"maxDelta":2,"meanDelta":-0.155814706835115,"changedHistoryPoints":0}

| Situation (overlapping groups, live only) | Frames changed | Delta range | Mean delta | Maximum pressure |
| --- | ---: | --- | ---: | ---: |
| lateOneGoal | 43/99 | -3 to +2 | -0.293 | 3 |
| tied | 310/1216 | -3 to +2 | -0.064 | 4 |
| blowouts | 0/459 | 0 to +0 | 0.000 | 0 |
| powerPlays | 151/437 | -2 to +2 | -0.309 | 3 |
| emptyNets | 1/45 | 0 to +1 | 0.022 | 2 |
| overtime | 17/361 | -1 to +2 | 0.033 | 2 |

Delayed and corrected delivery is a controlled injected sequence on 2024 Final Game 7 event 1213, not an observed historical arrival log. Every snapshot is rebuilt; no accumulated duplicate attempts.

| Injected snapshot | Old | Experimental | Difference | Pressure |
| --- | ---: | ---: | ---: | ---: |
| delayed | 97 | 99 | 2 | 2 |
| arrived | 97 | 99 | 2 | 3 |
| duplicate | 97 | 99 | 2 | 3 |
| type-corrected | 97 | 99 | 2 | 3 |
| owner-corrected | 97 | 99 | 2 | 2 |
| removed | 97 | 99 | 2 | 2 |

Full event-by-event ratings, pressure components, targets, and history points: [comparison JSON](output/nhl-pressure-comparison.json). Counts describe event checkpoints, not equal intervals of wall time.
