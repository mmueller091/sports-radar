# NHL scoring audit and global pregame ceiling

Implemented locally on October 27, 2026. **Nothing was deployed.**

The complete [before/after tables](nhl-calibration.md) contain all requested representative synthetic states (14 rows, including an additional 3OT row), all 25 existing NHL provider fixtures, final score lines, event IDs, differences, and explicit flags for every movement of 10+ points. [Machine-readable results](nhl-calibration.json) also retain old and new fixture factors.

## Global pregame ceiling

`rating-core.js` computes every pregame factor normally, stores their uncapped sum as `rawPregameScore`, and returns `score = min(90, clampScore(rawPregameScore))`. The factor values and their explanations remain intact. This applies to every registered sport, with the same central fallback for unknown sports.

`rateGame()` uses that capped score as the canonical `openingScore` for upcoming, live, and completed games. The normalized Worker game and context-recalculation path expose `rawPregameScore` as audit metadata. Neither live scoring nor snapshot refresh uses it as a baseline. `stateRating()` and restored live snapshots also cap incoming opening scores at 90. Retained postseason stakes cannot exceed that capped opening basis even when their original factor sum is larger.

Thus raw 45, 75, and 90 remain unchanged; raw 91, 99, and 120 return 90. Raw 108 would likewise produce pregame/opening 90 while retaining raw 108 for audit. **A pregame rating of 91–99 is no longer possible through the scoring model.** Actual live and completed scoring still uses the existing 99 ceiling.

Regression tests cover all eight sport keys and all six raw-score boundaries. Separate championship tests exercise World Series Game 7, Stanley Cup Final Game 7, Super Bowl, CFB national championship, NCAA basketball championship, and NBA Finals Game 7. Each produces pregame/opening 90 with uncapped factors, exceeds 90 under actual late live conditions, and can finish at 99 with realized drama. NHL's deciding Stanley Cup Final OT explicitly reaches 99 live.

## Deliberate expectation changes

- Championship-series pregame expectations of 92, 98, and 99 now expect 90. The 92/98 factor sums remain asserted as `rawPregameScore`; existing 82/85/87 expectations remain unchanged.
- NHL's late two-goal viability expectations change from 0.15–0.20 to 0.02–0.06; a trailing extra attacker or power play raises it into 0.10–0.16. Early two-goal viability remains above 0.5.
- The browser fixture's competitive two-goal player chase decreases from +7 to +3; its full rating now asserts 67 instead of a minimum of 71.
- Historical parity tests apply only the global cap and raw-score metadata to their frozen scoring oracle. Original archives and golden files are preserved. NHL's intentionally redesigned live/history results are covered by the dedicated calibration suite, full browser/Node comparisons, and the new immediate-baseline audit. Other sport coefficients remain pinned.

## NHL logic

### Continuous margin and runway

For gap `g <= 1`, closeness is `1 - 0.1g`. Above one goal:

```text
extra = min(0.45, 0.22 × trailingGoaliePulled + 0.23 × trailingPowerPlay)
runway = 2.1 - 1.85 × progress + extra
closeness = 0.9 × exp(-((g - 1)^1.35) / runway)
```

This is continuous at one, two, three, and four goals. Larger deficits and less remaining time reduce viability. Extra manpower buys limited runway; it cannot make a late three- or four-goal deficit look close. NHL also replaces the generic margin-triggered wide penalty with a continuous deficit-dependent penalty, avoiding a second cliff in the final score.

### One competitive floor for combined states

The existing model `decisiveFloor` / `competitiveFloor` mechanism supplies the amount needed to reach an absolute competitive target. Probability, power play, goalie pull, and pressure are not blindly summed on top of that floor. Independent recent events and history can still add drama.

| State | Ordinary live target before independent events/history |
| --- | --- |
| Tied, final 5 / 2 / 1 minutes | 77 / 84 / 88 |
| Down one, final 5 / 2 / 1 minutes | 69 / 74 / 78 |
| Trailing power play, final 5 minutes | at least 82 |
| Late two-skater advantage | at least 89 |
| Down one, goalie pulled in final 3 minutes | at least 85 |
| Down one, goalie pulled plus power play | at least 91 |
| Down two with extra manpower, final 3 minutes | 46; 55 with both pull and power play |
| Regular-season 3-on-3 OT | 80 |
| Shootout | 82 |
| Playoff OT / 2OT / 3OT | 90 / 93 / 96 |
| Deeper playoff OT | up to 97 |
| Deciding playoff game OT | at least 96 |
| Stanley Cup Final OT | at least 95 |
| Deciding Stanley Cup Final OT | 99 |

