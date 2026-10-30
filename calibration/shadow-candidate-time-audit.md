# Shadow candidate time/progress redundancy audit

The shadow policy has exactly one standalone positive generic time award:
`Generic Leverage` in `calibration/shadow-candidate.cjs`. The production/default
path is unchanged.

| Candidate dependency | Classification | Candidate behavior and overlap finding |
| --- | --- | --- |
| `candidateComponents()` smoothstep after 55% | 1. Generic leverage | The only generic positive time award. It is capped at 8 and multiplied by Current Tension. |
| Football/CFB clock runway, possession estimates, timeouts and comeback feasibility | 2. Sport-specific situation/runway | Feeds margin closeness, uncertainty ceilings, wide/runway penalties, and actual decisive-drive logic. Production `closeCeiling` inflation is ignored by the candidate. |
| MLB inning/half, outs, count and runners | 2. Sport-specific situation/runway | Inning time matters only with baseball state (remaining at-bats, runners, outs, count, decisive plate appearances). |
| NHL remaining clock, power play, pulled goalie, dangerous chances and milestone recency | 2. Sport-specific situation/runway | Time qualifies hockey-specific runway or on-ice action. The early NHL `liveFloor` is retained as opening-context decay, not a generic late lift. |
| NBA/NCAAB possessions, regulation clock, possession direction, fouls/final possession and overtime | 2. Sport-specific situation/runway | Final-possession and overtime logic remains. The plain “close game late” situation award is tagged by the shared engine and removed in the candidate as duplicate generic time credit. |
| Soccer halves/stoppage time with cards, aggregate score, shootouts or pressure | 2. Sport-specific situation/runway | Time only modifies soccer-specific match conditions. |
| Tennis set depth with match/set/break point, tiebreak, deuce or deciding set | 2. Sport-specific situation/runway | Time only modifies a verified tennis point/set situation. |
| Sport-owned competitive floors for decisive drives/possessions | 2. Sport-specific situation/runway | Preserved because they require possession, field position, down/distance, score rights, or equivalent sport information. The CFB production midgame close-game floor is excluded because it was a second generic time/close award. |
| `contextCarryWeight`, retained postseason viability and NHL opening-score retention | 3. Context decay | Existing opening-context fade is unchanged. It can only retain/fade pregame information; it is not a standalone lateness award. |
| Margin curves, comeback feasibility, `widePenalty`, limited runway and stagnation | 4. Blowout/comeback feasibility | Progress/clock can reduce Current Tension or subtract points when the margin is no longer realistically recoverable. |
| Upset activation/realization | 5. Something else: unchanged upset logic | Progress scales an identified underdog threat, not generic game quality. Required to remain unchanged in this phase. |
| Momentum/history, milestones, pressure and event-shock age | 5. Something else: verified action/history | Time positions and recency qualify actual events. They do not award points merely because the game clock is late. |
| Current-WP freshness validation | 5. Something else: telemetry validity | Progress is used to reject stale/mismatched estimates. Candidate WP points are always zero after validation. |
| Trajectory fields (`competitiveShare`, `uncertaintyShare`, `dominantShare`, `marginContinuity`, `genuineContinuity`, `lateMovementShare`, `lastCompetitivePosition`) | 5. Something else: telemetry only | Reported for diagnosis and never read by candidate scoring. |
| Summary chronology checks and phase/status display text | 5. Something else: data validity/display | Used to reject regressed summaries or label the state; no candidate points. |

Remaining overlap to watch during calibration:

- Sport situation engines necessarily use clock/period together with sport facts.
  Football decisive drives, basketball final possessions, baseball late-inning
  runner states, soccer stoppage-time conditions, and tennis match points can
  therefore rise at the same time as Generic Leverage. This is intentional:
  each requires information beyond generic lateness.
- Upset realization and action/history awards may correlate with late progress,
  but their predicates are independent facts and were explicitly held constant
  for this phase.
- Sport-specific margin curves can make Current Tension fall with shrinking
  comeback runway. They do not provide an additional positive generic time lift.
