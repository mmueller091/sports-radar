# CFB live/final scoring audit — 2026-10-27

Implemented independent CFB live calibration. No deployment was performed. The existing NFL calibration was already present as uncommitted work when this task began; it was retained.

The reproducible [calibration report](cfb-calibration.md) contains the complete A–Y before/after matrix, 30-cell margin/time grid, every requested relative assertion, spread/rank tables, NFL A–P exact comparisons, and all 50 stored CFB results. Run `node scripts/cfb-calibration-report.cjs` to regenerate it.

## Exact files changed by this audit

Modified:

- `scoring/sports/cfb.js`: CFB opportunity, margin, decisive possession/snap, overtime, live upset and rank interactions. Pregame logic and completed history wiring retained.
- `rating-core.js`: optional model hooks for competition preparation, live closeness, upset calibration, decisive stakes/floor, transient-context viability and uncertainty ceiling. Public export keys and function arities retained.
- `test/late-football-drive.test.js`: two superseded CFB floor constants now assert CFB headroom interactions; CFB reason text updated. NFL expectations remain equivalent.
- `test/nfl-calibration.test.js`: only the two assertions requiring *CFB* to equal the old engine now compare current CFB browser/Node output. Every NFL assertion remains intact.
- `test/scoring-module-parity.test.js`: CFB live paths compare browser/Node; pregame, completed ratings and all history remain pinned to the archive. Other-sport archival checks retained.
- `test/scoring-modules.test.js`: CFB A–Y added to bundled Worker/Node equivalence.

Added:

- `test/helpers/cfb-calibration.cjs`
- `test/cfb-calibration.test.js`
- `test/fixtures/scoring-core-before-cfb.js.gz`
- `scripts/cfb-calibration-report.cjs`
- `calibration/cfb-baseline.json`
- `calibration/cfb-calibration.md`
- `calibration/cfb-scoring-audit.md`

`scoring/shared/football.js` and `scoring/sports/nfl.js` are byte-identical to their versions at the start of this audit. Their existing Git modifications belong to the prior NFL work. The shared football primitives for timeout validation, team identity, field parsing, baseline possession metadata, completed history, milestones and event shocks are reused without modification. The raw shared helper remains a primitive; the public core and CFB model dispatch through CFB calibration. Shared modules never import sport models, and the dependency graph remains acyclic.

## Exact live formulas

Let `clamp(x)` constrain to [0,1], `p` be elapsed-game progress, `g` the absolute margin, `s` Q4 seconds remaining, and `B` the recomputed live base score. Scores remain integer values in [1,99]. These coefficients are watchability calibration parameters, not fitted win probabilities.

### Opportunities and clock

- Missing/insufficient runway data: `E = max(0, 14*(1-p) + .5 + sharedPossessionAdjustment)`. Previously CFB used 12.5 full-game possessions. The shared adjustment remains +.45 with trailing possession, another +.25 in advanced territory, or −.35 for a known late leading possession.
- With known possession and a valid Q4 clock, use the college runway estimate. When the leader has possession, require a valid down and explicit trailing-team timeout count. `snaps = 4-down`; `warning = 1` only for a known season >=2024 with `s > 120`; `stops = timeouts + warning`.
- After a conditional defensive stop, `remaining = max(0, s - 6*snaps - 40*max(0,snaps-stops) - 8)`. The final 8 seconds budget the change of possession. This assumes no new first down; it does not guarantee a stop.
- Remaining offensive timeouts are `max(0,timeouts-max(0,snaps-warning))`. Timeouts spent getting the ball are not reused on offense. With current trailing possession, all reported timeouts remain available.
- `yards = 100-fieldPosition` for current trailing/tied possession (75 when position is missing), otherwise 75. `driveSeconds = 12 + yards*(remaining <= 120 ? .42 : .60)`. The shorter late college drive budget reflects first-down clock stops.
- `usable = remaining + 5*offensiveTimeouts`.
- `E = min(14*remaining/3600 + 1.5, min(1,usable/driveSeconds) + max(0,usable-driveSeconds)/145)`. A zero remaining clock forces `E=0`; a defensive stop still required multiplies `E` by .78. The pace budget prevents extrapolating hurry-up cycles to seven possessions in a quarter.
- Scoring opportunities needed: `R = g>0 ? max(1,g/7) : 0`. Fractional opportunities account for conversion difficulty and avoid the old 8-to-9-point step.
- Feasibility `F = 1/(1+exp(-2.8*(E-R+.45)))`, with a tied game set to 1 and a nonzero deficit with zero remaining opportunities set to 0.

