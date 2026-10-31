# NHL statistics and pressure audit — October 31, 2026

Historical local audit. See the [statistics release record](nhl-statistics-release.md) for the current production baseline, release checks and explicitly waived visual-verification gate. The experimental scoring described here remains disabled.

Implemented locally for review. Production scoring remains unchanged. The experimental component defaults off, is absent from the production browser scoring dependency graph, and has not been deployed or published.

The baseline is this checkout's active policy, `live-owned-45-95-relevant-history-cfb-context`, model `2026-10-30.cfb-context.1`, loaded through [live-runtime.cjs](../scoring/live-runtime.cjs). Despite its filename, `calibration/shadow-candidate.cjs` is now part of that production dependency graph. Comparing against `rating-core.js` alone would use the wrong live model.

## Existing modifiers

Here `p` means normalized regulation progress, `g` the absolute goal margin, and `m` the NHL margin/runway closeness. Sources and coefficients below describe existing code; none were edited for this work.

| Area | Existing behavior | Location |
| --- | --- | --- |
| Shots and dangerous chances | Non-scoring shots on goal, saves, breakaways, penalty shots, posts/crossbars, close-range and point-blank descriptions in the previous 90 game seconds. If clocks cannot be resolved, falls back to the last 18 records. Activity is `min(7, .8 * dangerous + min(3, 1.2 * premium))`; trailing-side share scales it by `.45 + 1.1 * share` when direction is known. Leverage is `(.3 + .7*p) * m`; rounded result is capped at 7. Disabled above two goals. Standalone saves reverse defending-team ownership. | `scoring/sports/nhl.js`: `hockeyPressure` |
| Shots inside situation targets | Regulation competitive targets also receive `round(hockeyPressure / 2)`, capped at target 96. The same recent events can therefore influence both a component and the target. | `hockeySituationImpact` |
| Goal margin and remaining runway | Ties have closeness 1, one-goal margins .9. Larger deficits decay continuously with margin and progress. Trailing goalie removal adds .22 runway; trailing PP adds .23, combined maximum .45. A smooth third-period two-goal runway term preserves a recoverable two-goal game without lifting larger deficits. | `nhlLiveMarginCloseness` |
| Margin penalty | `round(20*p*(1-m)*min(1,max(0,g-1)/4))`, plus up to 3 for a two-goal deficit over the last two minutes, smoothly reaching full strength by the last minute. One-goal comeback viability has an .82 minimum. | `hockeyGameState` |
| Current win probability | A current valid estimate modifies margin closeness: `m * (.65 + .35*uncertainty)`, where `uncertainty = 1-2*abs(homeWP-.5)`. Missing WP falls back to margin. Current Tension awards up to 34 points. | `calibration/shadow-candidate.cjs`: `candidateComponents` |
| Time leverage | Generic Leverage adds up to 8, multiplied by current closeness, with a smooth urgency ramp from progress .55 to .95. It replaces the older generic close/time awards rather than stacking them. | `candidateComponents`, `candidateStateRating` |
| Direct WP bonus, legacy only | `winProbabilityImpact` can produce -8 through +16 from uncertainty and progress, rejecting completed, score-inconsistent and stale observations. The active policy sets the separate probability component to zero. WP still affects Current Tension and positioned trajectory history; it is not merely unused telemetry. | `scoring/shared/probability.js`; `candidateLiveSnapshot` |
| Third-period ties | Active allocation targets at 20:00 / 12:00 / 10:00 / 5:00 / 2:00 / 1:00 / 0:00 are 52 / 62 / 68 / 78 / 83 / 85 / 87, with smooth interpolation. | `hockeySituationImpact` |
| Third-period one-goal games | Corresponding active targets are 52 / 60 / 64 / 72 / 78 / 80 / 82. The old non-allocation thresholds remain in legacy code but are not the active policy. | `hockeySituationImpact` |
| Power plays | Uses current `summary.onIce` plus goalie roster groups. Counts skaters rather than mistaking a pulled goalie for a penalty. Trailing-team PP can raise late targets to 82 (84 in the tie expression); a two-skater advantage can reach 89. Target changes ramp smoothly from period start toward their late-game limits. Situation support is typically trailing PP 5, tied PP 4, leading PP 1, scaled by margin viability. | `hockeyOnIceState`, `hockeySituationImpact` |
| Goalie pulled | Only a trailing-side pull buys comeback runway/late targets: up to 85, or 91 with a PP. Two-goal extra-manpower comeback targets are 46, or 55 with pull plus PP, smoothly ramped. Separate pulled-goalie support is 3 if a trailing PP has not already selected the stronger 5-point branch. | Same functions |
| Overtime and shootout | Active regular OT tied target smoothly moves 88 to 90; shootout target 90. Playoff OT starts at 95, increases 2 per extra period up to 98, with deciding-game/Final context and deciding Final target 99. Regulation postseason target adjustments are +2 or +5 for the Final, capped at 96. Normalized structured period and season metadata distinguish 5-minute regular OT, 20-minute playoff OT, and shootouts. | `hockeyOvertime`, `hockeyLiveTiming`, `hockeySituationImpact` |
| Early opening-score floor | Retains the capped opening rating strongly through ten minutes, then fades to zero by 40 minutes. Larger margins remove protection rapidly. No separate new shot bonus is involved. | `nhlModel.liveFloor` |
| Context/stakes and time | NHL ordinary context retention anchors are .40 / .34 / .27 / .21 / .13 / .08 / .06 over progress 0 / .25 / .5 / .67 / .82 / .93 / 1, with existing viability. Persistent postseason stakes receive a separate `.68 * comebackViability` weight. | `nhlModel.contextAnchors`; `rating-core.js`: `stateRating` |
| Goal momentum/history | Late tie +6 or +9 inside the last two minutes; late go-ahead +7 or +10; goalie-pull comeback +3; erased multi-goal deficit up to +10; lead changes up to +9. Live recency is 180 seconds for late-goal credit. Time tied/within one is a single combined award, up to 3 live / 8 completed once 24 minutes are observed. | `hockeyHistory` |
| History ownership/caps | Active live policy replaces the sustained close-game history award with bounded trajectory history. Events and trajectory share a 12-point live budget; ordinary late regulation smoothly approaches a budget of 2 plus up to 4 for actual events, independent of target. Ordinary OT/SO uses that end budget. Completed goal history is capped at 32. Relevance fades obsolete competition as current margins become noncompetitive. | `hockeyHistory`; `calibration/trajectory-live-policy.cjs`: `ownedHistory`, `liveTrajectory` |
| Trajectory momentum and WP | Score-ledger continuity, dominance, actual positioned WP coverage and uncertainty drive a bounded +10/-8 trajectory. The selected policy gives margin-only positive history .65 confidence, gates positive credit over current closeness .45–.95, disables separate revival points, and protects against negative history discounts near decisive states. No shot attempts are used here. | `scoring/shared/trajectory.js`; `calibration/trajectory-policy.cjs`; `trajectory-live-policy.cjs` |
| Goal milestones/event shocks | Two goals by a player +3; hat trick +6, scaled by margin viability, with hat-trick credit decaying over 180 seconds. A shorthanded goal has shock value 6, decaying by elapsed time and subsequent records; generic shock total cap 12. These actual scoring events remain separate from offensive pressure. | `hockeyGoalMilestone`, `hockeyLiveMilestone`, `hockeyEventShock`; `scoring/shared/events.js` |
| Upset margin/time | Existing NHL market-upset credit requires a supported underdog lead or a late tie, scales with price strength and progress, and reaches a maximum magnitude of 22. Missing market context does not create upset credit. | `hockeyUpset`; `scoring/shared/upset.js` |
| Completed margins/finishes | Final-margin credit is up to 24 times `max(0,1-g/2)`; generic wide-margin penalty is up to 28 for margins of at least two. Completed result credit is 9 for SO, 13 for regular OT, or playoff `min(28,18+4*(depth-1))`. Completed finish floors are 61 for SO, 63 for regular OT and 78/85/90/93 for playoff OT depths 1/2/3/4+. Completed result points and sport-owned finish floors are already coordinated; `handlesFinish` prevents another generic finish award. | `hockeyCompletedResult`, `hockeyCompletedHistory`; Worker `game-model.js` |
| Aggregation | Competitive floor and situation support meet through `max`, not unconditional addition. Active NHL retains allocated context outside its floor. Positive support/milestones/shocks use existing caps; final rating clamps at 99. | `scoring/shared/pressure.js`: `aggregateLiveBonus` |

