# Production integrity audit — November 1, 2026

Baseline: production commit `359d2b8b65dd03e812a7ee8295eb69b5364c3e77`.
Release model: `2026-11-01.production-integrity.1`.
The implementation was isolated from the original workspace's pre-existing edits.

## Findings and focused changes

- **Football timeline reversals:** The October 31 CFB observations belong to
  the older `2026-11-01.live-evidence.1` model. OKST's 98 was at 0:26;
  23 and 82 were at 0:02. The low observation had an unaccepted summary,
  missing history and an older last play. Miami also had partial summaries
  and provider clock/play revisions (including 0:43 to 0:44). These are not
  proof that every same-clock change was invalid. The current Chiefs 66/73
  observations used the same score, clock, possession/down and timeout play:
  66 had incomplete input, whereas 73 had an accepted summary.
- **Current root cause:** Full team metadata in compact scoring plays could
  exceed the existing 24 KB evidence limit and discard the entire history.
  Even available historical evidence did not preserve all verified current
  inputs during a missing/shortened response. Compact team IDs now fit the
  history cache. A bounded 120-second cache retains inputs only for the same
  event, teams, scores, clock, possession, down, distance, timeouts and play.
  It never averages ratings or carries current win probability to a changed
  game state. Known older plays/large unsupported backward clocks are
  reconciled before scoring and excluded from snapshot writes. Corroborated
  score corrections, small clock corrections and genuine new plays survive.
- **History/final integrity:** Persisted ratings are not an input to final
  competitiveness scoring. Invalid provider scoring totals are excluded
  from final history bonuses. Existing live history is not deleted or
  re-rated: incomplete observations and clock/model boundaries are marked,
  and incomparable segments are not drawn as measured excitement changes.
- **Live to final:** Celtics +58 and Notre Dame +47 were changes from live
  watchability to retrospective whole-game scoring. Final ratings keep the
  intended methodology and appear as separate assessments, without spike
  labels or a connecting live-rating rise.
- **Decisive plays:** A completed-game ledger must reconcile to the result.
  A decisive score must establish the permanent lead late in a close game
  or overtime. Notre Dame's 1:08 three-pointer replaces Villanova's 0:00
  layup. Jacksonville's Q3 touchdown in the 42–7 result is “Last score.”
  A genuine 0:00 winning field goal and the Cardinals' overtime winner
  remain decisive.
- **Explanations:** Early NHL two-goal deficits get proportionate language.
  Late football multi-possession gaps take priority over historical drama.
  Verified Arizona facts include the 14-point comeback, Gardner Minshew II
  replacing Jacoby Brissett, and Chad Ryland's missed late PAT followed by
  his winning overtime field goal. Quarterback extraction requires this
  event's recap and matching passing-box-score names. No new API or LLM calls.
- **Period scores:** Denver's stale period total of 19 is reconstructed as
  21 (fourth period 8) only when complete scoring progression proves the
  touchdown/conversion. Otherwise inconsistent splits are withheld and
  marked pending. Player statistics are never fabricated.

## Before/after evidence

All nine complete-input ratings are unchanged: OKST–ISU 89, Miami–UNC 80,
Chiefs–Broncos 65, Notre Dame–Villanova 65, Colts–Jaguars 1, Celtics–Magic 67,
Patriots–Dolphins 55, Oilers–Rangers 21, Cardinals–Cowboys 95.
These are the captured input states, not necessarily the reported anomaly clocks.

| Reconstructed matching state | Before, then missing summary | After, then missing summary |
|---|---:|---:|
| OKST–ISU, 0:02 | 82 → 20 | 82 → 82 |
| Miami–UNC, 0:44 | 70 → 37 | 70 → 70 |
| Chiefs–Broncos, 8:55 | 66 → 64 | 66 → 66 |
| Patriots–Dolphins, 2:49 | 42 → 44 | 42 → 42 |

These reconstructions are bounded by captured plays, not original raw summaries
from every historic poll. Exact old ratings cannot be recreated reliably.
See [machine-readable comparison](production-integrity-comparison.json) and
[fixture provenance](../test/fixtures/production-integrity/README.md).

The actual Patriots rating 44 at 24–13, 2:49 included 13 historical points:
lead changes 3, comeback 6 and win-probability swing 4. Those events were
supported, and retained evidence was about 41 seconds old. This is not evidence
to change weights. Whether those bonuses should decay faster in a late
two-possession game remains a subjective calibration question.

## Validation

- Full Node suite: **931 passed, zero failed/cancelled**.
- `node test-score.js`, calibration report, production site build and Worker
  dry run passed. No scoring weights or experimental-feature switches changed.
- NFL, CFB, NHL, NBA and NCAAM coverage includes score corrections, possession
  changes, turnovers, delayed conversions, overtime, defensive excitement,
  blowouts, incomplete inputs and live-to-final transitions.
- Automated Game Center, mobile/keyboard interaction and timeline tests pass.
  Interactive visual inspection was blocked when Computer Use could not
  verify Chrome's current URL. Desktop/mobile visual appearance is therefore
  not certified by this run.

Deployment receipts and actual public endpoint/asset checks are recorded after
release in the local deployment verification artifact.
