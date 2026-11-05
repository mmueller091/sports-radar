# Verified storyline significance correction

Status: **local correction; deployment held**. Required desktop/mobile browser inspection was interrupted by Computer Use's unsupported Windows browser URL-policy enforcement. No site, scoring Worker, audit Worker, D1 source cache or historical rating has been published or changed remotely by this task.

The isolated branch starts at deployed main `227981d6a30ebc8477fb2ebcca0cea4429399f80`. The original dirty workspace is untouched. The independent audit Worker's deployed source is restored from `65b4b72` (production version `57430fdb-e64a-4cae-a2d1-8914c4ce21cb`) before extending it; that Worker was absent from main. Its existing schema, schedule, findings and retention behavior remain intact.

## Root causes and complete path

1. League/team news discovers articles; the bounded source pass retains official documents. `source-evidence.js` validates publisher identity, subject, team, game date, expiration and corroboration, but previously made every accepted fact `scoringEligible:true`.
2. Starter language overrode more specific categories. `confirmed_key_starters` carried +4 in the shared configuration. A verified coach announcement therefore increased excitement without evidence of positive significance.
3. D1's category key and several in-memory maps collapsed all events in a category; UI deduplication instead relied on text/URL, leaving differently worded reports of the same announcement separate. Shared category is neither event identity nor a valid deduplication rule.
4. The Worker serialized context and scored factors, but neutral context was not separately represented in the explanation. `pregameExplanation` excluded linked stories, while `storylineDetails` could hide their source links when the outlook included them.
5. Injury evidence treated a `QB` label alone as proof of starting-quarterback importance. Non-football absence factors lacked the existing football market reconciliation safeguard.

## Corrected policy

Verification, game relevance and factual publication remain separate from numeric eligibility. A deterministic shared significance gate runs in source research and both scorers. It neither invents player quality nor accepts an AI classification as evidence.

| Category | Treatment |
| --- | --- |
| Confirmed starters, lineups, pitchers, goalies; forced replacements | Zero by default, across all six sports |
| Injury return without established player significance | Retained as neutral `player_injury_return`; a QB role alone does not establish starter quality |
| Star injury returns | Positive only with explicit significant-player/starting-role evidence; existing NFL importance tiers remain |
| Rookie/season debut | Draft status or novelty alone earns zero; an explicitly significant debut can retain the specific category |
| Former player/captain and coach returns | Require a first reunion with the former team; player significance/captaincy must be explicit |
| Trades and departures | No automatic lift; a significant first appearance with the new club must be established |
| Ace pitching matchup | Both significant opposing pitchers must be established |
| Hot, historic and team streaks; notable performances | Poor form, losing streaks and slumps cannot create positive credit; existing source-specific evidence gates remain |
| Rivalry, meaningful/playoff/championship rematch, milestone chase, playoff race | Retain existing verified categories, sport-specific caps and reviewed CFB evidence |
| Efficiency and schedule strength | Retain explicit quantitative evidence requirements and existing sport policy |
| Star absences | Require affected-team and player-importance evidence. An updated/undated displayed market yields no additional penalty; only a proven newer underdog absence can receive the bounded −2 adjustment. Missing market data does not create player-quality assumptions. Multiple-star penalties require multiple verified significant players. |

Distinct events can share a category in a bounded D1 envelope without a schema migration. Same-event reports consolidate by subject, owner and event identity and retain source links and verification status. A single-source link is not upgraded to independent corroboration. Contradictory/newer availability still fails closed or supersedes older evidence.

## Ravens–Jaguars

Frozen feed: **November 4, 2026, 8:23:43 p.m. Eastern** (`2026-11-05T01:23:43.284Z`). Game: NFL `401873037`, November 5.

| Component | Before | Candidate |
| --- | ---: | ---: |
| Displayed rating | 44 | 40 |
| Unrounded pregame total | 43.99 | 39.99 |
| Generic starter confirmation | +4 | 0 |
| Additional injury penalty | 0 | 0 |
| All other scoring components | Unchanged | Unchanged |

The displayed line is Jacksonville −10. The captured market moved from Baltimore −4.5 to Baltimore +10. That movement is not proof of a particular causal announcement timestamp, so no additional injury penalty is justified.

The candidate outlook states that Baltimore turns to Joe Fagnano following injuries to Lamar Jackson and Tyler Huntley, alongside the records and Jacksonville's heavy-favorite status. It does not claim both quarterbacks are on injured reserve. The retained official evidence establishes injuries and the start; the broader reserve-status claim was not independently established by that evidence.