No existing NHL Corsi, Fenwick, total-SOG differential or five-minute attempt-rate modifier was found. Box-score shots are displayed in Game Center, but the existing pressure score comes from play descriptions.

## Redundancies and data risks found

1. **The same recent shots have two scoring entry points.** The +0–7 pressure component and half-pressure target adjustment share `hockeyPressure`. Aggregation already uses a maximum in places, so their numeric effects are not always additive, but adding another pressure bonus would still pay overlapping evidence. The experiment removes both old pressure entry points before inserting the new one once.
2. **Time tied is contained in time within one goal.** Existing code combines them; active history ownership replaces sustained history instead of also adding trajectory. That protection remains intact.
3. **Corsi contains Fenwick.** Goals, saved shots, misses and blocked attempts comprise Corsi; Fenwick omits blocks. Adding full-game Corsi, Fenwick, shot totals and recent attempts as separate rewards would repeatedly count the same shots. Full-game and 5-on-5 statistics are display context only in this experiment.
4. **PP/pulls already own situation targets and runway.** Attempts under those states are counted accurately but receive smaller experimental weights. The experiment does not create another PP or pulled-goalie state bonus.
5. **Goals already own event drama.** Goals count in Corsi/Fenwick but do not count again in the two-minute pressure numerator. Pressure resets at the latest goal, including same-clock ordering.
6. **ESPN `shootingPlay` is not a shot-attempt classifier.** Archived faceoffs, giveaways and period starts also carry that boolean. Use explicit NHL types, not this field.
7. **Even strength does not prove 5-on-5.** ESPN event strength labels and a current on-ice snapshot cannot establish historical 5-on-5; 4-on-4, 3-on-3 and goalie absence need event-level evidence.
8. **The active policy differs from legacy helpers.** Older WP and time awards remain callable for capture/reproduction. The experiment compares the active policy, and leaves these historical interfaces untouched.

