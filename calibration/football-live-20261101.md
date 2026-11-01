# Live football audit — November 1, 2026

Model: `2026-11-01.football-live.1`.

## Confirmed causes and overlap

Both legacy football upset paths require 35% elapsed before rewarding any lead. NFL also qualifies abruptly at a seven-point spread; CFB separately scales through large spreads but suppresses large unexpected leads by treating their margin as poor competitiveness. The live production policy already owns closeness, uncertainty, leverage, comeback, lead-change, run, event and trajectory credit. News research is pregame-oriented and cached storylines were never reconciled against confirmed live injury updates. Live explanations concatenate generic fragments.

## Implementation

Production-only shared football context replaces the old live upset factor before base/floor aggregation. Smooth spread/moneyline expectation strength, actual lead, elapsed expected margin, time, validated sustained leadership and optional current WP produce bounded credit (NFL 22, CFB 30). Correlated history discounts up to 35% of the surprise award. Merely covering is insufficient. Rank-only CFB evidence is modest; FCS identity creates no assumed line. Timestamped odds after kickoff, explicitly live odds and lines older than 48h before kickoff are excluded. Untimestamped provider lines remain last-listed pregame evidence.

Existing game-summary news supplies conservative event-bound confirmed developments, without additional requests, AI calls or paid services. Confirmed events persist in existing feed/snapshot payloads; publication order supersedes arrival order, duplicates never stack, explicit returns supersede absences, and stale pregame return context is suppressed. Development credit is capped at five and decays with game progress and actual competitiveness. Missing statistics never imply injury. Source text and links remain inspectable.

## Synthetic calibration (not historical game claims)

| Sport | State | Before | After | Delta |
|---|---|---:|---:|---:|
| NFL | opening live | 38 | 38 | 0 |
| NFL | one drive, 35-point underdog | 33 | 35 | +2 |
| NFL | early Q2 two-score underdog lead | 41 | 48 | +7 |
| NFL | halftime underdog lead | 51 | 48 | -3 |
| NFL | late underdog lead | 44 | 44 | 0 |
| NFL | favorite merely underperforming line | 34 | 34 | 0 |
| NFL | even close matchup | 61 | 61 | 0 |
| NFL | ranked favorite trailing, no odds | 50 | 50 | 0 |
| CFB | opening live | 40 | 40 | 0 |
| CFB | one drive, 35-point underdog | 30 | 33 | +3 |
| CFB | early Q2 two-score underdog lead | 40 | 50 | +10 |
| CFB | halftime underdog lead | 57 | 68 | +11 |
| CFB | late underdog lead | 28 | 47 | +19 |
| CFB | favorite merely underperforming line | 35 | 35 | 0 |
| CFB | even close matchup | 74 | 74 | 0 |
| CFB | ranked favorite trailing, no odds | 60 | 69 | +9 |

## Historical replay

75 archived NFL/CFB games plus 2 current NFL captures, 2774 validated checkpoints. 21 changes larger than five points are individually flagged in the JSON report; 0 unexplained. Opening estimates and finals are unchanged. Other archived sports retain exact score/factor parity. News is not retrospectively injected into play checkpoints. The November 1 captures include the provider’s confirmed Jackson injury report, its explicit injury play, and positive passing-play evidence identifying the later replacement. Older NFL captures lack verified closing markets, so their missing lines are never filled with invented spreads.

