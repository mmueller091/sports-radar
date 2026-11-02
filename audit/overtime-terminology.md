# Overtime terminology release

Baseline: `39059fa99d066f06474af23d7ffb149568cc2fc8`.

## Root cause and scope

Completed status already said `Final/OT`, and shared `livePhase()` already understood overtime by sport. Decisive-play generation bypassed it, using provider `period.displayValue` or a `Period N` fallback. The browser's fallback description did the same. Last-score descriptions and play lists had separate period-label paths. Scoring tables also used `OT2` and could label subsequent NHL playoff overtime as a shootout.

`scoring/shared/time.js` now provides display helpers that reuse `livePhase()`. The production runtime exposes them without changing the legacy scorer API or any scoring calculations. The Worker passes the formatter into its existing moment-selection path. Browser cards, Game Center moments, play lists, timeline labels/accessibility text and scoring-table overtime headings use the shared rules.

For cached moments, only a leading generated `Period N` or ordinal-period label followed by a clock and separator is eligible for conversion. The rest of the description is untouched. Public Worker responses normalize these prefixes without updating stored games or snapshots; browser rendering also handles cached responses. No bulk text replacement, rescore, model-version change or history migration is involved.

## Confirmed examples

| Game | Before | After | Rating |
| --- | --- | --- | --- |
| Cardinals–Cowboys | `Period 5 · 2:53 · Chad Ryland 42 Yd Field Goal` | `OT · 2:53 · Chad Ryland 42 Yd Field Goal` | 95 unchanged |
| Titans–Bengals | `Period 5 · 7:00 · Joe Burrow 9 Yd Rush (Evan McPherson Kick)` | `OT · 7:00 · Joe Burrow 9 Yd Rush (Evan McPherson Kick)` | 79 unchanged |

Raw provider periods, clocks, play order and stored observations are preserved. NFL, CFB, NBA and NCAAM use `OT`, `2OT`, etc.; NHL uses the same overtime sequence with its existing shootout distinction. Regulation label conventions remain unchanged.

## Validation

- 27 new regression tests; 115 focused tests passed.
- Full relevant suite: 972 passed, zero failures/cancellations/skips.
- `test-score.js`, production build and Worker deployment dry run passed.
- Eleven real-input replays across NFL, CFB, NBA, NCAAM and NHL matched the baseline in every field except intended moment text; see `overtime-terminology-comparison.json`.
- Both confirmed games retained identical timeline ratings and geometry (722 and 731 captured points).
- Regression coverage includes multiple overtimes, regulation endings, decimal clocks, NHL shootouts/playoff overtimes, NCAAM format metadata, last-score selection, cached API responses, accessibility markup and preservation of narrative text.

Desktop/mobile visual verification was not completed: Computer Use screenshots did not match the selected Chrome window, so UI interaction was stopped. No visual pass is claimed. Existing layout and responsive CSS are unchanged.

Scoring weights, model version, experiment settings, provider acquisition and history persistence are unchanged. Previously cached descriptions without a recognizable generated period/clock prefix are left untouched rather than guessed.
