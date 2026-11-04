# Live underdog calibration evidence

Baseline: `0f0eb90dc332e951afc3a20e3226f99e951a6cec`, model `2026-11-02.clock-integrity.2`. Candidate: `2026-11-03.live-underdog.1`. Offline rerating uses the actual Worker facade (`normalizeEvent` then `enrichGame`) and its shared production runtime.

Absolute total rating change >= 3 points; every crossing of 75, 85 or 90 is also listed regardless of size.

## Evidence boundaries

Causal reconstructions use archived provider play prefixes with observed scores, clocks and available validated possession. Explicit archived closing or timestamped pregame quotes may supply expectation context; their availability to the app at that historical instant is not established. They are not original raw live responses, do not reproduce every historical recorded rating, and never overwrite retained snapshots. Missing historical odds, possession and win probability stay missing. Later WP, boxscores and recaps are excluded. All valid replay checkpoints in the selected archive corpus are evaluated.

The user supplied Wofford +25.5 and a 16-15 first-half lead. We do not possess a raw archive of that exact observation. Paired 6:01/6:00 states isolate the stated defect; all later states are simulations, not historical observations.

No source fixture or stored snapshot was modified. Input SHA-256 hashes are retained in the JSON. No provider or AI request is made by this report.

## Wofford regression

| Sport | Controlled case | Period / clock | Before | After | Delta | Upset before / after |
|---|---|---|---:|---:|---:|---:|
| NCAAB | observed score/spread, controlled 6:01 clock | 1 / 6:01 | 47 | 50 | +3 | 0 / 3 |
| NCAAB | observed score/spread, controlled 6:00 clock | 1 / 6:00 | 60 | 50 | -10 | 13 / 3 |
| NCAAB | simulated late narrow deficit | 2 / 4:00 | 58 | 68 | +10 | 0 / 10 |
| NCAAB | simulated late tie before former 70% gate | 2 / 12:01 | 54 | 63 | +9 | 0 / 9 |
| NCAAB | simulated late tie at former 70% gate | 2 / 12:00 | 64 | 63 | -1 | 10 / 9 |

## Historical reconstruction summary

| Sport | Games | Checkpoints | Changed | Material | Mean delta | Min / max delta | New 85+ crossings |
|---|---:|---:|---:|---:|---:|---:|---:|
| NCAAB | 3 | 1074 | 521 | 140 | -0.117 | -5 / 4 | 7 |
| NBA | 6 | 2630 | 382 | 0 | 0.153 | 0 / 2 | 0 |
| NFL | 31 | 5449 | 9 | 1 | 0.003 | 0 / 3 | 0 |
| CFB | 52 | 8742 | 68 | 0 | 0.010 | 0 / 2 | 10 |

0 nonlive score/factor changes; 0 opening-baseline changes; 0 other-sport score/factor changes in captured end states.

17883 checkpoints receive finite ratings in both engines; 12 are withheld by both at an unconfirmed 0:00 basketball transition. This is existing timing-integrity protection, not a new scoring failure.

NBA's original October 20 captures have small 1.5/4.5-point lines. Targeted archived Minnesota–San Antonio (+12.5, available through Q3) and New Orleans–Memphis (+5.5, through overtime) strengthen coverage without inventing later states.

## Controlled simulations

2940 scenarios cover every requested spread and signed score margin, early/half/late/final/OT states, missing/stale/live/unverified markets, available/missing current WP, unknown/confirmed possession and viable/impossible runway. All are simulations, not historical claims. The selected table uses a 25.5-point spread; the JSON contains every row.

