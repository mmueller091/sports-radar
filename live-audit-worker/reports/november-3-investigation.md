# November 3, 2026 scoring-quality investigation

This investigation reads retained production observations. It does not replay a different scoring model, change ratings, or assert an objective excitement score. All wall-clock examples below use UTC to match stored timestamps; the slate is November 3 in America/New_York.

## Source identity and baseline

The active audit source was located at `C:/Users/mmuel/Documents/Codex/2026-11-03/slatemeter-audit-release`, commit `e3c6a6353eca2f7c97175cde799bbf3db8a67f61`, audit version `2026-11-03.quality.1`. The initially supplied October 21 checkout contains an older audit implementation. It is not the source to deploy.

Read-only Cloudflare deployment records identify audit Worker `slatemeter-live-audit`, version `89bf5142-f359-4d73-a9cd-8f7ae77dde36`, deployed at `2026-11-04T03:29:41.648Z`. Production Worker `sports-radar-alerts` was version `0bcf9648-7078-4ce5-b6ff-7f756789341a`, with an annotation identifying approved source `40f9de3a1e5a53f1340720183337a966e8acb119`. Its scoring model is `2026-11-03.live-underdog.1`. The previous model `2026-11-02.clock-integrity.2` also appears on this slate.

The protected export captured at `2026-11-04T12:35:07.844Z` matches the user's baseline: 27 games, 1,256 observations, 223 successful scheduled runs, seven heuristic findings, zero confirmed deterministic integrity failures, and 43 game/model evidence-gap groups. There were 194 distinct scans carrying these games. The games were 2 CFB, 5 NCAAM, 11 NHL and 9 hidden soccer games. NFL, NBA, MLB and Grand Slam tennis have no observed games on this slate. Model cohorts comprise 942 old-model and 314 new-model observations; combining them into one calibrated distribution is not justified.

Full originals are retained locally in ignored `work/audit-upgrade-20261104/before-findings.json`, `before-export.zip`, and `d1-retained.json`. The checked-in `test/fixtures/november-3-observed.json` preserves 17 exact audit observations, 17 selected production snapshot projections, and relevant cached play snippets across six games. It includes SHA-256 hashes of the originals, capture times, projection provenance and timestamp limitations. These are observed production checkpoints, not fabricated regression scenarios.

## Complete pipeline and timestamp meanings

1. `alerts-worker/src/game-model.js` constructs canonical games and preserves source competition in a non-enumerable property. `alerts-worker/src/sports-feed.js` reads providers through its existing cache/refresh controls and invokes `scoring/live-runtime.cjs`.
2. The production scoring entry imports the established `rating-core.js` chronology logic, `calibration/shadow-candidate.cjs` candidate selected as production, sport models, and `calibration/trajectory-live-policy.cjs`. `scoring/live-runtime.cjs:129` assigns score, base, live components, factors, `historyOwnership`, `trajectoryScoring`, model version and evidence quality.
3. `scoring/live-evidence.cjs:32` classifies score-progression evidence. Its `complete` means the scoring ledger reconciles; its separate `coverage.eventStream` may still be `not-established`. It does not certify complete possession, manpower, point-state or event-publication evidence.
4. `alerts-worker/src/sports-feed.js:2283` sets `feed.updatedAt` from the refresh's supplied `now`, before snapshot writes and publication. `sports_snapshots.observed_at` is that refresh-start value floored to 15 seconds for live games, 60 seconds for pregame, or the unfloored refresh start for completed games. It is not the provider's event time, provider publication time, or exact canonical publication time. `sports_resources.updated_at` is cache acquisition/version metadata, also not provider publication.
5. `sports_snapshots.normalized_state` stores most canonical scoring telemetry, while deliberately excluding bulky retained event arrays. `publishFeed` at `sports-feed.js:2017` generates exact score-calculation ledgers in the canonical feed header's `scoreCalculations` map. Those WeakMap-derived ledgers are not automatically present in historical normalized snapshots.
6. The separate audit Worker reads `sports_feed`, `sports_feed_parts`, cached `sports_resources`, and retained `sports_snapshots`. It schedules one scan every three minutes. It persists existing `live_audit_runs`, `live_audit_observations`, `live_audit_findings`, and `live_audit_events` rows in the same D1 database. It does not invoke production scoring or fetch a provider.
7. In the baseline, `index.js` compacted the canonical game but dropped `liveRawSituation`, evidence status/reasons/coverage, `historyOwnership` and `trajectoryScoring`; `qualityEvidence` was separately captured only after deployment. The export's `compactSnapshot` discarded additional retained evidence. The source data existed but was not fully exposed to audit analysis.
8. `/quality` builds the same scoring-quality analysis used by the ZIP. `/export` adds it to `findings.json` and `summary.md`. Dashboard access and these endpoints use the existing bearer/session authentication. Games are grouped by original New York slate date, including after-midnight finishes.