The team transcript and ESPN announcement consolidate into one storyline, with both links preserved. An additional official injury-context article supplies the explanatory detail and a third link. Production release must retain that verified document in the existing source cache (without replacing concurrent documents), or wait for the normal budgeted research pass to acquire it; no cache write has been performed here.

Sources: [official starter announcement](https://www.baltimoreravens.com/news/transcript-press-conferences-11-3-26), [official injury context](https://www.baltimoreravens.com/news/joe-fagnano-ravens-quarterbacks-practice-report-tyler-huntley), [ESPN announcement](https://www.espn.com/nfl/story/_/id/50371730/rookie-joe-fagnano-start-thursday-night-vs-jaguars).

## Frozen six-sport audit

`replay.json` lists every frozen game, both ratings, raw adjustment and exact removed factor. This is a context-component counterfactual for the full feed; the Ravens game additionally has a full scorer replay from cached provider inputs. These methods are identified separately rather than claiming every published score was reconstructed from complete provider inputs.

| Sport | Upcoming | Live | Completed | Rating changes |
| --- | ---: | ---: | ---: | --- |
| NFL | 15 | 0 | 14 | Ravens–Jaguars −4 only |
| CFB | 119 | 3 | 2 | None |
| NHL | 50 | 2 | 11 | None |
| MLB | 0 | 0 | 1 | None; current pregame coverage is unavailable |
| NBA | 55 | 8 | 0 | None |
| NCAAM (`NCAAB` internally) | 7 | 19 | 0 | None |

The other ten frozen games are Soccer and unchanged. Separate historical full-model replay covers 107 completed games: NFL 25, CFB 50, NHL 25, MLB 2, NBA 3 and NCAAM 2. All scores and factors match deployed main. The report also includes evenly sampled chronological live checkpoints, explicitly distinguished from recorded historical ratings. Synthetic tests cover ordinary starter confirmations and positive/negative personnel controls in every supported sport, including MLB's inactive pregame slate.

## Permanent audit and preservation

The existing three-minute monitor checks the already-read canonical feed and writes only its existing audit tables. It flags generic starter bonuses, adverse positive personnel context, unsupported significance, duplicate event awards, injury/market overlap, missing explanation context and positive excitement language about neutral facts. Definite scoring defects and human-review cases are separate. Pregame games never enter live calibration cohorts. On-demand quality reports and exports retain the same distinction.

Provider limit remains six and AI limit remains three; neither limit nor allocation code changes. The audit makes zero provider/AI requests and sends zero notifications. No experiment is enabled. Notification code, thresholds and model-transition deduplication are unchanged; upcoming games are excluded and a new model's first live observation establishes a baseline. Existing observed historical ratings remain untouched.

No logo, branding, CSS, typography, score color, possession display, record display, down/distance, arrow, statistic, or Game Center statistics code changes are included.

## Reproduction and release gates

Final automated verification: **2,092 passing tests** (application 1,600; scoring Worker 367; independent audit Worker 125), with no failures, skips or cancellations. The focused 24-case storyline suite is included in the application total. `node test-score.js` also passed its model, watchlist and timeline fixtures. Both Workers completed Wrangler deployment dry runs; neither command published anything. `git diff --check` passed.

The full-model comparison found **zero score or factor differences across 107 completed games and 2,140 sampled chronological checkpoints**. The 316-game frozen feed's context-component comparison changes only Ravens–Jaguars, by exactly four points. The candidate has **zero remaining qualitative findings on this frozen feed**; this does not claim that a new production audit scan has passed.

Last observed production identifiers before this work: scoring Worker `a55aacdc-93c7-413c-a0f3-5f06b0f2d620`, model `2026-11-04.cfb-context.1`; independent audit Worker `57430fdb-e64a-4cae-a2d1-8914c4ce21cb`. Candidate model: `2026-11-04.storyline-significance.1`. There is **no new deployment identifier** and no confirmation that slatemeter.app serves this correction.

Computer Use returned: “Computer Use has been stopped for this turn because browser URL policy enforcement is not yet supported for the current Windows browser.” No further UI actions were attempted. Actual desktop/mobile visual inspection and post-deployment verification remain incomplete.

Run `node scripts/build-site.mjs`, `node scripts/storyline-significance-report.mjs`, the complete `node --test --test-concurrency=4 test/*.test.js` suite, and corresponding Worker/audit suites. Wrangler deployment dry runs use the existing Worker configurations.

Before publication: inspect the actual Game Center at desktop and mobile widths; verify all three source links; rerun changed-input checks if production main or context changes; preserve the official context document in the current cache; commit/push through the existing GitHub Pages workflow; deploy the scoring and audit Workers; independently verify model version, production feed, public outlook, source links, and an audit scan. Browser verification is a mandatory unresolved release gate, not waived by passing offline tests.
