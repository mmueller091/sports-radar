SlateMeter pregame upgrade — Phase 1B research and cost review

Implemented on isolated branch `pregame/phase1b-research` from production `31f3eb26`. No deployment, production writes or new model inference occurred during this work. Root Phase 1 narrative changes are on a separate branch.

Selection now reads the existing canonical cached feed, including partitioned feeds, instead of fetching another narrow set of scoreboards. Upcoming identified games may enter a seven-day window. Twenty slots are guaranteed by descending published rating, with start time only breaking ties; remaining slots protect sport representation and rotate the oldest unresearched candidates. Eligibility remains bounded to supported sports and NFL, ranked, postseason or rating-at-least-47 games. Missing, stale or incomplete feeds fail closed. This selects all six highest-rated Saturday CFB games from Tuesday, at both noon and night.

Within each selected game, exact event matches, matching teams and supported material context outrank simple recency. The first article for each game is allocated before second articles. Explicitly mismatched event tags, recap/preview URLs and existing verification failures are rejected. For games more than 42 hours away, transient return/absence/debut/streak/starter stories require an explicit matching event tag, avoiding accidental reuse of tonight's availability for a later matchup.

| Bound | Limit |
|---|---:|
| Games per research pass | 30 |
| Articles per game / total | 4 / 60 |
| Editorial discovery items | 8 |
| Provider requests per pass | At most 6 league-news requests |
| AI requests per pass | At most 3 existing calls |
| Daily conservative AI reservations | 8,000 neurons |
| Input bytes / output token ceiling | 24,000 / 1,200 |

No extra scoreboard requests are made. The same Cloudflare cache options remain on news reads. At most one compact diagnostics upsert is added per pass, plus cached-feed/prior-diagnostics/context reads; no new table or recurring prose job is introduced. Increasing the candidate horizon can make more passes reach the existing caps, so unchanged caps do not mean identical historical usage. Selection uses published scores without rerating; score logic, alert delivery and live scheduling are unchanged. New research findings can legitimately change future context inputs under the existing scoring policy.

**Why three saved factors produced zero upcoming links.** [The retained trace](research-trace.json) runs actual `contextsForGames`, `upcomingLinkedStories` and `publicStorySentence` against frozen production evidence. Research status reports the 18:17:42 UTC pass (15 candidates, 17 articles, three factors). The current Worker version was deployed at 18:31:45 UTC, afterward. The status describes the previous release's stored discoveries, not links that survived the current read/display gates.

| Latest saved factor | Disposition under current checks |
|---|---|
| Nashville trade headline / `major_trade_storyline` | Legacy headline-only row lacks evidence supporting the stored type under the current deterministic type gate. This is a classification/evidence rejection, not a declaration that the transaction is false. |
| Detroit–Florida recap / `former_star_return` | Recap from a different event, attached to upcoming Detroit–Tampa Bay; no supported former-star-return evidence. |
| UCLA–Arizona recap / `rivalry` | Unrelated recap attached to Manhattan–Kentucky; no supported rivalry evidence. |

All 13 retained rows were traced. Six refer to upcoming games and all six are rejected at context read, so none were silently lost between accepted context and display. The other three upcoming rows comprise two generic streak previews and an unrelated Coby White return stored as a season debut. Those also fail current evidence checks; preview URLs would additionally fail the public link selector. The seven remaining rows concern games that are not upcoming in this captured feed. The tests preserve these rejections.

Diagnostics now distinguish `savedFactors`, `readAccepted`, `eligiblePublicLinks` and `gamesWithEligibleLinks`, together with selection/source freshness, request limits and actual returned AI usage. Link eligibility is before public deduplication and the three-story display cap, and is scoped to the selected research games; it is not a claim that the latest assembled feed already displays those links. Health only exposes diagnostics from the matching research run. Diagnostics failures cannot fail a successful research run or feed availability.

**Verification.** All 262 Worker tests pass (252 existing plus ten allocation/trace regressions). The Worker dry run bundles successfully without deployment. Tests cover Saturday priority, sport coverage, rotation, seven-day bounds, partial/stale caches, relevant older articles, transient future-event evidence, request/item bounds, actual usage/missing-usage behavior, public suppressions and the complete frozen production trace. Existing budget, factual-integrity, alert, provider and live-refresh tests remain intact.

**Optional prose AI: leave disabled.** The retained production experiment `alerts-worker/test/fixtures/editorial-model-20261103.json` contains two real existing model responses: 547 input/208 output tokens with 12.9714074666 neurons, and 441 input/423 output tokens with 17.1284115287 neurons. Combined usage is 30.0998189952 neurons. These are existing editorial classification/review calls, not a new prose quality or cost benchmark. This task made zero inference calls. The new instrumentation records actual returned tokens/neurons for the existing calls and marks missing usage unknown, including failures; it does not refund reservations or invent zero cost.

Read-only D1 reservations for Oct 28–Nov 3 were 3,673, 3,475, 5,873, 6,738, 5,393, 3,266 and 4,011 neurons respectively; Nov 3 was partial. Reservations are conservative budget accounting, not actual billed usage or account-wide consumption. At the largest observed reservation day, 1,262 remained within the 8,000 ceiling. A maximum-size request reserves 610, so only two additional maximum-size calls would fit that day's observed headroom. Existing research after the capture can still consume that headroom.

Cloudflare currently provides 10,000 neurons/day free, resets at UTC midnight, and charges paid accounts $0.011 per 1,000 neurons above that allowance. The existing model lists $0.152/million input tokens and $0.287/million output tokens. These prices do not establish available account-wide headroom. Sources checked 2026-11-03: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [the model page](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/).

A future bounded prose trial should use only the normalized validated facts, return evidence IDs for every factual clause, reject unsupported claims, and key its cache by event, semantic fact hash, prompt version and model version. Observed timestamps alone must not trigger generation. Invalidate on a meaningful fact change or evidence expiry; never reuse stale availability. Generate asynchronously, keep deterministic prose on any rejection/error/quota miss, and never await it in feed or scoring. Measure actual usage and quality under the expanded allocation before approving any recurring rollout. No such recurring prose generator has been enabled or represented as cost-verified here.
