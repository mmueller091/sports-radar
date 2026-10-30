# Opt-in CFB context retention and Saturday observation

Started from clean local commit `b28ef9f` (completed NFL allocation and NHL corrections). The new `LIVE_CFB_CONTEXT_POLICY` extends **`LIVE_NHL_ALLOCATION_POLICY`**, retaining its NFL and NHL flags and behavior. It is explicitly selected only by calibration/local capture. Public production defaults and completed scoring are unchanged. No staging, commit, push, deployment or promotion.

## One mechanism

The existing live context contribution decayed *all* non-postseason opening context to 17.1% at R07 and 12.6% at R18, even though comeback feasibility is effectively one. The correction separates ordinary baseline/scarcity from already-supported matchup context **inside that same contribution**:

- `T = max(0, capped opening score - persistent stakes)`.
- `O = min(T, admitted Sport baseline + Schedule scarcity)`.
- `M = max(0, T - O)`; absent opening-factor evidence is treated as ordinary context, with no extra retention.
- `W` is the existing time-decay weight; `V` is the existing CFB context viability (`.15 + .85 × comeback feasibility`).
- Before: `round(T × W × V)`.
- Candidate: `round(O × W × V + M × .38 × V)`.

`.38` is the existing opening-live retention rate, obtained from `contextCarryWeight(0, 'live', 'CFB')`, not a fitted case target. The existing factor remains named **Pregame context carried into play**. Ordinary context still decays with time. Postseason stakes retain their existing separate `.68 × feasibility` rule. Net opening reductions and the pregame cap remain in the basis; individual positive factors are never restored around those reductions. Existing live aggregation runs again against the resulting base, so existing floor headroom can absorb a base increase.

This changes no pregame weight, Current Tension (65/35, ceiling 34), Generic Leverage, margin/WP calculation, possession model, comeback feasibility, trajectory formula, history relevance, recovery protection or history cap. It adds no recovery award or generic floor. No reviewed case ID appears in scoring logic.

## Reviewed evidence and remaining disagreements

| Reviewed checkpoint | NHL-policy baseline | CFB extension |
| --- | ---: | ---: |
| R07 | 45 | 45 |
| R18 | 60 | 61 |
| R08 | 1 | 1 |

Results and full arithmetic are in ignored `work/live-cfb-context-results.json`. R07 has only the ordinary 40-point opening basis, so this correction cannot justify an increase. Its supported state is trailing 24–17, Q3 9:37, third-and-8 at its own 13; feasibility is .999998. Margin closeness is .949999 and home WP .8693. Its Current Tension is 24, Generic Leverage 0, retained event history 4 and signed trajectory −1.888. Base 43 plus those contributions rounds to 45.

R18 is 20–17, Q3 1:06, with **unavailable current possession**. Its opening 44 comprises ordinary 40 plus a four-point Ranked team factor. Margin closeness is .989209, home WP .1885, feasibility .999001, Current Tension 26 and Generic Leverage 3. Event history is already capped at 15; signed trajectory is −1.614. The correction retains supported context without changing that history.

R08 is 38–17 with 1:46 remaining. Feasibility .058621, the −24 runway penalty and zero retained obsolete history keep it an unattractive live recommendation. Low-end calibration and completed comeback ratings remain deferred.

The available correction does **not** establish that R07's 45 matches “would switch, moderate bordering on high.” Eliminating the remaining history discounts would only give 47/62 for R07/R18. Unknown context is not evidence of poor teams. The unresolved low-context discrepancy is a rating-scale question under the fixed shared tension/base/leverage rules; this task does not conceal it in a CFB bonus.

## Hypothetical context, not archive claims

`cfbContextVariants` creates separate R18 inputs. Every variant holds score, clock, possession (unavailable), WP, play sequence and history constant. It clears archived context before supplying each counterfactual:

- Unknown: no supplied rankings, records, spread or stakes.
- Weak/limited: both 2–5, unranked, no supplied spread or stakes. No penalty is invented for absent evidence.
- Strong teams: ranks 8/12, both 6–1, supplied three-point spread. Existing market, ranked-matchup and winning-record factors establish the difference.
- Credible upset: unranked home underdog, away rank 8, supplied home +14 line. Existing live **Underdog threatens upset** supplies the upset contribution; this correction does not add another one.
- Verified stakes: hypothetical `playoff_race`, `verified: true`, confidence 1. This uses the existing five-point context field, not an invented division race or postseason game. The verification flag is part of the hypothetical, not a claim of verified archive evidence.