| Sport | Game | Opening before/after | Half before/after | Late before/after | Sampled peak before/after | Captured end state before/after |
|---|---|---|---|---|---|---|
| CFB | Auburn Tigers at Georgia Bulldogs | 46/46 | 71/74 | 72/81 | 99/99 | 99/99 |
| CFB | Mississippi State Bulldogs at LSU Tigers | 64/64 | 35/36 | 1/1 | 64/64 | 1/1 |
| CFB | Missouri Tigers at Ole Miss Rebels | 71/71 | 43/43 | 23/23 | 72/72 | 4/4 |
| CFB | Kentucky Wildcats at Oklahoma Sooners | 44/44 | 76/77 | 69/71 | 99/99 | 72/72 |
| CFB | Alabama Crimson Tide at Tennessee Volunteers | 71/71 | 77/78 | 62/64 | 84/85 | 28/28 |
| CFB | Florida Gators at Texas Longhorns | 46/46 | 48/48 | 70/73 | 99/99 | 86/86 |
| CFB | The Citadel Bulldogs at Texas A&M Aggies | 40/40 | 24/24 | 1/1 | 46/46 | 1/1 |
| CFB | Arkansas Razorbacks at Vanderbilt Commodores | 40/40 | 73/73 | 68/68 | 90/90 | 61/61 |
| CFB | Notre Dame Fighting Irish at BYU Cougars | 75/75 | 69/70 | 85/86 | 99/99 | 82/82 |
| CFB | Arizona State Sun Devils at Texas Tech Red Raiders | 46/46 | 23/23 | 9/9 | 53/53 | 1/1 |
| CFB | Cincinnati Bearcats at West Virginia Mountaineers | 40/40 | 61/61 | 77/77 | 99/99 | 78/78 |
| CFB | Kansas Jayhawks at Kansas State Wildcats | 40/40 | 79/79 | 83/83 | 84/84 | 74/74 |
| CFB | Oklahoma State Cowboys at Houston Cougars | 67/67 | 53/53 | 49/49 | 71/71 | 61/61 |
| CFB | TCU Horned Frogs at Baylor Bears | 40/40 | 70/70 | 52/52 | 70/70 | 38/38 |
| CFB | Utah Utes at Colorado Buffaloes | 44/44 | 41/41 | 75/77 | 87/88 | 78/78 |
| CFB | Charleston Southern Buccaneers at Clemson Tigers | 40/40 | 19/19 | 1/1 | 45/45 | 1/1 |
| CFB | Elon Phoenix at Stanford Cardinal | 40/40 | 39/39 | 8/8 | 49/49 | 1/1 |
| CFB | Florida State Seminoles at Miami Hurricanes | 46/46 | 54/54 | 75/82 | 99/99 | 88/88 |
| CFB | Georgia Tech Yellow Jackets at Virginia Tech Hokies | 40/40 | 32/32 | 33/33 | 53/53 | 27/27 |
| CFB | Louisville Cardinals at Syracuse Orange | 40/40 | 71/71 | 77/77 | 91/91 | 82/82 |
| CFB | North Carolina Tar Heels at Duke Blue Devils | 40/40 | 54/54 | 65/65 | 99/99 | 81/81 |
| CFB | Pittsburgh Panthers at Boston College Eagles | 40/40 | 74/74 | 65/65 | 81/81 | 71/71 |
| CFB | Virginia Cavaliers at SMU Mustangs | 44/44 | 69/69 | 67/67 | 72/72 | 50/50 |
| CFB | Wake Forest Demon Deacons at California Golden Bears | 44/44 | 21/21 | 1/1 | 49/49 | 1/1 |
| CFB | Ohio State Buckeyes at Indiana Hoosiers | 71/71 | 81/81 | 75/75 | 99/99 | 72/72 |
| CFB | Rutgers Scarlet Knights at Maryland Terrapins | 40/40 | 52/52 | 68/68 | 99/99 | 69/69 |
| CFB | Penn State Nittany Lions at Michigan Wolverines | 40/40 | 70/70 | 56/56 | 88/88 | 63/63 |
| CFB | Northwestern Wildcats at Michigan State Spartans | 44/44 | 77/77 | 79/79 | 99/99 | 81/81 |
| CFB | Wisconsin Badgers at UCLA Bruins | 44/44 | 53/53 | 54/54 | 78/79 | 43/43 |
| CFB | Washington State Cougars at Oregon State Beavers | 40/40 | 34/34 | 26/26 | 45/45 | 3/3 |
| CFB | Fresno State Bulldogs at San Diego State Aztecs | 40/40 | 72/72 | 77/77 | 99/99 | 79/79 |
| CFB | Florida Atlantic Owls at Army Black Knights | 40/40 | 34/34 | 1/1 | 52/52 | 1/1 |
| CFB | Charlotte 49ers at Temple Owls | 40/40 | 55/55 | 72/72 | 83/83 | 71/71 |
| CFB | Navy Midshipmen at UTSA Roadrunners | 40/40 | 76/76 | 88/88 | 88/88 | 86/86 |
| CFB | Tulsa Golden Hurricane at Rice Owls | 40/40 | 74/74 | 65/65 | 77/77 | 26/26 |
| CFB | Kent State Golden Flashes at South Florida Bulls | 40/40 | 50/50 | 31/31 | 53/53 | 9/9 |
| CFB | Nevada Wolf Pack at North Dakota State Bison | 40/40 | 64/64 | 45/45 | 76/76 | 39/39 |
| CFB | Northern Illinois Huskies at Wyoming Cowboys | 40/40 | 41/41 | 34/34 | 49/49 | 3/3 |
| CFB | San José State Spartans at UTEP Miners | 40/40 | 53/53 | 27/27 | 53/53 | 22/22 |
| CFB | UNLV Rebels at Air Force Falcons | 40/40 | 74/74 | 80/80 | 82/82 | 64/64 |
| CFB | Ball State Cardinals at Bowling Green Falcons | 40/40 | 80/80 | 70/70 | 99/99 | 80/80 |
| CFB | Massachusetts Minutemen at Buffalo Bulls | 40/40 | 75/75 | 78/78 | 99/99 | 80/80 |
| CFB | Western Michigan Broncos at Central Michigan Chippewas | 40/40 | 43/43 | 33/33 | 86/86 | 55/55 |
| CFB | Toledo Rockets at Eastern Michigan Eagles | 40/40 | 28/28 | 23/23 | 47/47 | 1/1 |
| CFB | Ohio Bobcats at Sacramento State Hornets | 40/40 | 25/25 | 1/1 | 49/49 | 1/1 |
| CFB | Akron Zips at Miami (OH) RedHawks | 40/40 | 53/53 | 34/34 | 66/66 | 9/9 |
| CFB | Arkansas State Red Wolves at Southern Miss Golden Eagles | 40/40 | 42/42 | 34/34 | 52/52 | 37/37 |
| CFB | Georgia State Panthers at James Madison Dukes | 40/40 | 27/27 | 20/20 | 47/47 | 1/1 |
| CFB | Troy Trojans at Louisiana Ragin' Cajuns | 40/40 | 36/36 | 32/32 | 55/55 | 1/1 |
| CFB | Louisiana Tech Bulldogs at UL Monroe Warhawks | 40/40 | 55/55 | 37/37 | 58/58 | 6/6 |
| NFL | Philadelphia Eagles at Jacksonville Jaguars | 42/42 | 66/66 | 68/68 | 94/94 | 80/80 |
| NFL | Cincinnati Bengals at Miami Dolphins | 37/37 | 42/42 | 29/29 | 53/53 | 41/41 |
| NFL | Cleveland Browns at New York Jets | 42/42 | 58/58 | 61/61 | 89/89 | 69/69 |
| NFL | Houston Texans at Tennessee Titans | 34/34 | 48/48 | 25/25 | 54/54 | 4/4 |
| NFL | Indianapolis Colts at Pittsburgh Steelers | 42/42 | 57/57 | 67/67 | 68/68 | 41/41 |
| NFL | Las Vegas Raiders at New England Patriots | 60/60 | 46/46 | 11/11 | 63/63 | 7/7 |
| NFL | Minnesota Vikings at New Orleans Saints | 49/49 | 65/65 | 60/60 | 76/76 | 49/49 |
| NFL | New York Giants at Washington Commanders | 46/46 | 43/43 | 45/45 | 95/95 | 82/82 |
| NFL | Denver Broncos at Los Angeles Chargers | 41/41 | 50/50 | 62/62 | 87/87 | 59/59 |
| NFL | Chicago Bears at Green Bay Packers | 67/67 | 55/55 | 30/30 | 59/59 | 4/4 |
| NFL | Detroit Lions at Arizona Cardinals | 42/42 | 47/47 | 30/30 | 62/62 | 14/14 |
| NFL | San Francisco 49ers at Seattle Seahawks | 70/70 | 65/65 | 73/73 | 93/93 | 66/66 |
| NFL | Baltimore Ravens at Atlanta Falcons | 42/42 | 54/54 | 62/62 | 92/92 | 79/79 |
| NFL | Houston Texans at Jacksonville Jaguars | 46/46 | 69/69 | 68/68 | 93/93 | 78/78 |
| NFL | Baltimore Ravens at Cleveland Browns | 67/67 | 47/47 | 52/52 | 93/93 | 79/79 |
| NFL | Carolina Panthers at Philadelphia Eagles | 42/42 | 53/53 | 49/49 | 53/53 | 40/40 |
| NFL | Chicago Bears at Atlanta Falcons | 42/42 | 34/34 | 20/20 | 48/48 | 30/30 |
| NFL | New Orleans Saints at New York Giants | 42/42 | 69/69 | 41/41 | 90/90 | 63/63 |
| NFL | New York Jets at New England Patriots | 46/46 | 40/40 | 39/39 | 57/57 | 42/42 |
| NFL | Pittsburgh Steelers at Tampa Bay Buccaneers | 42/42 | 43/43 | 51/51 | 93/93 | 79/79 |
| NFL | Tennessee Titans at Indianapolis Colts | 39/39 | 39/39 | 75/75 | 89/89 | 68/68 |
| NFL | Arizona Cardinals at Los Angeles Rams | 39/39 | 48/48 | 65/65 | 94/94 | 99/99 |
| NFL | Buffalo Bills at Las Vegas Raiders | 47/47 | 55/55 | 46/46 | 71/71 | 63/63 |
| NFL | Los Angeles Chargers at Kansas City Chiefs | 48/48 | 38/38 | 31/31 | 54/54 | 5/5 |
| NFL | Dallas Cowboys at Green Bay Packers | 42/42 | 37/37 | 36/36 | 52/52 | 27/27 |
| NFL | Baltimore Ravens at Buffalo Bills | 55/55 | 52/52 | unavailable | 64/64 | 52/53 |
| NFL | Tennessee Titans at Cincinnati Bengals | 36/36 | 63/59 | unavailable | 67/62 | 63/59 |

