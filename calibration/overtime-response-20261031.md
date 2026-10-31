# Overtime response handoff

The public history for Kansas State–Colorado (`401856846`) records 99 at 21–21
in the first overtime, 60 after Kansas State's field goal made it 24–21, and 99
again after Colorado's response possession appeared. The prior model required
an identified possession before adding college overtime leverage. Missing or
stale possession between series therefore removed that leverage.

The regression fixture preserves the captured first overtime drive and score
history. Its handoff situation is reconstructed from the verified field-goal
play and its end state; the subsequent Colorado situation is from the captured
scoreboard. The reconstructed handoff now stays at 99 with an accepted summary,
including when possession is missing or still identifies Kansas State.

`footballOvertimeResponse` verifies the first completed series, a tied starting
score, matching current totals and terminal scoring play, and remaining response
rights. Duplicate copies of the same drive are counted once. CFB and NFL use
this evidence during the handoff; historical NFL opening-touchdown endings do
not acquire a response opportunity. CFB also preserves its ordinary overtime
floor when possession data is temporarily missing, without asserting confirmed
response rights. An accepted completed response removes that protection.

The new tests cover the 24–21 handoff, ordinary Colorado response plays, delayed
summaries, failed responses, stale or conflicting evidence, duplicate drives,
NFL opening scores and historical rules, and browser/Worker parity. All seven
new regressions pass; the other 82 football and transition checks passed. The
site build passes. Release model: `2026-10-31.football-live-state.1`.
