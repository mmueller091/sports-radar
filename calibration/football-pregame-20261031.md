# NFL and CFB pregame calibration — October 31, 2026

Model: `2026-10-31.football-pregame.1`. Only upcoming football uses the new market and record adjustments. Existing live/final functions, upset activation and the live production policy are unchanged. A frozen pre-change bundle independently verifies all archived live/final and non-football games. Histories are retained without rewriting old points.

## Current captured examples

| Matchup | Spread | Before | After |
| --- | ---: | ---: | ---: |
| Mississippi State Bulldogs vs Texas Longhorns | TEX -20.5 | 37 | 38 |
| Notre Dame Fighting Irish vs Navy Midshipmen | ND -30.5 | 37 | 34 |
| Bucknell Bison vs Lehigh Mountain Hawks | LEH -27.5 | 40 | 33 |
| Hampton Pirates vs Towson Tigers | TOW -18.5 | 40 | 37 |
| Dayton Flyers vs Stetson Hatters | DAY -18.5 | 40 | 37 |
| Eastern Kentucky Colonels vs Tarleton State Texans | TAR -24.5 | 40 | 34 |

Texas/MSU rises by one because removing an unjustified −5 exceeds the new −4.21 mismatch deduction. Its ranked-team interest is retained. The FCS examples receive only the spread adjustment; there is no FCS surcharge. Their raw group-81 membership was retained, with division-only invariance tested.

## NFL interaction audit

| Matchup | Spread | Before | After |
| --- | ---: | ---: | ---: |
| Divisional mismatch: 7-1 vs 1-7 | 14 | 46 | 42 |
| Two winning teams, 14-point line | 14 | 67 | 53 |
| Two winning teams, 21-point line | 21 | 67 | 43 |
| Unbeaten favorite vs winless underdog | 21 | 48 | 35 |
| Close rivalry, winning teams | 3 | 73 | 69 |
| Close division game, winning teams | 3 | 73 | 66 |
| Playoff divisional mismatch | 14 | 68 | 64 |
| Close playoff game | 3 | 74 | 74 |
| Missing line retains original record context | Missing | 67 | 67 |

With a known line, record-evenness (+4) and winning-division-race (+3) no longer duplicate market competitiveness. Positive record/unbeaten interest retains 100% through a seven-point line, then linearly tapers to 50% at 21. Division prestige and postseason stakes remain. Verified rivalry news does not add another rivalry award to an already recognized division/rivalry game; postseason games do not also receive a generic playoff-race award. Two losing records and a winless record no longer stack as two separate record-quality deductions. Missing odds retain the existing record/rivalry/stakes rules and add no market evidence.

## CFB prestige checks

| Matchup | Spread | Before | After |
| --- | ---: | ---: | ---: |
| Two ranked teams, close line | 3 | 81 | 81 |
| Two ranked teams, large mismatch | 35 | 51 | 41 |
| One ranked team, large mismatch | 35 | 41 | 31 |
| Unranked teams, close line | 3 | 44 | 44 |
| Playoff mismatch | 27 | 71 | 64 |

The existing college ranking attenuation remains: one ranked team scales with competitiveness; two ranked teams retain 15% prestige plus scaled matchup interest. The parser now recognizes actual PK/zero and nested spread evidence. No FBS/FCS coefficient is added.

## Functions and injury evidence

NFL and CFB use their independent listed anchor sets with continuous linear interpolation and a −10 floor. Values are not rounded inside interpolation; displayed factor points retain two decimal places and the final rating remains an integer. Dense sweeps verify monotonicity and small changes across every anchor. These are transparent policy calibrations, not a claim of statistical optimality.

Injury classification requires explicit player importance and a confirmed absence/return in the same clause. Parenthetical/other-player news cannot supply importance to an ordinary injury. AI cannot invent a stronger player category. Cached injury factors are revalidated at read time; ordinary legacy rows are omitted without deleting unrelated contexts or snapshots. New injury evidence is versioned inside the existing context-text field, so no schema migration is needed.

For upcoming football, a qualified absence needs a known affected team. Without odds, a starting-QB absence can deduct five and another explicitly important absence three. With a line, there is no extra deduction unless reliable timestamps prove a newer absence on the underdog; that additional deduction is bounded at two. Unknown timing never proves an absence is not reflected in the market. Significant storylines remain available as qualitative context.

## Historical comparison limits

107 retained fixtures were projected before/after with the same stored records/odds. When an archived football scoreboard lacks odds, its captured provider-summary line is supplied to both engines for this projection and identified in the JSON. These are input-controlled comparisons, not verified historical opening-market snapshots. Full per-fixture values and the spread sweeps are in [the comparison JSON](output/football-pregame-20261031.json). Source captures, hashes and the named examples are retained in the regression fixture.

Final validation: all 637 repository/Worker tests passed, including independent frozen-engine comparisons for archived actual live/final and non-football games, browser/Worker upcoming parity, cached-injury filtering and storage round trips. Site build, Worker dry run and whitespace checks passed. Old golden assertions that explicitly required unchanged NFL/CFB pregame outputs were scoped to their remaining live/final/non-football promises; the new pregame tests use separate numerical anchors, captured production cases and a pre-change bundle.
