# Sports Radar scoring architecture and extraction report

One scoring engine, multiple sport models. `rating-core.js` retains the public
`globalThis.SportsRadarScore` API, score clamping, factor aggregation, live context
retention, snapshot freshness/rebasing, and model dispatch. Its line count changed
from **8,107 to 1,368**. No scores, thresholds, formulas, labels or caps were
intentionally changed.

`models.js` maps all eight sport keys to seven sport modules. NBA and NCAAB share
the basketball module with distinct history configuration and existing final-margin
rules. NFL and CFB reuse football primitives. Shared helpers never import models
or the core; dependencies are acyclic.

Models supply optional pregame, game-state, situation, milestone, event-shock,
pressure, context-anchor and completed-result hooks, plus history parameters.
The shared history engine invokes basketball hooks at the original positions
among comeback and other history factors, then applies the original caps.
The core similarly retains the original ordering of pregame and result factors.

## Loading and API compatibility

Modules use CommonJS exports in Node/Worker bundles and an internal
`SportsRadarScoring` namespace for classic browser scripts. The public API keeps
the same keys, constants, function signatures and return structures. Existing
Worker side-effect imports and Node `require('./rating-core.js')` are unchanged.

Classic browser loading now requires the dependency scripts before the core;
`index.html` supplies that order. `sw.js` precaches every module and increments the
shell cache version. Tools that evaluate source text load the same browser script
list through `test/helpers/scoring-source.cjs`; standalone legacy core files are
still supported, including `RATING_CORE_PATH` overrides. Evaluating only the new
core's source text without its dependencies is no longer a supported loader.

## Added files

- `scoring/models.js`
- `scoring/sports/nfl.js`, `cfb.js`, `mlb.js`, `nhl.js`, `basketball.js`, `tennis.js`, `soccer.js`
- `scoring/shared/config.js`, `records.js`, `market.js`, `context.js`, `time.js`, `probability.js`, `football.js`, `basketball.js`, `upset.js`, `college.js`, `pregame.js`, `history.js`, `events.js`, `pressure.js`
- `scoring/README.md` (this inventory and report)
- `test/scoring-module-parity.test.js`, `test/scoring-modules.test.js`
- `test/helpers/scoring-source.cjs`
- `test/fixtures/scoring-core-before-extraction.js.gz` (test-only frozen oracle; never bundled or precached)

## Changed files

- `rating-core.js`: orchestrator and compatibility exports.
- `index.html`: ordered scoring module scripts.
- `sw.js`: cache version and complete module asset list.
- `calibration/helpers.mjs`, `test-score.js`, `test/startup-feed.test.js`, `alerts-worker/test/sports-feed.test.js`: source loading includes the same browser dependencies. Existing assertions are unchanged.

## Function inventory

All 78 original named functions were classified. `clampScore` (an arrow function)
remains shared in the core. Configuration constants live in `shared/config.js`;
the live-context WeakMap remains private to the core.