| Sport | Phase / dog margin | Period / clock | Before | After | Delta | Upset before / after |
|---|---|---|---:|---:|---:|---:|
| NCAAB | early, -1 | 1 / 18:00 | 35 | 35 | 0 | 0 / 0 |
| NCAAB | early, 0 | 1 / 18:00 | 35 | 35 | 0 | 0 / 0 |
| NCAAB | early, +1 | 1 / 18:00 | 35 | 35 | 0 | 0 / 0 |
| NCAAB | halftime, -1 | 1 / 0:00 | 52 | 57 | +5 | 0 / 5 |
| NCAAB | halftime, 0 | 1 / 0:00 | 53 | 58 | +5 | 0 / 5 |
| NCAAB | halftime, +1 | 1 / 0:00 | 67 | 57 | -10 | 15 / 5 |
| NCAAB | final minutes, -1 | 2 / 4:00 | 58 | 68 | +10 | 0 / 10 |
| NCAAB | final minutes, 0 | 2 / 4:00 | 72 | 72 | 0 | 11 / 11 |
| NCAAB | final minutes, +1 | 2 / 4:00 | 75 | 70 | -5 | 17 / 12 |
| NCAAB | final seconds, -1 | 2 / 0:02 | 53 | 55 | +2 | 0 / 2 |
| NCAAB | final seconds, 0 | 2 / 0:02 | 85 | 86 | +1 | 11 / 12 |
| NCAAB | final seconds, +1 | 2 / 0:02 | 71 | 66 | -5 | 18 / 13 |
| NCAAB | overtime, -1 | 3 / 2:00 | 75 | 86 | +11 | 0 / 11 |
| NCAAB | overtime, 0 | 3 / 2:00 | 88 | 89 | +1 | 11 / 12 |
| NCAAB | overtime, +1 | 3 / 2:00 | 93 | 88 | -5 | 18 / 13 |
| NBA | early, -1 | 1 / 10:00 | 37 | 37 | 0 | 0 / 0 |
| NBA | early, 0 | 1 / 10:00 | 37 | 37 | 0 | 0 / 0 |
| NBA | early, +1 | 1 / 10:00 | 37 | 37 | 0 | 0 / 0 |
| NBA | halftime, -1 | 2 / 0:00 | 52 | 54 | +2 | 0 / 2 |
| NBA | halftime, 0 | 2 / 0:00 | 53 | 55 | +2 | 0 / 2 |
| NBA | halftime, +1 | 2 / 0:00 | 67 | 55 | -12 | 15 / 3 |
| NBA | final minutes, -1 | 4 / 4:00 | 56 | 64 | +8 | 0 / 8 |
| NBA | final minutes, 0 | 4 / 4:00 | 68 | 66 | -2 | 11 / 9 |
| NBA | final minutes, +1 | 4 / 4:00 | 73 | 65 | -8 | 17 / 9 |
| NBA | final seconds, -1 | 4 / 0:02 | 42 | 44 | +2 | 0 / 2 |
| NBA | final seconds, 0 | 4 / 0:02 | 70 | 68 | -2 | 11 / 9 |
| NBA | final seconds, +1 | 4 / 0:02 | 60 | 52 | -8 | 18 / 10 |
| NBA | overtime, -1 | 5 / 2:00 | 61 | 69 | +8 | 0 / 8 |
| NBA | overtime, 0 | 5 / 2:00 | 73 | 71 | -2 | 11 / 9 |
| NBA | overtime, +1 | 5 / 2:00 | 79 | 71 | -8 | 18 / 10 |
| NFL | early, -1 | 1 / 12:00 | 32 | 32 | 0 | 0 / 0 |
| NFL | early, 0 | 1 / 12:00 | 32 | 32 | 0 | 0 / 0 |
| NFL | early, +1 | 1 / 12:00 | 33 | 33 | 0 | 1 / 1 |
| NFL | halftime, -1 | 2 / 0:00 | 43 | 43 | 0 | 0 / 0 |
| NFL | halftime, 0 | 2 / 0:00 | 43 | 43 | 0 | 0 / 0 |
| NFL | halftime, +1 | 2 / 0:00 | 50 | 50 | 0 | 6 / 6 |
| NFL | final minutes, -1 | 4 / 4:00 | 62 | 62 | 0 | 11 / 11 |
| NFL | final minutes, 0 | 4 / 4:00 | 69 | 69 | 0 | 13 / 13 |
| NFL | final minutes, +1 | 4 / 4:00 | 62 | 67 | +5 | 9 / 14 |
| NFL | final seconds, -1 | 4 / 0:02 | 55 | 55 | 0 | 8 / 8 |
| NFL | final seconds, 0 | 4 / 0:02 | 71 | 71 | 0 | 14 / 14 |
| NFL | final seconds, +1 | 4 / 0:02 | 57 | 62 | +5 | 9 / 14 |
| NFL | overtime, -1 | 5 / 2:00 | 55 | 55 | 0 | 8 / 8 |
| NFL | overtime, 0 | 5 / 2:00 | 71 | 71 | 0 | 14 / 14 |
| NFL | overtime, +1 | 5 / 2:00 | 57 | 62 | +5 | 9 / 14 |
| CFB | early, -1 | 1 / 12:00 | 34 | 34 | 0 | 0 / 0 |
| CFB | early, 0 | 1 / 12:00 | 34 | 34 | 0 | 0 / 0 |
| CFB | early, +1 | 1 / 12:00 | 36 | 36 | 0 | 2 / 2 |
| CFB | halftime, -1 | 2 / 0:00 | 54 | 54 | 0 | 0 / 0 |
| CFB | halftime, 0 | 2 / 0:00 | 55 | 55 | 0 | 0 / 0 |
| CFB | halftime, +1 | 2 / 0:00 | 62 | 62 | 0 | 7 / 7 |
| CFB | final minutes, -1 | 4 / 4:00 | 77 | 77 | 0 | 14 / 14 |
| CFB | final minutes, 0 | 4 / 4:00 | 83 | 83 | 0 | 15 / 15 |
| CFB | final minutes, +1 | 4 / 4:00 | 75 | 80 | +5 | 10 / 15 |
| CFB | final seconds, -1 | 4 / 0:02 | 46 | 46 | 0 | 7 / 7 |
| CFB | final seconds, 0 | 4 / 0:02 | 86 | 86 | 0 | 16 / 16 |
| CFB | final seconds, +1 | 4 / 0:02 | 49 | 55 | +6 | 10 / 16 |
| CFB | overtime, -1 | 5 /  | 89 | 89 | 0 | 7 / 7 |
| CFB | overtime, 0 | 5 /  | 97 | 97 | 0 | 16 / 16 |
| CFB | overtime, +1 | 5 /  | 90 | 91 | +1 | 10 / 16 |

