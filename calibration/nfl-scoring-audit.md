# NFL live/final scoring audit — October 26, 2026

Implemented locally; no deployment. Public scoring API keys and function arities,
the core orchestration, other sport models, and completed NFL formulas are preserved.

## Changed files

- `scoring/sports/nfl.js`: NFL state calibration and overtime possession-rights model.
- `scoring/shared/football.js`: NFL-gated directional situation, timeout runway,
  tied drives, fourth downs, pending tries, and conservative live stagnation.
- `test/helpers/nfl-calibration.cjs`: reproducible A–P fixtures and score aggregation.
- `test/nfl-calibration.test.js`: ordering, provider fallbacks, browser equivalence,
  overtime, tries, stagnation and final-path regressions.
- `test/scoring-module-parity.test.js`: isolate intentionally changed NFL live
  outputs; retain archived parity for other sports, NFL pregame/final ratings,
  histories without live stagnation, and all 107 archived enriched provider games.
  Every synthetic NFL output still matches between Node and the browser VM.
- `test/late-football-drive.test.js`: unknown NFL OT rights receive modest leverage;
  retain CFB's original expectation.
- `test/completed-football-stagnation.test.js`: assert smaller NFL live penalty;
  retain unchanged CFB live and completed expectations.
- `test/live-score-regressions.test.js`: supply current competition context when
  verifying a refreshed NFL state score.
- `test-score.js`: update only the intentional early NFL fourth-down score assertion.
- `scripts/nfl-calibration-report.cjs`: print the before/after matrix.
- `calibration/nfl-scoring-audit.md`: this report.

## Formulas and scope

All behavioral changes are NFL-only. The timeout readers live in the shared
football module, but CFB never activates the new runway estimate. CFB's state,
situation, live history, and final formulas remain identical to the archived core.

**State watchability.** In a known one-score Q4 state, the closeness ceiling gains
up to `12 × urgency × direction`. Urgency ramps from zero at 10 minutes to one at
2 minutes. Direction is 1 for a tied/trailing offense, `0.4 × comebackFeasibility`
for a leading offense, and 0.2 for unknown possession. This calibrates the existing
closeness component rather than adding an independent momentum factor. Known
decisive OT possessions use full urgency. Invalid margins, early progress,
expired regulation clocks and unverified OT rights do not receive this increase.

**Timeout runway.** With the leader possessing the ball in the final 3 minutes,
valid opposing timeout counts and downs replace the generic remaining-possession
estimate. Let `snaps = 4 − down`, `stops = timeouts + warningAvailable`, and
`drain = 6 × snaps + 40 × max(0, snaps − stops)`. Estimated return time is
`max(0, seconds − drain − 8)`. Expected possessions are zero with no return time,
otherwise `min(1.4, 0.25 + returnTime/100)`. The existing logistic comeback
feasibility, closeness, runway penalty, stakes retention and upset threat consume
that estimate. No flat timeout excitement award is added. Missing/invalid counts,
unknown possession or downs preserve the previous estimate.

**Situation.** Replace generic late and two-minute additions with directional
leverage: trailing/tied 4, leading 2, unknown 1, and leader able to drain the clock
0. These are floors inside the existing 12-point situation cap. Extend the existing
`decisiveDrive` compatibility field to tied possessions. Regulation drive urgency
ramps from zero at 4 minutes to one at 2 minutes. Position adds up to 3 to the
drive estimate; FG-capable drives recognize the opponent 42, while TD drives need
more territory. The existing competitive floor remains capped at 20 and replaces,
rather than adds to, overlapping situation/probability leverage. WP itself is unchanged.

**Fourth downs.** Early downs receive 1–3; blowout fourth downs receive 1. A late
one-score tying/winning drive receives 7–11 based on clock and territory, with
the final meaningful fourth down at the high end. Short distance affects modest
early leverage; the consequence of failure dominates late. All remain inside
the situation cap, including red-zone and decisive-drive overlap.

**Pending tries.** Only explicit `situation.isTwoPointAttempt === true` activates
try modeling. A late offense down 1, 2, 9 or 10 receives the 12-point situation
cap and existing 20-point competitive floor: lead, tie, or stay within one
possession. Early and leading-team routine tries do not get a major award.
Last-play touchdown/try text never establishes a pending try.

