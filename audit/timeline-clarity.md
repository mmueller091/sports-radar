# Game Center timeline clarity

Baseline: `a0ebd2fb27931e4b3bd0303fd2d0222913d9b107`.

## Findings

The history API did not identify older incomplete completed observations unless an explicit partial flag had been saved. Chiefs' six 38s have no completed-summary evidence; the supported result remains 75. Notre Dame's 61 was a supported earlier result with a 74–70 score, superseded by 65 at 74–72. Celtics' five identical 67s include refresh/model metadata changes and a final-clock reset.

The chart labeled every completed snapshot “Final assessment.” Although the previous release broke the connecting line at the live/final boundary, final points still participated in marker selection and time positioning. The end of the raw observation array was also visually emphasized. That made incomplete, duplicate and superseded records appear comparable to the current final rating.

## Changes

- Add read-time evidence quality to history responses. Explicit rejection flags mark invalid updates; missing completed-summary evidence marks incomplete updates. This does not recalculate ratings or change persistence.
- Draw the live chart using the original usable live values, leaving gaps across omitted observations and model boundaries. Completed observations no longer alter overtime spacing or create live movement markers.
- Show “Final rating / Whole game” separately from “Last reliable live rating.” Read the authoritative current value from the canonical game, independently of the last saved observation. Incomplete current data shows “Pending.”
- Keep incomplete, discarded and earlier final updates in collapsed “Rating history.” Group duplicates by rating and game score, with every original timestamp still available. Explain genuine score corrections explicitly.
- Keep scoring-play estimates distinct from recorded live values. Do not replace a terminal overtime estimate with the whole-game final rating. Scoring-event markers sit on the time axis rather than borrowing a nearby rating.
- Use native keyboard-accessible disclosure controls, visible focus styles and responsive two-column rating cards with wrapping text and 44px disclosure targets.

No scoring weights, scoring modules, model version, experiment settings, ingestion, persistence or retention policies changed. Worker changes are confined to history response classification.

## Before and after

| Game | Before | After |
| --- | --- | --- |
| Chiefs–Broncos | Six 38s alternating with six 75s, all labeled final | Final 75; six incomplete 38s grouped in history; six matching 75s grouped separately |
| Notre Dame–Villanova | Final assessments 61 and 65, with repeated 65s | Final 65; earlier 61 explains the score correction from 74–70 to 74–72 |
| Celtics–Magic | Five final markers at 67 | Final 67; five matching saved updates in one history group |

All raw saved values remain available; none were deleted, rewritten or smoothed. The last usable recorded live values in these captures are 96, 47 and 7 respectively, explicitly separate from 75, 65 and 67.

The accompanying `timeline-clarity-comparison.json` records the exact captured observations and nine deterministic scoring replays against the baseline across NFL, CFB, NHL, NBA and NCAAM. All nine full scoring results are unchanged. Replay state/phase is included: a captured live replay is not an alternative final rating.

## Validation and limits

Focused timeline/integrity tests: 66 passed. Full relevant suite: 945 passed, zero failures or cancellations. Additional `test-score.js` smoke checks and Worker dry-run build passed. Regression coverage includes the three production examples, legitimate final corrections, stale later finals, resumed play, live score corrections, unchanged-clock fluctuations, overtime, empty/incomplete history, escaping, native disclosures and responsive styles. Existing scoring, defensive excitement, blowout, conversion, delayed-PAT and interaction regressions remain in the full suite.

Desktop/mobile visual inspection could not be completed: Computer Use stopped before opening the preview because it could not verify Chrome's current URL. Automated rendering/interaction and responsive-style checks are not a substitute for a visual pass.

Legacy observations do not all retain original provider responses. Missing evidence is conservatively labeled incomplete; an unflagged legacy live observation is not newly certified by this release. Production history remains subject to the existing 30-day retention period.