## Every new historical 85+ crossing

| Sport | Game | Period / clock | Before | After | Delta | Upset before / after |
|---|---|---|---:|---:|---:|---:|
| CFB | Kentucky Wildcats at Oklahoma Sooners | 4 / 10:04 | 84 | 85 | +1 | 3 / 4 |
| CFB | Kentucky Wildcats at Oklahoma Sooners | 4 / 9:43 | 84 | 85 | +1 | 3 / 4 |
| CFB | Kentucky Wildcats at Oklahoma Sooners | 4 / 6:42 | 84 | 85 | +1 | 3 / 4 |
| CFB | Kentucky Wildcats at Oklahoma Sooners | 4 / 5:23 | 84 | 85 | +1 | 3 / 4 |
| CFB | Kentucky Wildcats at Oklahoma Sooners | 4 / 5:20 | 84 | 85 | +1 | 3 / 4 |
| CFB | Florida Gators at Texas Longhorns | 4 / 6:55 | 84 | 85 | +1 | 10 / 11 |
| CFB | Florida Gators at Texas Longhorns | 4 / 4:21 | 84 | 86 | +2 | 10 / 12 |
| CFB | Florida Gators at Texas Longhorns | 4 / 4:15 | 83 | 85 | +2 | 10 / 12 |
| NCAAB | Iowa Hawkeyes at Illinois Fighting Illini | 2 / 14:02 | 84 | 85 | +1 | 0 / 1 |
| NCAAB | Iowa Hawkeyes at Illinois Fighting Illini | 2 / 12:13 | 84 | 85 | +1 | 0 / 1 |
| NCAAB | Iowa Hawkeyes at Illinois Fighting Illini | 2 / 9:55 | 83 | 85 | +2 | 0 / 2 |
| NCAAB | Purdue Boilermakers at Arizona Wildcats | 2 / 14:34 | 84 | 85 | +1 | 0 / 1 |
| NCAAB | Purdue Boilermakers at Arizona Wildcats | 2 / 14:04 | 84 | 85 | +1 | 0 / 1 |
| NCAAB | Purdue Boilermakers at Arizona Wildcats | 2 / 14:02 | 84 | 85 | +1 | 0 / 1 |
| NCAAB | Purdue Boilermakers at Arizona Wildcats | 2 / 14:01 | 84 | 85 | +1 | 0 / 1 |
| CFB | Oklahoma State Cowboys at Iowa State Cyclones | 4 / 8:00 | 84 | 85 | +1 | 8 / 9 |
| CFB | Oklahoma State Cowboys at Iowa State Cyclones | 4 / 6:42 | 83 | 85 | +2 | 8 / 10 |

The seven new NCAAM 85+ states are early-to-middle second-half tournament situations: one or two upset points lift existing 83/84 ratings. They need a watchability review; this replay cannot classify them as unequivocally true or false alerts. Seven of the ten CFB new 85+ states have partial evidence (five Kentucky–Oklahoma, two Oklahoma State–Iowa State), which warrants additional caution. These 17 states span five games; they are not 17 delivered notifications.

These are rerated archived states, not delivered alerts. Actual notification thresholds and delivery rules are unchanged. Review each crossing before rollout; a high rating alone is not evidence of an erroneous alert.

## Complete review data

[Machine-readable report](output/live-underdog-20261103.json) contains every reconstructed checkpoint, every controlled scenario, every material change, all threshold crossings and their full before/after factors, archived capture comparisons, boundary sweeps and input provenance.