**Overtime.** Completed, attributable OT offensive drives establish which teams
have had opportunities. Both completed opportunities plus a tie establish
sudden death; an opponent's completed opportunity can establish a winning
second possession before sudden death. Distinguish FG wins from FG ties, TD/try
wins, and a TD plus two that only ties an eight-point deficit. Historical seasons
explicitly identifying regular season before 2025 or postseason before 2022
retain opening-TD win eligibility. Unknown season uses the modern conservative
two-opportunity interpretation. Period number alone provides only modest leverage.
Rules reference: [NFL Football Operations, Rule 16](https://operations.nfl.com/the-rules/nfl-rulebook).
The modern regular season grants both possession opportunities subject to its
10-minute limit; playoff OT continues until a winner.

**Live stagnation.** NFL-only, zero before 65% progress, ramps to full weight by
85%, and caps at 10. Reuse scoring-versus-total, yards/play, punt rate, third-down,
red-zone opportunity/conversion and touchdown evidence. Require at least three
independent signals; no-TD and low-score observations cannot supply two of the
three required signals. Current incomplete drives do not count as empty drives.
Defensive action multiplies the index by `1 − min(1, action/12)`, allowing complete
erasure. Count turnovers, sacks, actual fourth-down stops, blocks, safeties,
defensive TDs and explosives. Ignore overturned/no-play events. Use the maximum
of play-feed and boxscore action estimates to avoid counting the same action
twice. Completed-game thresholds and penalties are unchanged.

## Calibration matrix

Synthetic archetypes, not purported historical boxscores. Common setup: two 6–3
division opponents; no WP series or accumulated game drama except the listed
stagnation/defensive evidence; M has championship stakes. These scores are
context-dependent, not universal target values. I and J deliberately share a
9–6 scoreboard to isolate defensive action. Scores include summary history.

| Case | State | Before | After |
| --- | --- | ---: | ---: |
| A | Three-point game, Q2 | 53 | 53 |
| B | Three-point game, 4:00 Q4 | 55 | 64 |
| C | Down five, own ball at own 25, 1:30 | 66 | 77 |
| D | Down five, opponent first down, 1:30, zero TO | 49 | 40 |
| E | Same as D, three TO | 49 | 52 |
| F | Tied, own ball at opponent 35, 1:00 | 59 | 85 |
| G | Up three, own ball, opponent three TO, 2:30 | 51 | 56 |
| H | Up three, own ball, opponent zero TO, 1:20 | 50 | 42 |
| I | Low scoring with defensive action, 4:00 | 55 | 64 |
| J | Same score, empty punt-fest, 4:00 | 55 | 55 |
| K | +14 underdog trailing three, ball late | 79 | 90 |
| L | +14 underdog trailing ten, ball late | 39 | 39 |
| M | Tied championship sudden-death OT | 76 | 99 |
| N | Q1 fourth-and-one at midfield | 57 | 56 |
| O | Final meaningful fourth down, down five | 69 | 80 |
| P | Critical two-point try to tie | 70 | 81 |

J's unchanged net score reflects a stronger late competitive state offset by a
9-point stagnation penalty. I receives zero stagnation penalty. K/L's upset
components remain 9/3; no underdog qualification threshold changed.

Reproduce: `node scripts/nfl-calibration-report.cjs`.

## Provider fields and evidence limits

- Authoritative scoreboard: `status.period`, `status.displayClock`,
  `competitors[].team.id`, `.homeAway`, `.score`, `situation.possession`, `.down`,
  `.distance`, `.possessionText`, `.downDistanceText`, `.isRedZone`, `.isGoalToGo`.
- Optional timeout inputs: `situation.homeTimeouts` / `.awayTimeouts`, falling back
  to the corresponding `competitors[].timeouts`. Only integer 0–3 counts qualify;
  text is never used. Archived NFL fixtures are completed games without remaining
  timeout fields, so these optional input shapes are validated synthetically,
  not claimed as verified coverage of a live ESPN timeout feed.
- Optional pending-try contract: `situation.isTwoPointAttempt`. No archived
  fixture contains a reliable pending-try indicator; feeds without it preserve
  ordinary score/clock/field-position leverage. No adapter or text inference added.
- OT: `summary.drives.previous[].team.id`, `.start.period.number`, `.result`,
  `.isCurrent`, and `.plays[].period.number`, `.start.team.id`, `.type.text`/`.text`;
  `summary.header.season.year/type` or `competition.season.year/type`. These drive
  structures are present in the captured provider data. `format.overtime.periods`
  is format metadata and is deliberately ignored as possession-rights evidence.
- Stagnation: existing summary odds/total, team statistics, punting player totals,
  completed drives, scoring plays and play descriptions/yards. Optional aggregate
  action statistics supplement incomplete play feeds conservatively.

Unsupported: exact running/stopped-clock reconstruction, runoff penalties,
onside-kick opportunity accounting, precise kicker range/weather, and incomplete
OT drives/possession exchanges not attributable to a team. The regular-season
OT first-drive clock-expiration win exception is not predicted from a running
clock; unknown rights retain modest leverage. No current-timeout counts are
reconstructed from historical timeout events.

## Deliberate non-additions and final audit

No separate first-down streak or yards-gained momentum bonus: current field
position already raises decisive-possession leverage as an offense progresses
from its own 20 to the opponent 30. No separate OT, timeout, FG-range, fourth-down
or try points stack on top of the competitive cap. No flat low-score penalty.
Market upset and `Ended unbeaten start` remain separate factors.

Final margin, lead changes, comebacks, sustained competitiveness, WP swings,
decisive scoring and defensive finishes, overtime, upset, unbeaten-start results
and completed stagnation retain their existing formulas. A new synthetic
21-point comeback ending with a six-point OT margin verifies that its path
adds at least 15 history points versus an ordinary game with the same margin,
and exactly matches the archived history engine. Existing Colts–Broncos 2022
stagnation calibration and defensive-finish/unbeaten-start regressions remain.

## Validation

Baseline: 233 of 234 passed in the sandbox; the sole failure was esbuild's blocked
directory access. The unchanged Worker compatibility test passed with that
access, establishing all 234 baseline tests passing.

After each major change, relevant NFL/football and parity suites were run.
Final commands: `node --test test/*.test.js alerts-worker/test/*.test.js`,
`node test-score.js`, and `node scripts/nfl-calibration-report.cjs`.
Final result: **241 passed, 0 failed, 0 skipped**. Both standalone groups passed:
`Score model fixtures passed` and `Watchlist and timeline fixtures passed`.
The reproducible matrix matches the table above. `git diff --check` passed.
Local logs are in ignored `work/nfl-scoring-audit/`.
No API, module graph, browser loading, Worker bundling, or other-sport compatibility
assertion was weakened. No deployment or service-worker version change performed.