Full positive and negative opening factors, retained contributions, live components and signed history are recorded for every comparison. No numerical target was fitted.

| Hypothetical R18 condition | Opening basis | Before | Candidate | Existing factors responsible |
| --- | ---: | ---: | ---: | --- |
| Unknown | 40 | 59 | 59 | Ordinary context only; retained 5 |
| Weak teams, limited stakes | 40 | 59 | 59 | Same ordinary context; no invented poor-team penalty |
| Strong teams | 81 | 64 | 75 | Spread +4, winning records +3, two ranked +26, both top 20 +4, top 10 +4; context retained 10 → 21 |
| Credible upset | 46 | 70 | 71 | Spread +1, ranked +4, top 10 +1; context 6 → 7; existing current upset factor +10 unchanged |
| Verified playoff-race stakes | 45 | 62 | 62 | Existing +5 opening factor is classified by the core's persistent-stakes label rule; carries +3 unchanged, ordinary context 5 |

All five retain Current Tension 26, Generic Leverage 3, event history 15 and signed trajectory −1.614; current live bonus is zero. Ranking factors already reflect the existing spread-dependent scaling, explaining why the +14 upset variant has less opening quality context than the three-point strong-team matchup. The existing underdog factor supplies its separate current upset interest only once.

The strong-team result meets the requested mid-70s judgment. **Weak/limited 59 is still below high 60s; credible-upset 71 is still below mid-70s.** Those disagreements remain documented. The unknown and weak variants being numerically equal means lack of quality evidence receives no quality award, not that the archive teams have been judged poor. Verified stakes have no separate numerical target. No further tuning follows this comparison.

## Validation

Before the scoring edit, additional checkpoints were selected and baseline-scored from other games for sustained closeness, defensive play, recovery, false closeness, garbage time and all three regulation quarter boundaries. IDs and pre-edit scores are fixed in `calibration/cfb-context-fixtures.mjs`; the initial observations are also retained in ignored `work/cfb/preselected.json`.

The existing runner's new focused mode is:

```powershell
node scripts/replay-input-comparison.mjs --cfb-context
```

It uses corrected replay reconstruction and authoritative candidate evaluation, checks input immutability, compares all eligible CFB states, and deep-compares every non-CFB output with the NHL baseline (apart from the policy ID). Existing historical artifacts are untouched. An initial in-progress replay was interrupted to fix the zero-rounded context-factor edge case; only one complete replay is used as final evidence. No parameter grid or score retuning was performed.

Focused tests cover inherited NFL/NHL flags, unchanged tension/leverage/history on the reviewed cases, matched hypothetical inputs, signed opening reductions, absent context evidence, context rounding, quarter boundaries, and explicit completed-policy parity. Existing regression tests cover production/default, completed CFB, NFL, NHL and Worker/browser scoring. Capture tests use fixtures and mocked transport, not provider requests.

Final corrected replay: **8,409 CFB checkpoints across 50 games**; 1,877 increased, 6,532 unchanged, none decreased. Mean increased 47.2446 → 47.8907 (+0.6461); equal-game mean increased +0.6312. Maximum observed increase was 11 (event `401856809`, play `401856809692`, 71 → 82). The number at 70+ rose 440 → 681; 80+ rose 229 → 250; exact 99 rose 100 → 107. These distribution changes are observed consequences of retaining supported context, not new human accuracy labels.

| Additional preselected condition | Event:play | State | Before → candidate |
| --- | --- | --- | --- |
| Sustained close | 401866442:401866442642 | 15–15, Q4 11:04 | 70 → 70 |
| Defensive | 401871091:401871091293 | 0–0, Q2 2:00 | 46 → 46 |
| Recovery | 401856724:401856724574 | 17–17, Q4 14:37 | 56 → 58 |
| False closeness | 401866443:401866443723 | 14–21, Q4 0:16 | 61 → 61 |
| Garbage time | 401856720:401856720774 | 31–0, Q4 1:52 | 1 → 1 |
| Q1 end / Q2 first play | 401856719:188 / 192 suffixes | 14–7 | 48/49 → 48/49 |
| Q2 end / Q3 first play | 401856719:411 / 418 suffixes | 14–17 | 61/62 → 62/63 |
| Q3 end / Q4 first play | 401856719:594 / 598 suffixes | 14–24 | 59/59 → 60/61 |

No artificial drop appeared at those boundaries. Controlled equal-elapsed Q1/Q2, Q2/Q3 and Q3/Q4 transitions also give identical ratings and retained weights, with at most one point over the surrounding two seconds. Additional states have no new human score labels; unchanged false-closeness/defensive scores are regression observations, not endorsements.

