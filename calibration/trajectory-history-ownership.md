# Phase 3.1 live-history ownership audit

This is a code-path audit, not a claim that the archive establishes real-world accuracy. Production scoring, completed scoring and the implicit Phase 2 default retain their original behavior. Only an explicit `liveOwnership` experimental policy replaces sustained history. The existing Phase 3 policies remain comparison baselines.

## Call path and sport coverage

`alerts-worker/src/game-model.js:enrichGame` calls `rating-core.js:momentumImpact`, stores `momentumPoints` and appends history factors. The browser and Worker share this core. The shadow scorer previously reused those points and added trajectory after the live and history caps. Phase 3.1 re-enters the same history calculation with explicit ownership options, instead of subtracting an already-capped factor.

| Sport | History calculation | Competitive margin / comeback threshold | Shared history cap (live / completed) |
| --- | --- | --- | --- |
| NFL | `shared/history.js:historyImpact`, football stagnation hook | 7 points | 15 / 25; stagnation applied afterward |
| CFB | Same engine; completed CFB hook remains untouched | 10 points | 15 / 25; completed result adjustments separate |
| NBA | Shared engine plus `basketballLeadChanges`, `basketballLateTies` | 10 points | 15 / 25; basketball drama bucket 15 |
| NCAAB | Same basketball hooks | 10 points | 15 / 25; basketball drama bucket 15 |
| MLB | Shared engine | 3 runs | 15 / 25 |
| NHL | `sports/nhl.js:hockeyHistory` | Complete one-goal scoring ledger; multi-goal comeback >=2 | 12 / 32 plus live regulation/OT/shootout headroom |
| Soccer | Shared engine | 2 goals | 15 / 25 |
| Tennis | Shared engine | 2 sets | 15 / 25 |

## Contributions and owners

Caps below describe raw factor caps before the aggregate history cap unless otherwise specified. A retained event can gain room after a sustained factor is removed; that is a recalculation, not new evidence.

| Source function | Factor / signal | Activation | Cap | Phase 3.1 owner |
| --- | --- | --- | --- | --- |
| `historyImpact` | Sustained competitive game | >=3 score moments, progress >=.4, >=55% time within sport threshold | Live 3; completed 5/7 | Replace **live** factor before caps; trajectory owns sustained history |
| `hockeyHistory` | Time tied or within one goal | Complete single-goal ledger, >=24 elapsed minutes; weighted tied/within-one duration | Live 3; completed 8 | Replace **live** factor before all NHL caps; trajectory owns sustained history |
| `historyImpact` | Competitive throughout / for much of game | Completed only, >=8 WP samples, mean uncertainty >=.58 / .45 | 6 / 4 | Completed scoring unchanged |
| `historyImpact` | High late uncertainty | Completed only, final-quartile WP uncertainty >=.65 | 5 | Completed scoring unchanged |
| `historyImpact` | Lead changes (non-basketball; NHL custom below) | Recorded sign reversals, with live recency weighting 1/2/3 | Live 7; completed 9 | Existing discrete-event history |
| `historyImpact` | Erased a large deficit | Recorded deficit >=sport threshold subsequently tied/overcome | 8 | Existing comeback history; no trajectory revival supplement |
| `historyImpact` | Recent late lead change | Non-basketball flip at >=.65, age <=.16 progress | 5 | Existing discrete event |
| `historyImpact` | Recent unanswered scoring run | Live, >=2 scores, run >=threshold, latest age <=.1 | 4 | Existing discrete event |
| `historyImpact` | Repeated swings in control | >=2 alternations across .35/.65 WP control bands and <2 score lead changes | 7 | Existing provider-supported reversal evidence |
| `historyImpact` | Big win-chance swing | >=.20 movement within <=10 samples | Live 7; completed 9 | Existing provider-supported event; no revival supplement |
| `basketballLeadChanges` | Second-half / late lead changes | Flips after halfway; weights .5/1.5/3/4 by phase | Live 10; completed 12 | Existing basketball event bucket |
| `basketballLeadChanges` | Late back-and-forth lead changes | >=2 flips in recent late 12.5% window | 7 | Existing basketball event bucket; not sustained duration |
| `basketballLateTies` | Late tie(s) | Recorded ties >=.75; stronger at >=.95 | 3 or 4 | Existing basketball event bucket |
| `historyImpact` | Decisive final score | Completed only; last score >=.94 changes winner within threshold | 8 | Completed scoring unchanged |
| `hockeyHistory` | Late tying / go-ahead goal | Regulation last five minutes and live age <=180 sec | 9 / 10 | Existing NHL event history; prioritized before trajectory in same caps |
| `hockeyHistory` | Goalie-pull comeback | Recent late tying goal with explicit extra-attacker evidence | 3 | Existing NHL event history |
| `hockeyHistory` | Erased multi-goal deficit | Recorded deficit >=2 subsequently tied/overcome | 10 | Existing NHL comeback history |
| `hockeyHistory` | Lead changes | Recorded sign reversals | 9 | Existing NHL event history |
| `footballStagnationImpact` via `historyImpact` | Offensive stagnation | Live NFL after .65 with multiple independent efficiency/drive signals; completed NFL/CFB separately | Live penalty up to 10, outside positive history cap | Existing sport-specific offensive-quality logic, unchanged; not a closeness-duration reward |
| `eventShockFor` and sport hooks | Defensive/blocked-kick TD, safety, turnover, grand slam, shorthanded goal, basketball/soccer extraordinary events | Provider-supported event text; recency decays over <=7 plays and <=3 minutes | Combined 12, then live aggregation cap | Existing current-event/Peak Drama logic unchanged |
| `liveSnapshot`, sport `situation` and `pressure` hooks | Current danger, tying/winning possession, manpower, current pressure | Sport-specific current evidence | Existing sport floors and aggregation | Current urgency; never replaced as historical continuity |
| `candidateComponents` | Current Tension / Generic Leverage | Existing Phase 2 margin modifier and progress ramp | 34 / 8 | Current state; unchanged, not sustained-history ownership |
| `trajectoryAdjustment` | Sustained quality | Evidence maturity .25-.75; observed WP confidence or explicitly labelled margin fallback | Positive 10 before shared history cap | Trajectory exclusively owns live sustained history when opted in |
| `trajectoryAdjustment` | Reduced genuine quality, false-close and dominance | Existing coverage-weighted telemetry, with margin fallback dominance | Net negative cap 8 | Trajectory; correlated channels disclosed by contribution ablations |
| `trajectoryAdjustment` | Late revival | Existing concentration * recency * non-sustained quality | Old maximum 3; revised award 0 | Diagnostics only; recovery stays with event/comeback owners |