Late regulation targets can increase for postseason context and sustained directional pressure, bounded at 96. These are floors, not blanket overrides of independently earned drama.

On-ice parsing distinguishes skaters from goalies. Six-on-five is an extra attacker; six-on-four identifies both a goalie pull and an underlying power play. Missing goalie-roster evidence is not interpreted as a pulled goalie. Leading-team power plays have much less comeback leverage.

### Pressure and milestones

Pressure uses a trailing 90-second game-time window when timestamps permit, with an 18-record fallback only when game time cannot be established. It preserves shots, saves, breakaways, penalty shots, posts, crossbars, point-blank shots, and other premium chances. Standalone goalie-save attribution is reversed to identify the attacking team. Unattributed plays receive neutral directional weighting.

Directional weighting is `0.45 + 1.1 × trailingShare`: trailing pressure outranks balanced pressure, which outranks leading pressure. Activity is multiplied by current margin viability and a time-dependent leverage weight, capped at seven pressure points. Pressure contributes to the combined decisive target instead of being stacked again above it.

A two-goal player chase starts at +3 and a hat trick at +6, multiplied by current competitiveness. A recorded hat-trick scorer's latest goal decays over three minutes; missing timing receives a reduced award. A late 6–1 game receives little or no milestone lift. Separate verified storyline/milestone context remains available and unchanged.

### Completed viewing experience

NHL history explicitly measures late tying and go-ahead goals, verified extra-attacker tying goals, lead changes, multi-goal comebacks, and regulation time tied or within **one** goal. Time tied is a subset of within-one time and is awarded once. Incomplete goal ledgers do not earn an inferred full-game competitive-time award. Live history is capped at 12, completed history at 32.

Completed regular OT winners receive +13; shootouts +9; playoff sudden-death winners +18, with +4 for each deeper OT up to +28. Existing completed postseason/deciding-series context remains in effect. NHL history marks that it owns the finish, preventing the adapter's generic +14 last-play award from duplicating its finish. The generic finishing path for other sports is unchanged.

Inspection of real fixtures found elapsed NHL play clocks alongside remaining-time scoreboards. NHL scoring now infers play-clock direction from provider sequence numbers or a monotone scoring ledger. It handles five-minute regular OT and twenty-minute playoff OT locally. Final summaries without a period/clock still include their recorded OT winner. **Provider payloads, shared time helpers, timeline geometry, OT rendering, and phase labels were not changed.**

### NHL upset magnitude

Candidate identification still uses the existing +180 NHL moneyline threshold. Above that threshold, NHL's completed magnitude is continuous:

```text
min(22, 4 + 18 × (1 - exp(-(price - 180) / 210)))
```

Rounded completed awards are approximately +4 at +180, +7 at +220, +9 at +250, +12 at +300, +18 at +500, and +22 at +1000. Existing live activation/timing scales these smaller NHL magnitudes. NFL and CFB upset formulas are untouched.

## All provider movements of 10+ points

| Event ID | Matchup | Final | Old → new | Change | Explanation |
| --- | --- | --- | --- | --- | --- |
| 401892524 | Buffalo vs Montreal | 3–4 | 75 → 65 | −10 | Correct chronological lead changes reduce +6 to +3; within-one time is +6 instead of +7; the overlapping +6 decisive-score award is removed while the OT winner keeps +13. |
| 401892539 | San Jose vs Montreal | 4–3 | 92 → 71 | −21 | NHL upset magnitude decreases +18 to +4; history decreases +25 to +18 after chronological interpretation and removal of overlapping finish awards. |
| 401892545 | Boston vs Dallas | 2–3 | 72 → 58 | −14 | OT winner retains +13; duplicate recent-late-change/decisive-score awards of +5/+8 disappear, and within-one time replaces +7 with +6. |