## Why structured evidence was sparse

All 57 observations with structured quality evidence occur at or after `2026-11-04T03:30:55.919Z`, the first scan after the quality release. There are **zero legacy observations after that boundary**. Most of the apparent coverage loss is historical collection before the feature was deployed, not intermittent loss of the new field.

Those 57 contain 24 producer `complete`, 31 `partial`, and 2 `invalid` statuses; they cover 28 CFB and 29 NHL observations. The baseline presentation should not call 24 observations fully complete merely because their score ledgers reconcile. Legacy absence must remain distinct from invalid source data.

The bounded retained D1 capture recovered 6,340 snapshots for the same 27 games: 3,490 score-progression complete, 2,798 partial, 5 invalid, and 47 with no such status. Snapshot column model versions agree with their embedded game model in every row where an embedded version exists (zero mismatches). This is evidence available for investigation, not permission to relabel a nearby snapshot as the exact earlier canonical observation. Matching must require game, model, state, score, clock, rating and compatible provenance.

## Winnipeg–Montreal: explain the changes before proposing calibration

Game key: `NHL:401892634`; model for these examples: `2026-11-03.live-underdog.1`.

| Situation | Audit rating | Retained mechanism |
| --- | ---: | --- |
| 0–4, 4:32 in third | 1 | Base is clamped at 1; wide-margin penalty −14; no live bonus; signed trajectory penalty remains negative. A power play alone does not restore a four-goal game's competitiveness. |
| 2–4, 1:57 | 11 | Base 15; live bonus 0; trajectory −3.636. No pulled-goalie or power-play support is recorded for this state. |
| 3–4, 0:59 | 88 | Base 53; live bonus 35. A one-goal deficit restores Current Tension (31) and Generic Leverage (7); wide penalty disappears. Pulled goalie and trailing pressure set competitive target 87 plus 1 retained context point. |
| 4–4, 0:31 | 87 | Base 56 plus live bonus 30.950. The matching snapshot is partial: `ledger-behind-scoreboard`, recovery absent, no comeback history credit. |
| Same 4–4, 0:31, next retained snapshot | 92 | Complete scoring ledger; deepest deficit 4, recovered 4, four scoring events. History recognition is present. |
| 4–4 in overtime | 95 | Tied sudden-death target 89 plus retained six-point event-history allowance, with small signed trajectory adjustment. |
| 5–4, End of OT | 59 | Provider still labels the game live, but the sudden-death result is decided; competitive target falls to zero. This is a resolved-state observation, not proof that an earlier live game was underrated. |

The partial tied snapshot is `sports_snapshots: NHL:401892634@1793760870000`; complete same-score/clock snapshot is `@1793760900000`. These refresh-start buckets are 30 seconds apart. That establishes observed recovery between retained checkpoints, not exact provider or scoring latency. The three-minute audit sampled 87 and skipped the 92 checkpoint.

The history budget is materially relevant. At complete 4–4/0:31, raw factors were Late tying goal 9 and Erased a multi-goal deficit 10. Shared headroom was 6.3149944444. The ordered allocation retained 6.3149944444 for the tying goal and zero incremental erased-deficit credit. In overtime, six points of erased-deficit credit remained after the recent-tying component expired. Thus the model did recognize the four-goal recovery; whether sharing that budget adequately distinguishes extraordinary recovery from an ordinary tying goal remains a legitimate **calibration hypothesis**, not a verified defect.

Production sources: `scoring/sports/nhl.js:14` margin/runway curve, `:284` situation targets, `:415` state modifiers, `:563` history, `:627` comeback factors, `:635` history cap, `:648` endgame headroom; `scoring/shared/pressure.js:7` floor/cap aggregation; `calibration/shadow-candidate.cjs:341` NHL allocation and `:382` final aggregation. The 77-point sampled jump includes real scoring, clock movement, a goalie pull, pressure and different floor branches. An experiment must isolate these inputs rather than attributing all 77 points to one goal or one modifier.

Recommended bounded replay: compare frozen same-model states at two-goal/one-goal/tied margins, 120/60/30 seconds, with and without verified extra attacker, recent pressure, ordinary tie and four-goal recovery. Evaluate small changes in the viability curve and shared history ordering independently. Require unchanged behavior in settled blowouts, ordinary ties and shootouts before any separate scoring proposal. No target replacement score is defensible from this game alone.

## Dallas–Washington: a three-minute sampling artifact

Game key `NHL:401892640`. The audit observed 82 with 1:02 remaining and next observed 87 with 0:07. It therefore first observed 85+ at seven seconds. Retained snapshots establish an earlier **recorded** crossing: `@1793759805000`, rating **88 at 1:02**, with complete score-progression evidence, pulled goalie and two recent trailing chances. The preceding `@1793759790000` was 82 at the same 1:02 with `summary-unavailable`.