There is no separate live time-uncertain reward in the shared legacy history engine. Its uncertainty-duration factors are completed-only. The live WP control/swing factors are discrete reversal evidence. Current one-sided probability and sport runway penalties remain in current-state scoring; they were not mistaken for removable history.

## Cap and floor semantics

The generic sustained factor occurs before WP reversal factors. Removing it can release capacity to those later factors, so `old momentum - displayed sustained points` is not equivalent to recalculation. A regression demonstrates this with preserved comeback and WP swing awards. Revised positive trajectory is appended after existing event factors and then participates in the same 15-point cap and existing basketball event bucket calculation.

NHL preserves event priority, its 12-point history cap and then its original headroom allocation: quiet tied regular-season regulation at <=15 seconds can allow zero; genuinely fresh event sequences permit up to five; regular-season OT allows `94 - current OT target`; shootout allows two. The revised award enters before these operations. No new universal final-rating ceiling is imposed on unrelated extraordinary-play or milestone awards.

Sport `competitiveFloor` and aggregate `driveFloor` fields are **increments above the candidate base**. NHL also publishes `competitiveTarget`, an absolute target from which the increment was calculated. Protection therefore uses `candidate base + existing floor increment`, never interprets the increment as an absolute rating, and never introduces a universal 85/90 target. Live/positive-event aggregation stays unchanged. Only the additional trajectory penalty is tapered and prevented from undermining the sport-owned floor.

The ordinary competitive-situation cap (20) normalizes existing floor evidence for the taper. Existing drive/final-possession urgency can also provide strength. Negative influence declines smoothly to 25% at full strength, with floor protection afterward. Positive support from a fully validated decisive state is at least half the positive history gate, subject to the same history budget; it does not add standalone WP or generic late points.

## Required pre-existing dependencies

These changes predate Phase 3.1 but are required by this experimental checkpoint. They are preserved, not reset or labelled unrelated:

| Files | Required role |
| --- | --- |
| `scoring/shared/pressure.js`, `rating-core.js` | Existing `aggregateLiveBonus` extraction and production caller provide the exact aggregation and incremental floor diagnostics reused by shadow |
| `scoring/shared/basketball.js` | Existing `candidatePoints` / `genericTimePoints` split prevents Phase 2 from duplicating generic late closeness inside sport situations |
| `scoring/shared/probability.js`, `scoring/shared/trajectory.js` | Existing NHL elapsed play-clock correction positions score and WP telemetry consistently with chronological replay |
| `calibration/shadow-candidate.cjs` | Phase 2 default, explicit Phase 3 finalization, shared preparation and batched scoring; Phase 3.1 extends only explicit policy dispatch |
| `scripts/shadow-candidate-report.mjs` | Causal checkpoint reconstruction, prepared evaluations, mutation checks and prior batched trajectory support |
| `calibration/trajectory-policy.cjs`, `trajectory-archetypes.mjs` and existing Phase 3 reports/tests | Retained immutable experimental baselines and telemetry semantics |
| `test/trajectory.test.js`, `test/live-phase.test.js` | Existing NHL chronology and phase-label regression expectations |

Phase 3.1 adds opt-in hooks to `shared/history.js` and `sports/nhl.js`; default and completed calls never activate them. Frozen pre-task shadow orchestration plus production/browser/Worker parity tests validate the boundary. The frozen oracle uses current shared helpers on their default path, while production archive parity independently checks those helpers' ordinary scoring behavior.

No policy is promoted. Internal WP-gap representation and correlated quality/false-close/dominance penalties remain explicit limitations for future labelled calibration.