The first-down and two-minute-timeout distinction is grounded in [NCAA's 2024 timing change](https://www.ncaa.org/news/media-center-technology-rules-approved-in-football/). The coefficients are intentionally CFB-specific; the NFL model is not used as its calibration.

### Margin, urgency and dead-game decay

CFB linearly interpolates these margin anchors:

| Margin | 0 | 3 | 7 | 10 | 14 | 17 | 21 | 28 | 35 | 42 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Closeness | 1 | .99 | .95 | .87 | .76 | .64 | .49 | .28 | .10 | 0 |

`close = marginCloseness*(.20+.80*F)`. Transient opening context is multiplied by `.15+.85*F`; existing postseason retention still uses `.68*F`. Thus neither a ranked matchup nor postseason prestige keeps a dead game high.

The live close ceiling is `14+16*p+10*u*direction`, where `u=clamp((660-s)/540)` during positive-clock Q4 only. Direction is 1 for a trailing/tied offense, `.45*F` for a leading offense, and .2 if possession is unknown. For margins >=9, the wide penalty is `round(min(30,20*(1-F)*p+4*max(0,R-E)))`.

When `stateRating` receives a probability estimate, CFB constrains its uncertainty contribution to `min(uncertainty,F)`; the provider probability itself is retained. Existing baseline, phase and context weights otherwise remain unchanged. Runtime snapshots keep WP separately observable.

### One decisive interaction

Regulation eligibility requires identified possession, an offense tied or trailing by no more than eight, Q4, and a positive clock. An explicit critical two-point try may survive 0:00. Urgency is `U=clamp((600-s)/480)`, or 1 for an explicit critical try within 150 seconds.

Consequence coefficient `C` is selected by maximum, not a sum of FG/fourth/goal/try awards:

- Ordinary decisive drive: `.73+.06*clamp((fieldPosition-25)/55)`; unknown position uses 25.
- Winning FG range (deficit <3, field position >=60): .84.
- Final meaningful fourth down: at least `.87+.03*clamp((10-distance)/9)`. Missing/invalid distance adds no short-distance strength. Failure is final when the opponent's modeled first-down possession leaves <=15 seconds; missing timeout data requires <=45 seconds remaining instead.
- Explicit goal-to-go at the opponent 10 or closer: at least .91.
- Critical tying two-point try: .92; winning try: .95.
- CFP/championship decisive snap strengthens `C` by .04, capped at .98. A pair of ranked teams strengthens `C` by `.04*((26-worseRank)/25)^2`, capped at .98. These modify remaining headroom only when a decisive possession exists.

Reachability `V=min(1,s/(10+.42*yardsNeeded))`, where the target is the opponent 35 for a winning FG and the end zone otherwise. A validated goal-line snap or explicit critical try uses `V=1`. A full-field march with one second left therefore does not receive a decisive-possession floor.

`floor = round(max(0,99-B)*C*U*V)`. For CFB, this replaces overlapping positive probability/situation/pressure contribution when active; negative WP cannot cancel it. It is not an additional FG, down, timeout or OT bonus. Ordinary early fourth downs are at most 3 points and early explicit tries 2. Existing milestones, event shocks and history remain available under their existing aggregation/caps.

The existing live refresh recomputes `B` before each snapshot. Tests prove idempotence, stability across routine plays, and removal of the floor after possession loss.

### CFB overtime

Period >4 establishes only that overtime is active. It does not establish response rights. A completed same-period offensive series by the opponent, supported by drive team/start-period/result and an identifiable offensive play, establishes the response opportunity. Current drives, timeouts/kickoffs, earlier OT periods, missing offensive plays and ambiguous multiple series do not establish it. A responding touchdown drive already marked completed may still retain its pending explicit conversion if the two series are chronologically identifiable.

- Opening/unknown-rights OT possession: `C=.82` (S=90).
- Response that can decide or extend the game: `.94` (T=96).
- Explicit response conversion or shootout attempt: `.97` (U=97).
- CFP/championship response on a try, goal-to-go snap or fourth down: `C=1` (V=99).
- An explicit opening conversion after a touchdown retains ordinary OT watchability, without assuming that scoring ends the game.

Shootout classification requires an explicit pending two-point attempt plus season/period evidence: 3OT+ from 2021, 5OT+ in 2019–2020. A bare 3OT period does not prove either a try or possession order. These structures are documented in [NCAA's football statistics manual](https://fs.ncaa.org/Docs/stats/Stats_Manuals/Football.pdf) and the [current NCAA overtime explanation](https://www.ncaa.org/news/media-center-changes-to-injury-timeouts-approved-in-football/). No NFL possession-rights rule is imported.

### Upset magnitude and rankings

Existing market selection, side identification, spread parsing and eligibility are unchanged. The live interaction intentionally changes +7 activation from zero to one half, rising continuously to full activation at +10. Completed activation remains unchanged.

For an eligible spread `a`, `x=clamp((a-7)/23)` and nonlinear magnitude `M=x*x*(3-2*x)`; it saturates at +30. Rank threat is `T=((26-favoriteRank)/25)*clamp(((dogRank || 35)-favoriteRank)/20)`, or zero without a valid ranked favorite and identified underdog.

Let `m=dogScore-favoriteScore`. Leading threats activate at p>=.35; tied/trailing threats at p>=.7. Viability is:

`F * exp(-(abs(m)/(m<0 ? 8 : 22))^1.6) * possessionWeight * fieldWeight * (m>0 ? 1.25 : 1)`.

For a trailing dog, possession weight is 1 with the ball, .65 without it, .8 if unknown. Advanced field position adds at most an 8% interaction (`1+.08*clamp((position-50)/50)`); all other field weights are 1. `F` is the absolute-margin comeback feasibility, so a leading dog also loses tension when the favorite has no realistic way back.

`upset = min(36, round((12+16*M+6*T*clamp((p-.5)/.4))*(.35+.65*p)*viability*activation))`, where `activation=.5+.5*existingActivation`.

At 1:30, a +7 dog leading by three receives 6 upset points; +14 receives 16; +21 receives 24; +28 receives 29. The corresponding final live scores are 89, 92, 94 and 95. A +28 dog leading by 21 at halftime scores 42, and a +21 dog down 17 late has zero upset tension. For a +21 dog leading late, an unranked favorite produces 24 upset points, No. 20 produces 25, and No. 2 produces 30. Integer rounding can leave the overall No. 20 score equal despite its larger component.

## Provider fields and fallbacks

- Clock: `status.period`, `status.displayClock` through the existing `clockSeconds` parser.
- Possession: `situation.possession` or `.possession.id`, matched against `competitor.team.id` / `competitor.id`; scores from current scoreboard competitors.
- Timeout counts: `situation.homeTimeouts` / `awayTimeouts`, then the corresponding competitor's `timeouts`. Only integers 0–3 are accepted. Text is never used to reconstruct counts.
- Field/down: `down`, `distance`, `possessionText`, `downDistanceText`, `shortDownDistanceText`, `isGoalToGo`; team abbreviations are checked, including longer college abbreviations. Unknown sides do not become opponent territory.
- Try: explicit `isTwoPointAttempt === true`; stale touchdown/try text cannot activate a pending try.
- Rankings: `curatedRank.current` or `team.rank`, valid 1–25.
- Season: competition season or event season retained by `prepareCompetition`; summary header season also informs OT. Missing year does not earn a two-minute timeout or prove shootout structure.
- OT evidence: `summary.drives.previous`, `start.period.number` or first-play period, `team.id`, `result`, `isCurrent`, and `plays[].start.team.id` with offensive play evidence.
- Stakes: event/competition context identifies an actual CFP or national/conference championship. Race/berth/rematch wording is excluded from the new decisive-stakes hook. A generic bowl/postseason label alone does not produce a maximum.

Missing clock or possession never invents a decisive regulation state. Missing defensive timeout/down information falls back to the broad possession estimate. Existing scoreboard-authority and stale-summary rejection behavior is unchanged.

## Stagnation and completed games

CFB live stagnation stays disabled. The repository contains no representative captured live samples with independent offensive-efficiency, failed-drive, pace and defensive-action evidence sufficient to calibrate a college penalty. Importing NFL thresholds would risk punishing service-academy styles and defensive 10–7 games. X and Y intentionally both score 77. Existing CFB completed stagnation remains enabled and unchanged.

No new completed-result factor was added. Final margin, lead changes, comeback history, sustained competitiveness, WP swings, decisive scoring/defensive finishes, OT, upset points and completed stakes all retain their prior paths. All 50 stored CFB completed outputs, including their full normalized/enriched objects, match the frozen engine exactly. The largest captured winning underdog is +19.5 and already scores 99; this set does not establish that an additional enormous-upset bonus would improve completed calibration. Completed market activation and its magnitude saturation remain a known limitation rather than an unvalidated new award.

## Real-game findings and remaining unsupported cases

- Stored fixtures cover ranked games, comebacks, blowouts, ordinary upsets, low totals, shootouts, two 1OT results and one 2OT result. They do not include a +21-or-larger winning dog, a 3OT+ result or live timeout snapshots. No historical event ID or outcome appears in runtime scoring.
- The stored Florida State–Miami 2OT result scores 77. That may understate multi-OT drama; the eight-point final margin and existing history cap limit it. It was not individually boosted.
- The stored Alabama–Tennessee result scores 27 despite a ranked favorite losing by 16. The winning +7.5 dog receives only 3 completed upset points under the existing activation ramp. This is a candidate for a separate completed-results calibration with human judgments.
- The Tulsa–Rice comeback ends with a 21-point margin and scores 26 despite 25 history points. This illustrates the existing final-margin/history tradeoff; it was not forced upward to fit one game.
- There is no captured provider evidence for the new live scenarios, so the synthetic relationships are verified but not a claim of empirically fitted live scores.
- Clock-running/stopped status, actual future first downs, exact time to punt, timeout-use strategy, onside recoveries and penalty/untimed-down extensions are not fully modeled. Defensive possession estimates are conditional on getting a stop, discounted accordingly.
- Missing/ambiguous OT series order uses the opening/unknown-rights floor. Defensive OT return endings, forfeits and unusual provider period encoding need explicit additional evidence. Missing season does not prove a historical rules regime.
- Unknown field position uses a full-drive budget. No kicker-specific range, weather, team tempo, efficiency or personnel model is introduced. Division-specific historical timing outside the tested NCAA regimes is not separately calibrated.
- Existing milestone/event/history additions can still saturate an already high game at 99; this audit removes stacking within decisive state, not all existing historical/event contributions.

## Regression and test results

Before implementation: 222/222 scoring tests, 22/22 Worker tests, and legacy `test-score.js` passed. The first sandboxed baseline run had one environment-only esbuild parent-directory access failure; the authorized unrestricted rerun passed all 222. Baseline values and a compressed frozen browser engine were saved before runtime changes.

After each major model revision, the CFB tests and NFL calibration/regression tests were rerun. Final validation:

- `node --test test/*.test.js`: 231 passed, 0 failed, 0 skipped.
- `node --test alerts-worker/test/*.test.js`: 22 passed, 0 failed.
- `node test-score.js`: scoring, watchlist and timeline fixtures passed.
- Browser/Node equivalence includes A–Y, all 30 CFB margin cells, existing cross-sport boundary grids, API signatures and public keys.
- Bundled Worker/Node equivalence includes NFL A–P and CFB A–Y. Modules load in classic-browser order, are cached offline, and have an acyclic dependency graph without Node-only Worker imports.
- Report assertions: 14/14 requested relative groups pass; tests also cover timeout direction, routine-play stability, invalid/missing fields, era-sensitive OT, stale try text, rank/line gating and idempotent refresh.
- NFL A–P all-component exact equality: A 53, B 64, C 87, D 40, E 52, F 92, G 56, H 42, I 64, J 55, K 92, L 39, M 99, N 56, O 93, P 94. The frozen engine includes the latest NFL calibration.
- All 107 provider fixtures retain complete adapter output: CFB 50, NFL 25, NHL 25, NBA 3, MLB 2, NCAAB 2. Synthetic frozen-engine comparisons additionally cover Soccer and Tennis. No other sport's runtime model was edited.
- `node scripts/cfb-calibration-report.cjs`: completed successfully, including exact provider-output assertions.
- `git diff --check`: passed. Git reports existing LF/CRLF conversion notices, not whitespace errors.

No tests were loosened for NFL or other sports. Only CFB assertions made obsolete by the intentional live calibration were changed; previous qualitative CFB regression assertions all still pass.
