# Completed CFB calibration — 2026-10-27

Completed CFB only. No deployment. The immutable baseline includes the already calibrated live CFB and NFL models. All values below come from stored captures or synthetic inputs; they are not fresh provider verification.

See [cfb-completed-audit.md](cfb-completed-audit.md) for exact formulas, changed files, API integration and remaining edge cases.

## Synthetic completed matrix

| Case | Archetype | Before | After | Base | Original history | Completed adjustment | Finish |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Ordinary three-point final | 46 | 46 | 39 | 7 | 0 | 0 |
| B | Multiple late lead changes | 64 | 64 | 39 | 25 | 0 | 0 |
| C | Eight-point 1OT | 72 | 78 | 43 | 15 | 6 | 14 |
| D | Eight-point 2OT | 72 | 88 | 43 | 15 | 16 | 14 |
| E | Eight-point 3OT (historical rules) | 72 | 93 | 43 | 15 | 21 | 14 |
| F | Tied entering Q4, ends +21 | 8 | 54 | 1 | 7 | 46 | 0 |
| G | One score at 5:00, ends +21 | 8 | 71 | 1 | 7 | 63 | 0 |
| H | Never competitive after half | 1 | 1 | 1 | 0 | 0 | 0 |
| I | Erases 21, wins close | 64 | 88 | 39 | 25 | 24 | 0 |
| J | Erases 21, pulls away late | 22 | 84 | 1 | 21 | 62 | 0 |
| K | +7 wins close | 46 | 52 | 45 | 7 | 0 | 0 |
| L | +14 wins close | 68 | 57 | 50 | 7 | 0 | 0 |
| M | +21 wins close | 68 | 62 | 55 | 7 | 0 | 0 |
| N | +28 wins close | 68 | 67 | 60 | 7 | 0 | 0 |
| O | +28 wins wire-to-wire by 28 | 16 | 6 | 1 | 0 | 5 | 0 |
| P | Unranked +14 beats No. 2 close | 68 | 60 | 53 | 7 | 0 | 0 |
| Q | No. 1 loses by 24, no late contest | 20 | 6 | 3 | 0 | 3 | 0 |
| R | CFP semifinal 2OT | 94 | 96 | 65 | 15 | 2 | 14 |
| S | National championship blowout | 26 | 7 | 26 | 0 | -19 | 0 |
| T | 10-7 defensive classic | 64 | 64 | 39 | 25 | 0 | 0 |
| U | 10-7 punt-fest | 33 | 33 | 39 | -6 | 0 | 0 |
| V | Repeated two-point shootout, 5OT | 83 | 97 | 54 | 15 | 14 | 14 |

| Relative assertion | Result |
| --- | --- |
| D > C | PASS |
| E >= D | PASS |
| G > F > H | PASS |
| I > J | PASS |
| N > M > L > K | PASS |
| N > O | PASS |
| P > unranked L | PASS |
| Close ranked upset P > blowout Q | PASS |
| R >= 95 | PASS |
| Championship blowout S at least 50 below classic R | PASS |
| T > U | PASS |
| B materially above A | PASS |

## Exact live regression

### CFB live A–Y

| Case | Before | After | All components identical |
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

| Case | Before | After | All components identical |
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

## All stored provider fixtures

| Sport | Fixtures | Complete outputs identical | Scores changed |
| --- | --- | --- | --- |
| CFB | 50 | 34 | 16 |
| MLB | 2 | 2 | 0 |
| NBA | 3 | 3 | 0 |
| NCAAB | 2 | 2 | 0 |
| NFL | 25 | 25 | 0 |
| NHL | 25 | 25 | 0 |

CFB pregame, every standalone completed history, and other sports across upcoming/live/completed states are additionally checked against the frozen engine. Public API keys, function arities and browser/Node outputs are unchanged. The new optional aggregation context is supplied only for completed CFB.

## All stored completed CFB results

