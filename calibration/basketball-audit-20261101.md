# Basketball state reconciliation and fan explanations

Model: `2026-11-01.basketball-state.1`. Baseline: `56761353fdd0b49059cf3a1fb89f3c315218ee91`.

## Confirmed findings

The production history confirms Notre Dame–Villanova at 70–68 changing 58 → 70 → 68 at 0:47, then 58 at 0:48. At 0:24 it records 57 → 67. These are preserved observations, not rewritten points. Original per-poll ESPN bodies were not retained, so exact attribution of every observation to a particular missing field is impossible. The frozen scorer and controlled omissions reproduce the central 68/58 and 67/57 failures.

The underlying defects were separate:

1. **Partial history replaced established history.** The old cache treated a nonempty plays/WP response as fresh history even if an independent array was missing or shortened. Probability history, lead changes and comeback evidence could disappear independently. Cached probability observations also lost their play anchors when compressed.
2. **The protection expired past facts.** Historical carryover expired after two minutes and rejected a backward clock. A legitimate one-second clock correction therefore broke retention. Newly normalized scoreboards did not carry the previous authoritative basketball state into the validator. The acquisition-exception path could publish the newly normalized rating without restoring history.
3. **One bad section discarded every section.** A detail response containing a scoring play ahead of its header failed the ledger check and removed all history. The captured detail feed contains this contradiction: its header says 74–70 while its last plays say 74–72. Basketball sequence numbers also disagree with the clock at several older substitutions. They cannot be used to sort the whole game.
4. **Game Center mixed resource versions.** Its header used the primary feed while period splits and box-score totals used the independently refreshed summary. Flagging the summary stale did not reconcile those visible totals.
5. **The endgame and upset model missed relevant evidence.** College basketball used the shared 34-point current-tension ceiling. Generic late basketball points had been removed from the live situation award, leaving little distinct pressure for a one-possession finish without an explicitly supplied final-possession holder. The underdog detector had a hard eight-point spread threshold, excluding the verified 7.5-point underdog entirely.
6. **The opening model had no event context.** The observed 37 was exactly 32 baseline + 3 scarcity + 2 spread. The news eligibility filter excluded unranked college games. The schedule itself already contained a named neutral-site event in Rome and two 0–0 regular-season records; those verified facts were unused.

There is no separate browser scoring formula causing the reported sequence: the archived timeline records Worker model versions. The browser renders the central feed, and bundle/Worker parity is checked separately. The failures were in input ownership, retention and calibration.

## Changes

Basketball now keeps a bounded ledger keyed by event identity. Independent play, scoring, probability and player-point fields merge separately; duplicate events do not add points. Clock/period order owns historical chronology, with wall time and sequence breaking ties. A delayed earlier scoreboard event cannot roll back scores or clocks. Small clock corrections are accepted; larger backward corrections need newer event evidence. A score correction needs corroborating details or a newer event, and replaces affected evidence rather than clearing unrelated earlier history.

Past comeback and lead-change facts persist through omissions and subsequent advances. Their rating contribution is still recalculated using the current score, runway, history caps and relevance. A current probability survives omission only for the same verified observation, including a small clock correction. A new possession, foul, timeout or play invalidates that current estimate. Optional play metadata does not count as a new game event. Explicit corrected player totals replace previous totals; missing player blocks preserve verified milestones.

The current basketball evidence remains in the existing feed storage, is omitted from long-term snapshots and public API bodies, and has hard size/event bounds. Feed parts also have a 1 MB UTF-8 bound to protect D1 rows on busy slates. No tables, migrations, polling changes, AI requests, paid APIs or recurring services were added.

Game Center reconciles header, period sums and team totals to the same canonical game. Incompatible period splits are withheld. Actual player statistics remain unchanged and receive a catching-up notice when totals lag. Recorded timeline observations retain their original scores and model versions; future observations use the repaired state.

College-only calibration smoothly raises current-tension capacity from 34 toward 44 during the final five minutes, reaching full urgency in the final two. The extra effect fades beyond one possession and remains subject to the existing feasibility curve. Up to five situation points reward a viable close finish inside the existing 12-point situation limit. Closing spreads now activate upset credit smoothly between four and ten points, rather than jumping at eight. Live-history caps, sport feasibility, aggregate safeguards, the 1–99 scale and the 90-point pregame ceiling remain in place. NBA calibration and other sports are unchanged.

General schedule rules add three points for two confirmed season-opening records and four for a named neutral-site international showcase. This game would open at 44 using its original line. An existing observed 37 baseline remains an observation; it is never retrospectively relabeled 44. The code contains no Notre Dame/Villanova IDs, names or event-specific bonus.

## Replay results

Reconstructed prefixes at the reported states, with independent missing/shortened-detail variations:

| State, Notre Dame–Villanova | Old accepted / missing | New accepted / missing / shortened |
| --- | ---: | ---: |
| 70–68, 0:47 | 68 / 58 | 85 / 85 / 85 |
| 70–68, 0:48 | 68 / 58 | 85 / 85 / 85 |
| 70–68, 0:24 | 67 / 57 | 82 / 82 / 82 |
| 0:47 → 0:48 clock correction | retention could fail | 85 → 85 |
| Pregame with original spread | 37 | 44 |

The recorded 70 observation is not claimed as an exact replay; not every contemporaneous input was archived. These reconstructions isolate the missing-data defect and show the combined state/calibration result.

The causal replay also covers 45 eligible late Notre Dame–Villanova states, 17 Iowa–Illinois states, one Boston–Detroit state and 15 Philadelphia–New York states. Every accepted state matches its immediate missing-detail replay. Purdue–Arizona and Oklahoma City–San Antonio had no eligible close final-three-minute state and are explicitly reported as zero-state controls, not counted as successful close-game replays. Detailed scores, factors, exclusions and state lists are in [the numerical report](output/basketball-audit-20261101.json).

Controlled comparisons distinguish ordinary closeness from the comeback/upset example:

| Control | Before | After |
| --- | ---: | ---: |
| Ordinary early two-point college game | 43 | 43 |
| Ordinary final-minute two-point college game | 58 | 72 |
| Late college blowout | 1 | 1 |
| NBA two-point game | 59 | 59 |

## Public explanations

The default explanation was rewritten across NFL, CFB, NBA, NCAAB, MLB, NHL, Soccer and Tennis, in all three phases. It selects meaningful facts and normally produces two or three sentences. It does not print raw factor labels, fractional contributions, implementation language or a repeated rating. Exact factors and the live bonus remain in a collapsed **Scoring details** section.

Before: “Both winning records (+11.62); Listed 3-point spread; projected competitiveness raises excitement (+6)…”

After: “Both Baltimore Ravens and Cincinnati Bengals have winning records. Oddsmakers expect a close contest with a 3-point spread.”

Before, live: fragments such as “1 late lead change”, “Erased a large deficit” and “Big win-chance swing”.

After: “Notre Dame Fighting Irish has erased a 10-point deficit and taken the lead. Notre Dame Fighting Irish leads Villanova Wildcats 70–68 late in the game. With less than a minute remaining, every possession could decide the game.”

The observed scoreboard briefly showed an 11-point deficit. The later complete play ledger and the provider's largest-lead team statistic both say 10; the explanation follows those corrected details. It does not perpetuate an unsupported number.

For an expected mismatch: “San Francisco is favored by 10 points, so a one-sided game is a real possibility.” It describes an expectation, not a guaranteed outcome.

The season-opening Rome setting is independently confirmed by [Notre Dame's official men's preview](https://fightingirish.com/news/2026/10/29/1-irish-vs-wildcats-this-sunday-in-the-eternal-city-tip-off) and [the Big East's event preview](https://www.bigeast.com/news/2026/10/31/villanova-set-to-tip-off-2026-27-mens-basketball-season-in-rome.aspx). [Villanova's official preview](https://villanova.com/news/2026/10/30/mens-basketball-wildcats-begin-preparations-to-face-notre-dame.aspx) confirms the former Big East matchup and first meeting since 2016. Those broader facts are documented here; the recurring model uses facts supplied by the existing schedule/context pipeline and does not infer a rivalry from names or location.

## Validation and reproduction

- Full root/Worker suite: **855 passed, zero failed/skipped**. The added competitor-possession regression also passes; the final basketball/explanation/storage group passes **46 tests**. The storage partition regression and 25 existing refresh checks pass separately as well.
- `node test-score.js`: both score-model and watchlist/timeline fixture groups pass. Its obsolete NFL numeric anchors were reconciled with the frozen, already-deployed November 1 model; old explanation expectations were replaced with factual fan-language assertions. No NFL calculation changed.
- Site build, syntax and whitespace checks pass. Worker deployment dry run succeeds with the existing D1 and AI bindings.
- Desktop (1440 px) and mobile (390 px) Chrome checks pass: matching scores, readable default copy, collapsed scoring details, working expansion, no page errors or horizontal overflow. Browser-bundle and Worker ratings/factors agree.
- Initial checkout-only failures were resolved by restoring original Git blob line endings and importing the existing local historical checkpoint object needed by the replay provenance test. No golden artifacts or historical assertions were weakened.

Commands: `node scripts/basketball-audit-report.mjs`, `node scripts/build-site.mjs`, `node --test --test-concurrency=1 test/*.test.js alerts-worker/test/*.test.js`, `node test-score.js`, and `node scripts/verify-basketball-release.mjs` (add `--production` for the live release). Compressed source captures, source URLs, hashes and the frozen baseline scorer are in `test/fixtures/basketball-audit/`. Local execution logs and screenshots are in ignored `work/basketball/`.