**15,358 non-CFB checkpoint outputs matched exactly**, apart from policy ID: MLB 776, NBA 1,419, NCAAB 659, NFL 4,560, NHL 7,944. Synthetic early/late checks cover all seven other sports, including Soccer/Tennis, which have no eligible archived games in this replay set. Explicit extension/default-completed checks preserve all 107 archived completed games.

Test results: 12 focused scoring/capture checks, 71 existing compatibility checks and 13 Worker provider-contract checks passed (**96 total**). Syntax checks on all eight changed JavaScript files and tracked/new-file whitespace checks passed. Logs are in `work/cfb/`. The relevant commands were:

```powershell
node --test test/live-cfb-context.test.js test/capture-live-cfb.test.js
node --test test/live-nhl-allocation.test.js test/live-endgame-allocation.test.js test/live-history-relevance.test.js test/shadow-candidate.test.js test/current-tension-calibration.test.js test/scoring-module-parity.test.js test/cfb-completed-calibration.test.js test/cfb-completed-upset.test.js test/detail-live-refresh.test.js
node --test alerts-worker/test/provider-contract.test.js
git -c core.whitespace=cr-at-eol --no-pager diff --check
```

The two added completed/synthetic parity cases were run separately by test-name pattern after the initial ten focused cases; unchanged suites were not repeated.

## Saturday, October 31, 2026: commands

Run from the repository root in PowerShell with Node 22. Unset `RATING_CORE_PATH` if present; this command intentionally uses the repository's scoring source.

One-shot provider smoke test:

```powershell
node scripts/capture-live-cfb.mjs --once --date 20261031
```

Saturday start:

```powershell
node scripts/capture-live-cfb.mjs --date 20261031 --interval-seconds 60
```

Stop with **Ctrl+C** in that terminal. Keep the process running and the computer awake. Nothing is scheduled or installed, and local collection does not run after the process exits. Saturday is observation only; no weights are adjusted automatically.

Inspect the latest ranked recommendations and coverage:

```powershell
node scripts/capture-live-cfb.mjs --latest
```

Output is under ignored `work/live-cfb/<UTC-start-time>-<run-id>/`:

- `run.jsonl`: actual commit, working-tree status, policy definitions and source hashes once, plus shutdown time.
- `raw.jsonl`: timestamped URL, response status/date/cache age and exact response body, including failed attempts.
- `scored.jsonl`: append-only cycle records with per-game inputs/availability, three ratings and factors, coverage and a complete ranked live slate for each policy.
- `work/live-cfb/latest.json`: most recent cycle for inspection. This pointer is refreshed; earlier raw/scored records are never rewritten.

The command reuses both existing ESPN FBS/FCS feed definitions, `summaryUrl`, normalization/enrichment, shared live-snapshot validation, corrected chronological validation and `validateFootballSituation`. There is no second football reconstruction algorithm. It evaluates each distinct discovered live game once per cycle. Both feed coverage and failed/missing game IDs are explicit; feed truncation or unknown event state marks coverage incomplete. Missing summary still permits a visibly incomplete scoreboard-only evaluation; missing score/clock/teams prevents evaluation rather than becoming zero.

To keep every policy on the same observation, summary score/teams/period/clock must agree with the scoreboard. A stale, ahead, conflicting or ambiguous summary is omitted and disclosed; no later request repairs an earlier record. Supported possession requires validated current scrimmage, supported timeout continuity or an explicit pending try. Scoring, kickoff and other transitions do not create an active drive. Historical current-drive endpoint fallback is suppressed locally. Unknown WP, field position and source age remain null. Source age is based on the latest available provider play wallclock; HTTP cache age is recorded separately in raw logs.

The cadence is a configurable **delay after each completed cycle**, default 60 seconds (allowed 30–3600). Requests are sequential, each has a 12-second timeout and at most one retry after 500 ms. Cycles cannot overlap. Ctrl+C aborts pending requests/delay and records shutdown. `--once` exits with code 2 for incomplete coverage; a successful empty slate is code 0.

Actual ESPN smoke requests on October 30 succeeded outside the network-restricted sandbox. The Saturday query returned **47 FBS and 57 FCS scheduled events, zero live events**. The inspection command was tested. This verifies real feed access, but does not claim an actual live-game summary/scoring capture; those paths were tested with fixtures. The earlier sandbox fetch failures remain recorded as incomplete coverage.