| Fixture / matchup | Final | Before | After | Why changed or stayed |
| --- | --- | --- | --- | --- |
| CFB-20261017-401856719: Auburn Tigers vs Georgia Bulldogs | 27–24 | 99 | 93 | Completed upset 22 → 15 |
| CFB-20261017-401856720: Mississippi State Bulldogs vs LSU Tigers | 0–31 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856721: Missouri Tigers vs Ole Miss Rebels | 3–31 | 4 | 4 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856722: Kentucky Wildcats vs Oklahoma Sooners | 21–13 | 64 | 69 | Completed upset 0 → 5 |
| CFB-20261017-401856723: Alabama Crimson Tide vs Tennessee Volunteers | 10–26 | 27 | 28 | Completed upset 3 → 4 |
| CFB-20261017-401856724: Florida Gators vs Texas Longhorns | 27–24 | 94 | 83 | Completed upset 22 → 11 |
| CFB-20261017-401856725: The Citadel Bulldogs vs Texas A&M Aggies | 0–41 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856726: Arkansas Razorbacks vs Vanderbilt Commodores | 31–21 | 48 | 76 | Completed competitive path retention +28 |
| CFB-20261017-401856809: Notre Dame Fighting Irish vs BYU Cougars | 24–28 | 84 | 72 | Completed upset 20 → 8 |
| CFB-20261017-401856828: Arizona State Sun Devils vs Texas Tech Red Raiders | 25–53 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856829: Cincinnati Bearcats vs West Virginia Mountaineers | 42–45 | 78 | 78 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856830: Kansas Jayhawks vs Kansas State Wildcats | 24–35 | 50 | 79 | Completed competitive path retention +29 |
| CFB-20261017-401856831: Oklahoma State Cowboys vs Houston Cougars | 32–35 | 51 | 51 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856832: TCU Horned Frogs vs Baylor Bears | 17–6 | 38 | 38 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401856833: Utah Utes vs Colorado Buffaloes | 27–24 | 62 | 62 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858261: Charleston Southern Buccaneers vs Clemson Tigers | 0–37 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858262: Elon Phoenix vs Stanford Cardinal | 7–34 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858263: Florida State Seminoles vs Miami Hurricanes | 35–43 | 77 | 88 | Completed 2OT depth retention +11 |
| CFB-20261017-401858264: Georgia Tech Yellow Jackets vs Virginia Tech Hokies | 24–34 | 27 | 27 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858265: Louisville Cardinals vs Syracuse Orange | 34–26 | 64 | 64 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858266: North Carolina Tar Heels vs Duke Blue Devils | 24–20 | 71 | 85 | Completed competitive path retention +14 |
| CFB-20261017-401858267: Pittsburgh Panthers vs Boston College Eagles | 21–27 | 64 | 64 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858268: Virginia Cavaliers vs SMU Mustangs | 13–23 | 43 | 49 | Completed competitive path retention +6 |
| CFB-20261017-401858269: Wake Forest Demon Deacons vs California Golden Bears | 41–7 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858488: Ohio State Buckeyes vs Indiana Hoosiers | 19–15 | 72 | 72 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858489: Rutgers Scarlet Knights vs Maryland Terrapins | 37–30 | 69 | 69 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858490: Penn State Nittany Lions vs Michigan Wolverines | 18–21 | 59 | 59 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858491: Northwestern Wildcats vs Michigan State Spartans | 24–21 | 64 | 64 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401858494: Wisconsin Badgers vs UCLA Bruins | 7–17 | 42 | 49 | Completed competitive path retention +7 |
| CFB-20261017-401860903: Washington State Cougars vs Oregon State Beavers | 30–48 | 3 | 3 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401860904: Fresno State Bulldogs vs San Diego State Aztecs | 23–26 | 73 | 73 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401862802: Florida Atlantic Owls vs Army Black Knights | 24–56 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401862803: Charlotte 49ers vs Temple Owls | 38–31 | 73 | 63 | Completed upset 22 → 12 |
| CFB-20261017-401862804: Navy Midshipmen vs UTSA Roadrunners | 34–38 | 62 | 82 | Completed competitive path retention +20 |
| CFB-20261017-401862805: Tulsa Golden Hurricane vs Rice Owls | 38–17 | 26 | 61 | Completed competitive path retention +35 |
| CFB-20261017-401862806: Kent State Golden Flashes vs South Florida Bulls | 2–29 | 9 | 9 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401864520: Nevada Wolf Pack vs North Dakota State Bison | 17–31 | 26 | 50 | Completed competitive path retention +24 |
| CFB-20261017-401864522: Northern Illinois Huskies vs Wyoming Cowboys | 23–41 | 3 | 3 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401864523: San José State Spartans vs UTEP Miners | 24–11 | 22 | 22 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401864524: UNLV Rebels vs Air Force Falcons | 31–41 | 52 | 60 | Completed competitive path retention +8 |
| CFB-20261017-401866441: Ball State Cardinals vs Bowling Green Falcons | 32–31 | 80 | 80 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401866442: Massachusetts Minutemen vs Buffalo Bulls | 18–25 | 79 | 79 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401866443: Western Michigan Broncos vs Central Michigan Chippewas | 21–14 | 32 | 32 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401866444: Toledo Rockets vs Eastern Michigan Eagles | 34–14 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401866445: Ohio Bobcats vs Sacramento State Hornets | 48–7 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401866478: Akron Zips vs Miami (OH) RedHawks | 14–34 | 9 | 9 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401869934: Arkansas State Red Wolves vs Southern Miss Golden Eagles | 23–13 | 37 | 37 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401869957: Georgia State Panthers vs James Madison Dukes | 22–49 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401869966: Troy Trojans vs Louisiana Ragin' Cajuns | 6–33 | 1 | 1 | Existing evidence already sufficient, or no qualifying new interaction |
| CFB-20261017-401871091: Louisiana Tech Bulldogs vs UL Monroe Warhawks | 24–0 | 6 | 6 | Existing evidence already sufficient, or no qualifying new interaction |