| Original function | Classification | Current home |
| --- | --- | --- |
| `factorText` | Truly shared | `rating-core.js` |
| `recordFor` | Truly shared | `scoring/shared/records.js` |
| `rankFor` | Truly shared | `scoring/shared/records.js` |
| `parseLine` | Truly shared | `scoring/shared/market.js` |
| `lineFromSummary` | Truly shared | `scoring/shared/market.js` |
| `eventSignalText` | Truly shared | `scoring/shared/context.js` |
| `nflDivisionFor` | NFL-specific | `scoring/sports/nfl.js` |
| `divisionFor` | Truly shared | `scoring/shared/records.js` |
| `recordStats` | Truly shared | `scoring/shared/records.js` |
| `winningRecord` | Truly shared | `scoring/shared/records.js` |
| `listedSpread` | Truly shared | `scoring/shared/market.js` |
| `numberFromLine` | Truly shared | `scoring/shared/market.js` |
| `moneylinePrices` | Truly shared | `scoring/shared/market.js` |
| `spreadMarketPoints` | Truly shared | `scoring/shared/market.js` |
| `nflSpreadPoints` | NFL-specific | `scoring/sports/nfl.js` |
| `pregameMarketFactor` | Truly shared | `scoring/shared/market.js` |
| `proRecordFactors` | Truly shared | `scoring/shared/records.js` |
| `proTeamQualityFactors` | Truly shared | `scoring/shared/records.js` |
| `normalizeContextType` | Truly shared | `scoring/shared/context.js` |
| `pregameContextFactors` | Truly shared | `scoring/shared/context.js` |
| `aggregateScoreFromText` | Truly shared | `scoring/shared/context.js` |
| `specificStakesFactors` | Truly shared | `scoring/shared/context.js` |
| `singleEliminationRound` | Truly shared | `scoring/shared/context.js` |
| `isPostseasonGame` | Truly shared | `scoring/shared/context.js` |
| `playoffSeriesLeverage` | Truly shared | `scoring/shared/context.js` |
| `championshipSeriesFactors` | Truly shared | `scoring/shared/context.js` |
| `completedStakesImpact` | Truly shared | `scoring/shared/context.js` |
| `pregameRating` | Shared orchestration; NFL, college and tennis branches extracted | `rating-core.js` |
| `normalizedTime` | Truly shared | `scoring/shared/time.js` |
| `gameProgress` | Truly shared | `scoring/shared/time.js` |
| `eventPosition` | Truly shared | `scoring/shared/time.js` |
| `normalizeWinProbability` | Truly shared | `scoring/shared/probability.js` |
| `winProbabilitySeries` | Truly shared | `scoring/shared/probability.js` |
| `winProbabilityImpact` | Truly shared | `scoring/shared/probability.js` |
| `defensiveFinishFactor` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballStagnationImpact` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `momentumImpact` | Shared history; NBA/NCAAB lead-change and tie branches extracted | `rating-core.js` |
| `underdogCandidate` | Truly shared | `scoring/shared/market.js` |
| `upsetImpact` | Truly shared | `scoring/shared/upset.js` |
| `unbeatenStartImpact` | NFL-specific | `scoring/sports/nfl.js` |
| `contextCarryWeight` | Shared interpolation; MLB/NHL anchors extracted | `rating-core.js` |
| `nhlLiveMarginCloseness` | NHL-specific | `scoring/sports/nhl.js` |
| `basketballLiveCloseness` | Basketball shared (NBA/NCAAB) | `scoring/shared/basketball.js` |
| `mlbLiveMarginCloseness` | MLB-specific | `scoring/sports/mlb.js` |
| `footballMarginCloseness` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballCompetitorId` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballCompetitorAbbreviation` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballSituationFieldPosition` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballLiveCloseness` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballRunwayPenalty` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `stateRating` | Shared aggregation; football, MLB, NHL and basketball state branches extracted | `rating-core.js` |
| `rateGame` | Shared orchestration; NFL completed-result branch extracted | `rating-core.js` |
| `ordinal` | Truly shared | `scoring/shared/time.js` |
| `livePhase` | Truly shared | `scoring/shared/time.js` |
| `runnerOn` | MLB-specific | `scoring/sports/mlb.js` |
| `clockSeconds` | Truly shared | `scoring/shared/time.js` |
| `footballFieldPosition` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `footballSituationImpact` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `sideScores` | MLB-specific | `scoring/sports/mlb.js` |
| `baseballSituationImpact` | MLB-specific | `scoring/sports/mlb.js` |
| `hockeyOnIceState` | NHL-specific | `scoring/sports/nhl.js` |
| `hockeyPowerPlay` | NHL-specific | `scoring/sports/nhl.js` |
| `hockeySituationImpact` | NHL-specific | `scoring/sports/nhl.js` |
| `basketballSituationImpact` | Basketball shared (NBA/NCAAB) | `scoring/shared/basketball.js` |
| `tennisSituationImpact` | Tennis-specific | `scoring/sports/tennis.js` |
| `dangerousChanceImpact` | Shared NHL/soccer pressure; soccer weighting extracted | `rating-core.js` |
| `soccerSituationImpact` | Soccer-specific | `scoring/sports/soccer.js` |
| `noHitBid` | MLB-specific | `scoring/sports/mlb.js` |
| `hockeyGoalMilestone` | NHL-specific | `scoring/sports/nhl.js` |
| `footballMilestone` | Football shared (NFL/CFB) | `scoring/shared/football.js` |
| `basketballScoringMilestone` | Basketball shared (NBA/NCAAB) | `scoring/shared/basketball.js` |
| `baseballPerformanceMilestone` | MLB-specific | `scoring/sports/mlb.js` |
| `soccerScoringMilestone` | Soccer-specific | `scoring/sports/soccer.js` |
| `liveMilestone` | Shared model dispatch | `rating-core.js` |
| `eventShockImpact` | Shared event history; sport-specific patterns extracted | `rating-core.js` |
| `liveSnapshot` | Shared aggregation; situation dispatch extracted | `rating-core.js` |
| `refreshLiveState` | Truly shared | `rating-core.js` |
| `applyLiveSnapshot` | Truly shared | `rating-core.js` |

