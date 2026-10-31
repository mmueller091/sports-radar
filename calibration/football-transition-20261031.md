# Football pregame-to-live continuity — October 31, 2026

Production model: 2026-10-31.football-transition.1. Comparison baseline: f31e46d. All comparisons execute scoring/live-runtime.cjs → calibration/shadow-candidate.cjs → the NFL/CFB models, not the legacy rateGame result alone. The frozen previous runtime selects its original unchanged policy. Full factors, live components, history, trajectory, uncertainty evidence and input provenance are in [the comparison JSON](output/football-transition-20261031.json).

## Correction

At kickoff, the calibrated opening rating owns the whole state basis. Through the first half, a cubic smoothstep transfers ownership to the existing live baseline, retained context/stakes, and current-tension award. This happens before live bonus/floor/history aggregation; actual plays retain their independent credit. There is no score cap, kickoff subtraction, team exception or step activation. The existing CFB 34-to-48 tension scale and midgame competition/history improvements remain selected. The transition is fully mature at halftime and introduces no new fourth-quarter gate.

Both sports now use the October 31 calibrated pregame basis in production. Market competitiveness and signed injury/context reductions therefore survive the transition. A smooth market-to-validated-ESPN uncertainty handoff prevents an early tied scoreboard from erasing expected mismatch. Missing ESPN WP uses remaining expected spread and the observed score in touchdown scoring units, or neutral uncertainty when neither market nor WP is available. It does not select the missing-WP maximum. Actual ESPN telemetry remains separate from the internal estimate.

The feed retains the last observed pregame baseline, factors and market inputs. It recovers that baseline from D1 after feed/Worker resets, including snapshots from the preceding calibrated release. Browser refreshes receive that same serialized value. If no pregame observation exists, the live model uses a reconstruction with the same calibrated rules; the football card hides “vs start” instead of labeling that estimate as an observed start. Completed-game rating calculations are untouched.

## Representative controlled projections (missing WP)

These retain actual captured team/record/market inputs, with the listed clock and a 0–0 score imposed for before/after comparison. They are not claims about the historical scores at those clocks. The Bucknell capture lists Lehigh -27.5, versus -26.5 in the user's later screenshot.

| Game | State | Calibrated pregame | Previous live | Corrected live |
| --- | --- | ---: | ---: | ---: |
| CFB Bucknell Bison at Lehigh Mountain Hawks | Kickoff | 33 | 61 | 33 |
| CFB Bucknell Bison at Lehigh Mountain Hawks | Q1 two minutes | 33 | 61 | 33 |
| CFB Bucknell Bison at Lehigh Mountain Hawks | Q1 five minutes | 33 | 61 | 34 |
| CFB Bucknell Bison at Lehigh Mountain Hawks | Halftime | 33 | 71 | 56 |
| CFB Bucknell Bison at Lehigh Mountain Hawks | Late scoreless | 33 | 89 | 87 |
| NFL Philadelphia Eagles at Jacksonville Jaguars | Kickoff | 45 | 63 | 45 |
| NFL Philadelphia Eagles at Jacksonville Jaguars | Q1 two minutes | 45 | 63 | 45 |
| NFL Philadelphia Eagles at Jacksonville Jaguars | Q1 five minutes | 45 | 62 | 46 |
| NFL Philadelphia Eagles at Jacksonville Jaguars | Halftime | 45 | 58 | 55 |
| NFL Philadelphia Eagles at Jacksonville Jaguars | Late scoreless | 45 | 74 | 74 |

## Verification

210 production-path controlled comparisons; kickoff equals calibrated pregame across all tested WP/market combinations. 107 archived completed/non-football/upcoming fixtures have identical scores and factors under the previous and current production selections. The regression matrix additionally covers meaningful early defensive touchdowns, early/final fourth downs, possessions, down/distance, overtime, postseason, missing/available WP, large spreads and pick’em, scoreless games, upsets, and late comeback viability. Browser-bundle and Worker comparisons cover 504 football state/market/score/WP combinations. Existing frozen experimental and calibration policies remain unchanged; only the production selection enables the new transition.

## Release checks

All 687 root/Worker tests passed (no failures or skips), including the historical calibration, disabled-policy isolation, existing halftime/midgame, possession/runway, completed-game, browser/Worker bundle, notification, cache, and storage suites. The separate `node test-score.js` smoke pack passed; its three stale NFL pregame expectations were aligned with the already-published October 31 calibration. Site build, Worker deployment dry run, JavaScript syntax, and whitespace checks passed. The retained halftime fixture remains 69. Frozen byte-provenance checks used their recorded LF/CRLF identities and the existing local historical checkpoint; no frozen source or fixture content was changed. Browser UI inspection was unavailable because local browser use is disabled in Work settings; executable browser-bundle parity is covered by the tests.

At kickoff without WP, the CFB Bucknell–Lehigh projection previously received 12 baseline + 15 retained context + 34 Current Tension = 61, despite a calibrated pregame 33. It now carries that 33 with zero unearned live baseline/tension. The NFL Eagles–Jaguars projection previously received 12 + 17 + 34 = 63 against a pregame 45; it now starts at 45. Both remain at their pregame value after two uneventful minutes. Late scoreless projections still reach 87 (CFB) and 74 (NFL).