Later snapshots include 87 at 0:59, 83 and 84 at 0:07, then 87 at 0:07. This was not one continuously verified threshold episode. The sparse audit missed both the earlier crossing and intervening dips. The conclusion that production first became actionable with seven seconds left is unsupported. Snapshot evidence supports a recorded crossing at 62 seconds; exact real-world crossing, publication, delivery, and viewer availability remain unknown. Threshold usefulness should report both audit and retained-snapshot provenance and observation uncertainty.

## Carolina–Nashville: unmatched peer comparison

Game key `NHL:401892642`. `SIMILAR_STATE_OUTLIER` compared rating 61 with median 88 from seven distinct games in `late:close`. The bucket had no actual clock distinction, pregame-quality match, recent-event match, manpower match or model-version constraint. Early-third 2–1 play is not equivalent to a final-minute one-goal opportunity. The old comparison is **insufficient evidence** for underrating. Retain its raw finding for historical provenance; do not carry its confidence forward into current recommendations without rematching the underlying observations.

## Edmonton–New Jersey: shootout score namespaces

Game key `NHL:401892636`. The original audit retained `scoreRollbacks:1` but did not store the before/after play identities, so it alone could not distinguish a provider correction from a shootout representation.

The already cached summary has play `401892636000004600`, End of OT, period 4, scores 3–3, wallclock `03:10:05Z`, followed by `401892636000004650`, Start of Shootout, period 5, scores away 1/home 2, wallclock `03:11:03Z`. These are shootout totals, not decreasing regulation goals. A shootout boundary must be separately represented, while decreases within regulation remain detectable.

The captured summary was acquired later and carries provider modification time `07:26Z`. It establishes the retained provider's shootout representation, not that the exact earlier revision was identical. Classification: **expected representation supported by retained evidence; original-revision limitation disclosed**. Do not globally suppress NHL rollbacks or unverified corrections. Explicit corrections should remain traceable, and shootout detection must use verified phase/period context.

## Two NHL clock warnings and stale source findings

Vegas–Pittsburgh (`NHL:401892639`) and Colorado–Columbus (`NHL:401892641`) had `TIMELINE_CLOCK_ORDER` findings. NHL scoreboard clocks count down, while the retained ESPN play clocks count up. For example, Vegas play `...7720` at 5:21 is followed by `...7840` at 6:52; wallclock also advances exactly 91 seconds. Colorado play `...4030` at 0:17 is followed by `...00280` at 2:04 with wallclock advancing 106 seconds. Increasing elapsed game time is ordinary forward play. The baseline rule treated it as a rollback. These later cache revisions support a clock-semantics explanation; the original audit-time pairs were not retained, so no claim is made that every original pair has been reconstructed. Preserve checks for backward elapsed time, clock corrections and sequence-order conflicts.

St. Louis–Rangers and Anaheim–Vancouver each have recovered `GAME_SOURCE_STALE` findings with `detailStale:true`. These affected observed active games and remain valid data-quality warnings. `SOURCE_ERRORS` was also recovered; its 31 retained events include 18 opens and 13 recoveries, with some error lists truncated to twelve URLs. Many listed requests concern NFL, NBA or future NHL games absent from this slate. Their mere presence cannot establish harm to current live games. Historical truncation prevents exhaustive attribution; classify known active-game, known inactive/future-game, recovered and unresolved-scope failures separately without inventing missing request outcomes.

## Evidence limits and useful next work

No provider publication timestamp, exact canonical commit timestamp, complete provider arrival history or notification delivery log is present. Final cached summaries can improve retrospective event identity and wallclock knowledge but cannot prove when those events became available to the live scorer. Event response should use observed before/after brackets with explicit uncertainty, negative or positive expected directions based on game context, and simultaneous-event confounding. An unchanged or falling rating is not universally a failure after a scoring play.

The strongest remaining scoring investigations are the one-/two-goal viability and floor interaction, temporary loss or lag of scorer inputs, and whether the shared endgame history allowance differentiates very large recovery from an ordinary tie. The current single-night sample cannot establish historical rarity, an appropriate target rating, cross-sport equivalence at 85, or optimal notification thresholds. Multi-night same-model peer samples, retained event identities, and reliable state-aligned input telemetry are required for stronger calibration recommendations.

## Investigation cost

The one-off bounded D1 evidence capture made 122 Cloudflare API calls (including read-only deployment/schedule/settings checks), read 12,745 D1 rows, wrote zero rows, and recorded 2,289.8 ms summed D1 query duration. Responses totaled 109,566,592 bytes; the local artifact is 109,655,136 bytes. It captured 6,340 snapshots and 11 existing NHL summary resources. These are measured investigation costs, not recurring audit costs or invoice predictions. There were zero sports-provider/AI calls and no scheduled scans added by this investigation.
