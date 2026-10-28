# NHL before/after calibration

Baseline: repository commit `848f720f15db76d931ac560854a7c91de5e4dade`, frozen before this change with its original adapter. Synthetic scores include live snapshot and history. Provider results use full normalization and enrichment, without editorial context overrides. **FLAG** marks every absolute change of 10 or more.

## Synthetic scenarios

| Scenario | Old | New | Difference | 10+ |
| --- | --- | --- | --- | --- |
| Tied 12:00 third | 52 | 58 | 6 |  |
| Tied 10:00 third | 55 | 65 | 10 | **FLAG** |
| Tied 7:30 third | 55 | 71 | 16 | **FLAG** |
| Tied 5:00 third | 56 | 77 | 21 | **FLAG** |
| Tied 2:00 third | 57 | 84 | 27 | **FLAG** |
| Tied 1:00 third | 58 | 88 | 30 | **FLAG** |
| Down 1, 2:00 | 54 | 74 | 20 | **FLAG** |
| Down 1, goalie pulled, 1:00 | 60 | 85 | 25 | **FLAG** |
| Down 1, 6-on-4, 1:00 | 60 | 91 | 31 | **FLAG** |
| Down 2, 10:00 third | 27 | 33 | 6 |  |
| Down 2, 5:00 third | 23 | 24 | 1 |  |
| Down 2, 2:00 third | 22 | 15 | -7 |  |
| Down 2, 1:00 third | 21 | 8 | -13 | **FLAG** |
| Down 3, 10:00 first | 30 | 34 | 4 |  |
| Down 3, 10:00 third | 7 | 10 | 3 |  |
| Down 3, 5:00 third | 4 | 7 | 3 |  |
| Down 3, 2:00 third | 2 | 5 | 3 |  |
| Down 3, 1:00 third | 2 | 5 | 3 |  |
| Tied 0:10 third | 58 | 90 | 32 | **FLAG** |
| Tied end regulation | 58 | 90 | 32 | **FLAG** |
| Start regular-season OT | 64 | 92 | 28 | **FLAG** |
| Regular-season OT | 64 | 93 | 29 | **FLAG** |
| Shootout | 64 | 90 | 26 | **FLAG** |
| Playoff OT | 78 | 95 | 17 | **FLAG** |
| Playoff 2OT | 78 | 97 | 19 | **FLAG** |
| Playoff 3OT | 78 | 98 | 20 | **FLAG** |
| Stanley Cup Final deciding game OT | 99 | 99 | 0 |  |

## Every NHL provider fixture

| Event ID | Matchup | Final | Old | New | Difference | 10+ |
| --- | --- | --- | --- | --- | --- | --- |
| 401892519 | New Jersey Devils vs Washington Capitals | 2-4 | 38 | 34 | -4 |  |
| 401892520 | Carolina Hurricanes vs Winnipeg Jets | 3-2 | 51 | 46 | -5 |  |
| 401892521 | Vancouver Canucks vs Tampa Bay Lightning | 2-4 | 44 | 43 | -1 |  |
| 401892522 | Seattle Kraken vs Florida Panthers | 3-8 | 7 | 3 | -4 |  |
| 401892523 | New York Islanders vs Toronto Maple Leafs | 4-1 | 14 | 12 | -2 |  |
| 401892524 | Buffalo Sabres vs Montreal Canadiens | 3-4 | 75 | 65 | -10 | **FLAG** |
| 401892525 | San Jose Sharks vs Detroit Red Wings | 3-4 | 75 | 69 | -6 |  |
| 401892526 | Ottawa Senators vs Philadelphia Flyers | 1-3 | 41 | 38 | -3 |  |
| 401892527 | New York Rangers vs Columbus Blue Jackets | 0-1 | 57 | 63 | 6 |  |
| 401892528 | Dallas Stars vs Chicago Blackhawks | 4-0 | 10 | 7 | -3 |  |
| 401892529 | St. Louis Blues vs Nashville Predators | 2-5 | 20 | 14 | -6 |  |
| 401892530 | Boston Bruins vs Los Angeles Kings | 4-1 | 17 | 17 | 0 |  |
| 401892531 | Edmonton Oilers vs Utah Mammoth | 6-2 | 3 | 4 | 1 |  |
| 401892532 | Pittsburgh Penguins vs Vegas Golden Knights | 2-6 | 3 | 3 | 0 |  |
| 401892539 | San Jose Sharks vs Montreal Canadiens | 4-3 | 92 | 71 | -21 | **FLAG** |
| 401892540 | Colorado Avalanche vs New Jersey Devils | 3-4 | 43 | 41 | -2 |  |
| 401892541 | Anaheim Ducks vs New York Islanders | 2-3 | 43 | 38 | -5 |  |
| 401892542 | Los Angeles Kings vs Washington Capitals | 5-2 | 23 | 22 | -1 |  |
| 401892543 | Toronto Maple Leafs vs Columbus Blue Jackets | 6-2 | 11 | 9 | -2 |  |
| 401892544 | Winnipeg Jets vs St. Louis Blues | 1-2 | 43 | 42 | -1 |  |
| 401892545 | Boston Bruins vs Dallas Stars | 2-3 | 72 | 63 | -9 |  |
| 401892546 | Minnesota Wild vs Edmonton Oilers | 3-4 | 66 | 63 | -3 |  |
| 401892547 | Detroit Red Wings vs Seattle Kraken | 3-4 | 63 | 66 | 3 |  |
| 401892548 | Carolina Hurricanes vs Vancouver Canucks | 6-3 | 14 | 13 | -1 |  |
| 401892549 | Tampa Bay Lightning vs Vegas Golden Knights | 6-2 | 11 | 7 | -4 |  |

25 provider fixtures; 2 movements of 10+ points.
