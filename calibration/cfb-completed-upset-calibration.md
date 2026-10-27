# Narrow completed CFB upset calibration — 2026-10-27

All before values use the immediate pre-upset-pass frozen engine, not the earlier completed redesign baseline. Stored captures only; no live provider verification or deployment.

## Synthetic A–S

| Case | Before | After | Upset points | Base | History | Path/OT adjustment |
| --- | --- | --- | --- | --- | --- | --- |
| A | 52 | 52 | 6 | 45 | 7 | 0 |
| B | 57 | 60 | 14 | 53 | 7 | 0 |
| C | 62 | 71 | 25 | 64 | 7 | 0 |
| D | 67 | 84 | 38 | 77 | 7 | 0 |
| E | 68 | 88 | 42 | 81 | 7 | 0 |
| F | 4 | 4 | 3 | 1 | 0 | 3 |
| G | 5 | 5 | 4 | 1 | 0 | 4 |
| H | 6 | 6 | 5 | 1 | 0 | 5 |
| I | 71 | 71 | 11 | 15 | 7 | 49 |
| J | 13 | 15 | 11 | 15 | 0 | 0 |
| K | 57 | 60 | 14 | 53 | 7 | 0 |
| L | 57 | 61 | 15 | 54 | 7 | 0 |
| M | 60 | 64 | 18 | 57 | 7 | 0 |
| N | 60 | 65 | 19 | 58 | 7 | 0 |
| O | 72 | 92 | 46 | 85 | 7 | 0 |
| P | 8 | 8 | 7 | 1 | 0 | 7 |
| Q | 62 | 71 | 25 | 64 | 7 | 0 |
| R | 77 | 86 | 25 | 79 | 7 | 0 |
| S | 84 | 93 | 25 | 86 | 7 | 0 |

## Equal-path spread and ranking grids

| Spread | Close before | Close after | 28-point wire-to-wire before | 28-point wire-to-wire after |
| --- | --- | --- | --- | --- |
| 7 | 52 | 52 | 3 | 3 |
| 14 | 57 | 60 | 4 | 4 |
| 21 | 62 | 71 | 5 | 5 |
| 28 | 67 | 84 | 6 | 6 |
| 30 | 68 | 88 | 7 | 7 |

| Favorite rank | +14 close before | +14 close after | +28 close after | +28 blowout after |
| --- | --- | --- | --- | --- |
| Unranked | 57 | 60 | 84 | 6 |
| 20 | 57 | 61 | 86 | 6 |
| 10 | 59 | 63 | 89 | 7 |
| 5 | 60 | 64 | 91 | 7 |
| 2 | 60 | 65 | 92 | 8 |
| 1 | 60 | 65 | 93 | 8 |

## Requested stored results

| Matchup | Before | After | Spread | Ranks (provider order) | Final | Path valid | Competitive share | Last competitive position | History | Upset before → after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auburn Tigers at Georgia Bulldogs | 93 | 99 | 19.5 | Georgia Bulldogs: 1; Auburn Tigers: UR | 27–24 | true | 0.735 | 1.000 | 25 | 15 → 23 |
| Florida Gators at Texas Longhorns | 83 | 86 | 13.5 | Texas Longhorns: 7; Florida Gators: UR | 27–24 | true | 0.649 | 1.000 | 24 | 11 → 14 |
| Notre Dame Fighting Irish at BYU Cougars | 72 | 73 | 10.5 | BYU Cougars: 8; Notre Dame Fighting Irish: 2 | 24–28 | true | 0.780 | 1.000 | 25 | 8 → 9 |
| Charlotte 49ers at Temple Owls | 63 | 67 | 17.5 | Temple Owls: UR; Charlotte 49ers: UR | 38–31 | true | 0.983 | 1.000 | 19 | 12 → 16 |
| Alabama Crimson Tide at Tennessee Volunteers | 28 | 28 | 7.5 | Tennessee Volunteers: 14; Alabama Crimson Tide: 6 | 10–26 | true | 0.510 | 0.665 | 17 | 4 → 4 |

## Exact unchanged regression outputs

### CFB live A–Y

| Case | Before | After | All components equal |
| --- | --- | --- | --- |
| A | 46 | 46 | YES |
| B | 77 | 77 | YES |
| C | 87 | 87 | YES |
| D | 19 | 19 | YES |
| E | 44 | 44 | YES |
| F | 93 | 93 | YES |
| G | 45 | 45 | YES |
| H | 30 | 30 | YES |
| I | 1 | 1 | YES |
| J | 89 | 89 | YES |
| K | 94 | 94 | YES |
| L | 97 | 97 | YES |
| M | 93 | 93 | YES |
| N | 4 | 4 | YES |
| O | 96 | 96 | YES |
| P | 95 | 95 | YES |
| Q | 94 | 94 | YES |
| R | 93 | 93 | YES |
| S | 90 | 90 | YES |
| T | 96 | 96 | YES |
| U | 97 | 97 | YES |
| V | 99 | 99 | YES |
| W | 1 | 1 | YES |
| X | 77 | 77 | YES |
| Y | 77 | 77 | YES |

### NFL A–P

| Case | Before | After | All components equal |
| --- | --- | --- | --- |
| A | 53 | 53 | YES |
| B | 64 | 64 | YES |
| C | 87 | 87 | YES |
| D | 40 | 40 | YES |
| E | 52 | 52 | YES |
| F | 92 | 92 | YES |
| G | 56 | 56 | YES |
| H | 42 | 42 | YES |
| I | 64 | 64 | YES |
| J | 55 | 55 | YES |
| K | 92 | 92 | YES |
| L | 39 | 39 | YES |
| M | 99 | 99 | YES |
| N | 56 | 56 | YES |
| O | 93 | 93 | YES |
| P | 94 | 94 | YES |

| Completed case | Before | After | All components equal |
| --- | --- | --- | --- |
| C | 78 | 78 | YES |
| D | 88 | 88 | YES |
| E | 93 | 93 | YES |
| R | 96 | 96 | YES |
| V | 97 | 97 | YES |
| F | 54 | 54 | YES |
| G | 71 | 71 | YES |
| H | 1 | 1 | YES |
| I | 88 | 88 | YES |
| J | 84 | 84 | YES |
| T | 64 | 64 | YES |
| U | 33 | 33 | YES |

Provider replay: 107 fixtures; 57 non-CFB/non-completed outputs exactly equal. 4 scores changed.

| Changed fixture | Before | After |
| --- | --- | --- |
| CFB-20261017-401856719.json | 93 | 99 |
| CFB-20261017-401856724.json | 83 | 86 |
| CFB-20261017-401856809.json | 72 | 73 |
| CFB-20261017-401862803.json | 63 | 67 |