Every synthetic movement of 10+ is separately flagged in the [synthetic table](nhl-calibration.md). The 25 real fixtures are regular-season completed games; postseason and live leverage are tested with synthetic scenarios, not represented as observed postseason fixtures.

## Calibration coverage

The new NHL suite covers early/mid/late ties and deficits of one through four goals; continuous fractional boundary sweeps including 1.9/2/2.1; trailing and leading power plays; 5-on-3; pulled-goalie deficits of one/two; 6-on-4; regular OT; shootout; playoff OT/2OT/3OT/deeper OT; deciding-series and Cup Final OT; late tying/go-ahead goals; lead changes; two-/three-goal comebacks; extra-attacker comebacks; competitive-time shares; elapsed/remaining clocks; incomplete final status; significant underdog leads/wins; and competitive versus blowout milestones. Browser and Node outputs match.

## Files changed

| Files | Purpose |
| --- | --- |
| `rating-core.js` | Global cap/raw total, canonical opening safeguards, optional NHL hook dispatch. |
| `scoring/sports/nhl.js` | Margin/runway, combined leverage, OT, pressure, history, upset, and milestone calibration. |
| `scoring/shared/pressure.js` | Optional model pressure hook; other sports retain existing path. |
| `alerts-worker/src/game-model.js` | Preserve raw audit total and respect model-owned completed finish. |
| `index.html`, `sw.js` | Browser dependency order and local shell cache version 41. |
| `test/nhl-calibration.test.js`, `test/helpers/nhl-calibration.cjs` | New NHL calibration infrastructure. |
| `test/pregame-cap.test.js` | All-sport cap, championship, transition, and 99 regression coverage. |
| `test/helpers/cap-pregame-oracle.cjs` | Explicit cap-only adaptation of historical parity engines. |
| `test/fixtures/scoring-before-nhl-cap.js.gz` | Exact immediate baseline engine plus original adapter, captured before edits. |
| `test/scoring-regressions.test.js`, `test-score.js` | Deliberate pregame and NHL expectation updates. |
| `test/scoring-module-parity.test.js`, `alerts-worker/test/sports-feed.test.js` | Preserve cross-runtime/adapter checks with new metadata and NHL finish ownership. |
| `test/nfl-calibration.test.js`, `test/cfb-calibration.test.js`, `test/cfb-completed-calibration.test.js`, `test/cfb-completed-upset.test.js` | Account for global cap; retain football-specific regression checks; NHL changes covered separately. |
| `scripts/nhl-calibration-report.cjs` | Reproducible old/new replay of all NHL fixtures and representative states. |
| `calibration/nhl-calibration.md`, `calibration/nhl-calibration.json`, `calibration/nhl-scoring-audit.md` | Full result tables, factor data, and this implementation/validation report. |

NHL baseline, scarcity, divisions, rivalry, verified storyline factors, and basic market competitiveness are unchanged. `scoring/sports/nfl.js`, `scoring/sports/cfb.js`, `scoring/shared/football.js`, and all existing provider fixtures have **no diff**.

## Validation

| Check | Result |
| --- | --- |
| New NHL calibration | 10 tests passed in final suite |
| New global pregame cap regressions | 8 tests passed in final suite |
| `node --test test/*.test.js alerts-worker/test/*.test.js` | **317 passed, 0 failed, 0 skipped** |
| Worker tests and self-contained in-memory Worker bundle | Passed within final suite |
| `node test-score.js` | Score model fixtures passed; watchlist and timeline fixtures passed |
| `node scripts/nhl-calibration-report.cjs` | All 25 NHL provider fixtures and 14 synthetic rows replayed |
| `git diff --check` | Passed |
| NFL/CFB sport-specific coefficients | Untouched |
| Existing provider fixtures | Preserved |
| Deployment | Not performed |

The first sandboxed suite passed all functional tests but denied esbuild directory traversal. The final suite ran with the needed local filesystem access and passed the real Worker bundle test; no checks were skipped. Logs are in ignored `work/nhl-audit/`.

Frozen baseline: commit `848f720f15db76d931ac560854a7c91de5e4dade`. Gzip SHA-256: `3e8cb657480810462ecb48b9fcf2fd5c6a34f870290551ddad277d1e2cffa75a`.