CFB-specific ranking branches formerly inside `pregameRating` now live in
`cfbPregame` and `cfbRankedMatchup`. NBA/NCAAB-specific branches now live in
`basketballPregame`, `basketballRankedMatchup`, `basketballGameState`,
`basketballLeadChanges`, `basketballLateTies` and `basketballEventShock`.
NFL's extracted pregame branch is `nflPregame`; its completed-result hook owns
the exact `Ended unbeaten start` label. MLB/NHL state branches are
`baseballGameState` and `hockeyGameState`. Tennis's tournament branch is
`tennisMajor`. Soccer's pressure weighting is `soccerPressureWeight`.

## Shared helpers introduced by extraction

These are extracted operations or adapters, not new scoring formulas:

- `collegePregame`: shared rank parsing, competitiveness scaling and cumulative rounding; model callbacks provide the differing college awards.
- `marketPregame`, `proPregame`: existing market, record and division operations in their original order.
- `footballGameState`, `footballSituation`: shared NFL/CFB model adapters.
- `historyImpact`: the former shared momentum engine with model history hooks; `momentumImpact` remains its public compatibility wrapper.
- `contextWeightFor`: existing context interpolation with model-provided anchors.
- `eventShockFor`: existing chronological event parsing and decay with sport pattern hooks.
- `pressureImpact`: existing shared dangerous-chance detection with soccer's weighting hook.

## Validation

Commands:

```text
node --test test/*.test.js alerts-worker/test/*.test.js
node test-score.js
```

| Checkpoint | Suite result | Browser fixture result |
| --- | --- | --- |
| Unmodified baseline | 220 passed, 0 failed, 0 skipped | Both groups passed |
| NFL + shared primitives | 229 passed, 0 failed, 0 skipped | Both groups passed |
| MLB | 229 passed, 0 failed, 0 skipped | Both groups passed |
| NHL | 229 passed, 0 failed, 0 skipped | Both groups passed |
| Basketball | 229 passed, 0 failed, 0 skipped | Both groups passed |
| CFB | 229 passed, 0 failed, 0 skipped | Both groups passed |
| Tennis | 229 passed, 0 failed, 0 skipped | Both groups passed |
| Soccer | 229 passed, 0 failed, 0 skipped | Both groups passed |
| Model dispatch | 229 passed, 0 failed, 0 skipped | Both groups passed |
| Final, including expanded parity and module tests | 234 passed, 0 failed, 0 skipped | Both groups passed |

The 14 added tests cover:

- One parity test for each of NFL, MLB, NHL, NBA, NCAAB, CFB, Tennis and Soccer: 576 scenarios total, compared with the archived core in both Node and the browser VM. Full ratings, ordered factors, history, snapshots and repeated snapshot applications are compared.
- 34,020 direct state boundary comparisons, including unknown sports, missing data, NaN/infinite margins, clock boundaries and probability variants.
- Full normalized/enriched output parity for all 107 archived provider fixtures, using the unchanged current adapter with the old and new scoring engines.
- Public API key, constant and function-arity parity.
- Module exports, browser dependency order, asset completeness and service-worker precaching.
- Acyclic dependencies and the prohibition on shared helpers importing sport models/core.
- An actual self-contained Worker build using the installed esbuild, execution of that bundle, and score/factor comparisons across all eight sports and three phases.

The native esbuild executable needed read access beyond the sandbox's directory
enumeration restrictions. The local check passed with that access; it performed
an in-memory build and no deployment or network request.

Original core SHA-256 (decompressed oracle bytes):
`78a767d2025a00eaf7e033197230c72d4e16888660726cfd7064666408065466`.
Detailed execution logs are retained locally in ignored `work/scoring-refactor/`.

## Evidence limits

No scoring differences were found. These finite fixture and boundary checks do
not prove equality for every possible future provider payload. Browser execution
was verified in the existing VM harness; the Worker bundle was compiled and
executed locally. Live service deployment and a manual browser/offline-network
session were not performed. No existing test assertion was weakened or removed.

## Git summary

27 files added and 7 existing files changed; no files deleted. The added files
comprise 22 runtime modules, this report, two test files, a browser-source loader
and the compressed test oracle. No application display or Worker adapter logic
changed. The working tree is ready for review; nothing was deployed or published.