## Three audit archetypes

- **Florida State–Miami: 77 → 88.** Final period 6 confirms 2OT. The existing 43 base + 25 history + 9 defensive finish totals 77. The depth floor contributes only the missing 11; neither the generic +13 OT factor nor the defensive finish is awarded again.
- **Alabama–Tennessee: 27 → 28.** The +7.5 winning underdog receives 4 completed upset points instead of 3. Rank significance is bounded by spread and final competitiveness. The margin became nine at 5:05 in Q3 and sixteen at 3:17 in Q4; there is no verified one-score Q4 window, so no late-path rescue is granted.
- **Tulsa–Rice: 26 → 61.** Rice led 17–7 before Tulsa came back. Rice was still within seven until Tulsa scored at 10:06 in Q4; the final 21-point margin arrived at 3:39. Existing base 1 and history 25 remain; the verified path floor supplies 35, without awarding the comeback twice. This is meaningfully below the close 21-point comeback archetype (88).

## Verification

- Focused CFB completed/live + NFL + stagnation: 31/31 passed.
- Full scoring suite: 239/239 passed, including API signatures, browser/Node parity and Worker bundle execution.
- Worker suite: 22/22 passed, including all 107 migration fixtures.
- `node test-score.js`: both model and watchlist/timeline fixture groups passed.
- Provider replay: 107 fixtures (50 CFB); every non-CFB complete output identical.
- `node scripts/calibration-report.mjs`: all 107 stored fixtures processed; generated CSV retained in `work/cfb-completed/provider-after.csv`, with the pre-existing tracked CSV preserved.
- `git diff --check`: passed.
- Initial esbuild test needed filesystem access beyond the sandbox to resolve the existing dependencies; the full suite passed on retry. No deployment ran.