## Evidence limits

Broad league headlines without matchup binding, speculative injuries, stale articles, unverified replacement inference and rejected/regressing summaries add no new development. Provider omission can still prevent recognition of a real injury; the model does not invent one. Existing record/context research cadence, subscriptions, history ownership, down/distance, OT and completed rules are preserved.

## Current provider captures

- 401873026: 52 → 53 at 6:37 · 2nd quarter. Buffalo Bills lead 13–7 with 6:37 left in the second quarter. Ravens' Lamar Jackson is out for the game with thumb injury suffered on 1st play. Joe Fagnano has thrown passes since Lamar Jackson's departure. Source: https://sports-radar-alerts.mmueller918.workers.dev/game/NFL/401873026; captured 2026-11-01T19:20:41.315Z.
- 401873031: 63 → 59 at 2:00 · 2nd quarter. Tennessee Titans lead 13–7 with 2:00 left in the second quarter. Tennessee Titans are threatening an upset despite entering as a 13.5-point underdog. Source: https://sports-radar-alerts.mmueller918.workers.dev/game/NFL/401873031; captured 2026-11-01T19:20:41.299Z.

## Validation

896 tests passed with zero failures in the full root/Worker suite. Browser build, test-score.js, syntax checks and Wrangler dry run passed. The original checkout’s pre-existing tracked diff was restored byte-for-byte; this release is isolated on current production commit 92cec7c. No API subscription, AI budget, database migration or scheduled cadence changes.