## Available architecture and integration

The browser requests `/game/NHL/{ESPN event ID}`. The Worker recognizes the game from its existing feed, obtains ESPN summary data through `providerJson`, and uses the existing per-resource cache and refresh leases. The scoring cron, notifications, recorded histories and current canonical scoreboard continue to use their established data path.

Inspected all 25 local ESPN NHL game fixtures: 1,245 `Shot`, 743 `Missed`, 795 `Blocked` and 159 `Goal` events; none has `situationCode`, none has WP observations, and all have a current on-ice snapshot. These archives can support type-based all-situations attempts, but do not support reliable historical 5-on-5 classifications on their own. On-ice and final box-score data must not be projected backward.

The new [NHL provider](../alerts-worker/src/providers/nhl.js) runs **only for Game Center details**. It resolves ESPN identity against the [public NHL schedule](https://api-web.nhle.com/v1/schedule/2024-10-09) using both home/away abbreviations and start time, then obtains the [public NHL play-by-play](https://api-web.nhle.com/v1/gamecenter/2023030417/play-by-play). NHL and ESPN IDs remain separate. Known abbreviation differences are normalized. Ambiguous/mismatched games fail closed; arbitrary IDs cannot become upstream proxy requests.

Schedule data uses the existing cache for six hours; PBP uses 12 seconds live / 55 seconds completed. NHL enrichment has a separate 2.5-second deadline. Its failure returns an unavailable statistics panel while preserving the ESPN summary. New data is not passed into production scoring or persistent rating history.

The pure [reducer](../scoring/nhl-advanced.cjs) rebuilds each complete source snapshot. `eventId` identifies revisions, latest explicit revision time wins when supplied, otherwise the latest occurrence wins. A corrected type or owner replaces the old event; a removed event disappears. Output is deterministic after chronological ordering by period/elapsed clock and provider sort order. No append-only attempt accumulator is used.

- Full-game and 5-on-5 output includes CF/CA, FF/FA and each team's CF%/FF%. Zero denominators return null, displayed as an em dash.
- Corsi counts exactly `goal`, `shot-on-goal`, `missed-shot`, `blocked-shot`; Fenwick excludes the last. A goal is not also counted as a saved shot. Blocked attempts belong to the shooter, preferring the supplied shooting-player roster team when available.
- Exact `1551` is confirmed 5-on-5 with both goalies. Other/unknown codes do not enter that split. PP and empty-net counts remain available separately.
- Rolling attempts use `(now-300, now]` in **elapsed playing time**, crossing period boundaries and excluding intermission wall time. Regulation and playoff OT use 20-minute periods; regular OT uses five minutes. Shootout attempts are excluded.
- Recent trailing pressure uses the last 120 seconds after the latest goal. The side must be trailing both now and at the attempt. A team that has just fallen behind does not inherit its earlier attempts as trailing pressure. Ties have no trailing-team label.
- Clock lag, stale cache, score disagreement, unknown times/teams/strength and missing IDs are exposed/gated. Display can retain partial data with an explicit warning. Experimental scoring retains the exact baseline if current source/score/clock alignment cannot be established.

The NHL describes SAT as Corsi and USAT as Fenwick in its own [statistics coverage](https://www.nhl.com/canadiens/news/nick-suzuki-named-a-finalist-for-the-frank-j-selke-trophy-may-6-2026). These are attempt-volume/territorial measures, not expected goals or shot-quality measurements. No xG is inferred from them.

## Experimental component and flag

[experimentalNhlRating](nhl-pressure-experiment.cjs) is an offline review entry. `DEFAULT_FLAGS.nhlAdvancedPressure` is false; only an explicit `{nhlAdvancedPressure:true}` argument invokes replacement. There is no production UI toggle, URL parameter, environment default or automatic activation. Production scoring files and policy/model IDs remain unchanged.

Initial calibration:

| Input | Initial rule |
| --- | --- |
| Five-minute activity | Volume ramps from 6 to 16 combined attempts; supplies at most 2 points, multiplied by current two-minute activity. |
| Two-minute activity | Weighted non-goal attempts ramp from 2 to 8. Ordinary attempts weight 1, PP attempts .65, empty-net attempts .5, with empty-net weighting taking precedence. The discounts apply to ties too. |
| Trailing pressure | At most 2 points from five weighted trailing attempts, dominance above 50% of current two-minute attempts, and freshness fading over 120 seconds. For ties, balanced recent activity replaces the trailing-side term. |
| Margin/time | Multiply by `(.35+.65*p)*nhlLiveMarginCloseness(g,p)`; gaps of three or more award zero. |
| Overtime | Halve experimental pressure; do not award shootout pressure. |
| Total | Round once; maximum **+4 pressure points**, never negative. |

Before aggregation, the experiment recalculates the existing situation target with non-scoring shot descriptions removed, preserving all on-ice, period, season, goal and postseason context. This removes its embedded old pressure top-up. It replaces the old +0–7 pressure component with the new capped amount. The pressure-free floor plus new pressure and summed situation support meet through the existing maximum. Pressure is not added to a finalized rating.

Current Tension, Generic Leverage, margin penalties, clock conventions, early opening-score protection, ordinary target anchors, manpower state, postseason adjustments, event shocks and milestones are reused. Existing history ownership is recomputed with the new support through its original rules. Quiet late one-goal states retain exact targets/ratings; scoring changes arise from replacing pressure evidence. Completed ratings bypass the experiment entirely.

## Replay evidence and recommended calibration

See [per-game and situation results](nhl-pressure-results.md), including old/experimental peak and final ratings, and the [full comparison](output/nhl-pressure-comparison.json) for every rating-history checkpoint, pressure, competitive target and retained-history total.

Eight publicly sourced games cover late one-goal play, ties, blowouts, PP, empty nets, regular 3-on-3 OT, playoff multi-OT and shootouts. Final corrected PBP was reconstructed into chronological prefixes; no future PBP, final on-ice state or final player totals enter earlier checkpoints. Both ratings receive identical prefixes. NHL-native state is adapted to the existing summary contract; records, historical odds, injuries, player milestones and unavailable narrative chance descriptions are not fabricated. These are reconstructed current-model ratings, not the ratings users actually saw when those games were played.

Delayed, duplicate, type-corrected, owner-corrected and removed events are **controlled perturbations** on a real late-game prefix. They test repair behavior; the final snapshots do not establish when the NHL originally issued historical corrections. The comparison contains that injected rating history separately and labels it explicitly.

Recommendation: retain the +4 ceiling and keep the experiment disabled pending review. Do not add full-game possession-share bonuses. Keep the PP .65 and empty-net .5 discounts and OT half-weight while reviewing individual changed moments; raising the cap is not justified by this small, playoff-heavy sample. Add broader regular-season and live observed snapshots before enabling scoring: score-effect-adjusted trailing pressure, more scoreless periods, goalie pulls at two-goal margins, delayed penalties and feed-correction arrival logs deserve particular review. Six Finals games saturate the 99 rating cap often, which hides some component differences.

Any later authorized activation should use a new scoring-policy/model ID and the established recorded-history model boundaries. Game Center statistics can be reviewed independently of scoring. No release, push, deployment or runtime activation was performed here.

## Validation

- Public fixture hashes and official non-shootout SOG totals are verified; capture tool and deterministic offline report generator are included.
- Focused tests cover attempts, Fenwick nesting, 5-on-5 exclusions, both OT formats, shootouts, rolling boundaries, same-clock goal ordering, lag/future data, identity mapping, null denominators, stale resources and correction/removal behavior.
- Historical tests check quiet close-game equality, unchanged state/manpower/overtime, the +4 cap, current production parity with the flag off, old/new peak/final/history reproduction and disabled production imports.
- Worker route tests exercise serialized feed games, actual cache reuse and immutable stored feed ratings; UI markup tests exercise mapped values and degraded-data labels.
- Local browser assets built successfully. Desktop/mobile visual verification is incomplete: browser access was unavailable, and native automation stopped because it could not determine Chrome's current URL confidently enough to enforce its policy. No further UI input was issued.
- Final automated counts and commands are recorded in [the implementation review](nhl-pressure-review.md).

Reproduce without network access:

```powershell
node scripts/nhl-pressure-report.mjs
node --test test/nhl-advanced.test.js alerts-worker/test/nhl-provider.test.js
node --test test/*.test.js alerts-worker/test/*.test.js
node scripts/build-site.mjs
```

Public captures are reproducible separately with `node scripts/capture-nhl-pbp.mjs <NHL game IDs>`; normal tests and comparisons never fetch live data.
