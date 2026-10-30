# CFB live watchability correction

Release baseline: `bfa955fa989206dd9833784132f5ed90bd5a153d`, the already-published `LIVE_CFB_CONTEXT_POLICY`. This correction was prepared in `work/publication` on `release/cfb-watchability-20261030`; the divergent original local main was not merged or pushed. The default successor is `LIVE_CFB_WATCHABILITY_POLICY`, model `2026-10-30.cfb-watchability.1`.

## Exact change and rationale

Current competition now receives more of CFB's existing live scale, with discretionary matchup context supplementary. One parameter set was selected and retained. There was no parameter grid, aggregate-score optimization, new comeback award, generic floor, final-score multiplier, or case exception.

Let `p` be existing regulation progress and `C` the existing current-closeness signal. With validated WP, `C = marginCloseness * (.65 + .35 * effectiveUncertainty)`, where uncertainty is `1 - 2 * abs(WP - .5)`, capped by the existing feasibility limit. Missing WP remains null and uses the existing margin-only fallback. Margin closeness, possession, field position, feasibility and the uncertainty cap are unchanged.

Previously, Current Tension was `round(34 * C)`. For live CFB only:

```text
x = clamp(p / .5, 0, 1)
ceiling = 34 + 14 * x*x*(3 - 2*x)
Current Tension = round(ceiling * C)
```

The ceiling smoothly reaches 48 at halftime, with no quarter-boundary switch or extra late-only activation. An uncertain ordinary midgame can earn a good rating from its current state before fourth-quarter urgency. The opening ceiling remains 34 so an early tie alone does not become elite. Low WP still distinguishes otherwise identical states, without dismissing feasible competition. No new credit detects R07's recovery a second time.

The existing CFB context separation is preserved, but discretionary context receives 40% of its prior live award:

```text
T = max(0, capped opening score - persistent stakes)
O = min(T, admitted Sport baseline + Schedule scarcity)
M = max(0, T - O)
V = .15 + .85 * existing comeback feasibility
W = existing time-decay weight
old retained context = round(O*W*V + M*.38*V)
new retained context = round(O*W*V + M*.152*V)
new existing upset factor = round(old existing upset factor * .4)
```

Absent opening-factor evidence is treated as ordinary context, as before. Net opening reductions and caps remain in the basis. Only `Underdog threatens upset` is scaled; no second WP or recovery award is introduced. The same .4 scale on matchup and upset context prevents strong-team R18 from entering the 90s when current competition increases. Ordinary baseline/scarcity retention and persistent postseason stakes (`.68 * feasibility`) are unchanged. Unknown rankings/records receive no invented poor-team penalty.

Game-state baseline remains 12. Generic Leverage remains `round(8 * smoothstep(clamp((p-.55)/.40,0,1)) * C)` and is exactly unchanged. History relevance, caps, ownership, trajectory formulas, runway penalties and decisive-situation rules remain unchanged. State/base and live situation/floor calculations are recomputed through the authoritative scorer; they are never patched onto old floor results. CFB history protection can therefore respond to recalculated floor headroom under its existing rules. Non-CFB outputs and all nonlive scoring remain unchanged.

## Reviewed arithmetic

All rows have live bonus zero. Final rating is the existing rounded/clamped sum of base, live bonus, retained event history and signed trajectory. Base is the rounded/clamped sum of the listed state/context factors. The arrows below are published baseline to new default.

| Checkpoint | Rating | Baseline | Retained context | Tension | Leverage | Upset | Stakes | Event history | Signed trajectory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R07 archive | 45 → 55 | 12 | 7 → 7 | 24 → 34 | 0 | 0 | 0 | 4 | -1.887834 |
| R18 archive | 61 → 71 | 12 | 7 → 6 | 26 → 37 | 3 | 0 | 0 | 15 | -1.613618 |
| R18 hypothetical unknown | 59 → 70 | 12 | 5 → 5 | 26 → 37 | 3 | 0 | 0 | 15 | -1.613618 |
| R18 hypothetical weak/limited | 59 → 70 | 12 | 5 → 5 | 26 → 37 | 3 | 0 | 0 | 15 | -1.613618 |
| R18 hypothetical strong teams | 75 → 76 | 12 | 21 → 11 | 26 → 37 | 3 | 0 | 0 | 15 | -1.613618 |
| R18 hypothetical credible upset | 71 → 75 | 12 | 7 → 6 | 26 → 37 | 3 | 10 → 4 | 0 | 15 | -1.613618 |
| R18 hypothetical verified stakes | 62 → 73 | 12 | 5 → 5 | 26 → 37 | 3 | 0 | 3 | 15 | -1.613618 |
| R08 archive | 1 → 1 | 12 | 1 → 1 | 3 → 4 | 1 | 0 | 0 | 0 | 0 |

R08 additionally has the unchanged -24 runway penalty, making its clamped base 1. No obsolete history returns. Feasibility remains .058621.

R07 is 24–17, Q3 9:37, trailing third-and-8 at its own 13. Its margin closeness .949999 and feasibility .999998 remain intact; `C=.704414535` gives `round(48*C)=34`. Its new arithmetic is `12 + 7 + 34 + 4 - 1.887834 = 55.112166`, rounded to 55.

R18 is 20–17, Q3 1:06, with possession unavailable. Its margin closeness .989209, feasibility .999001 and `C=.773511930` give tension 37. The archive's arithmetic is `12 + 6 + 37 + 3 + 15 - 1.613618 = 71.386382`. All hypothetical rows retain the identical clock, score, unavailable possession, WP and history. Strong teams means ranks 8/12, records 6–1 and a three-point line; credible upset means unranked home underdog, away rank 8 and home +14; verified stakes supplies the existing verified playoff-race field. These are hypothetical conditions, not archive facts. Their full definitions remain in `cfb-context-fixtures.mjs`.

## Counterexamples selected before editing

The explicit archived IDs and original scores are in `cfb-watchability-fixtures.mjs`. Ignored `work/cfb-watchability-preselected.json` records the pre-edit selection. No counterexample received a fitted target.

| Additional archived state | Event:play | Before → after |
| --- | --- | ---: |
| Sustained close, 15–15 Q4 11:04 | 401866442:401866442642 | 70 → 84 |
| Defensive, 0–0 Q2 2:00 | 401871091:401871091293 | 46 → 56 |
| Recovery, 17–17 Q4 14:37 | 401856724:401856724574 | 58 → 70 |
| False-closeness probe, 14–21 Q4 0:16 | 401866443:401866443723 | 61 → 63 |
| Garbage time, 31–0 Q4 1:52 | 401856720:401856720774 | 1 → 1 |
| Ranked but 21–0 Q2 5:39 | 401856720:401856720350 | 45 → 43 |
| Q1 end / Q2 next play | 401856719:188 / 192 suffixes | 48/49 → 52/52 |
| Q2 end / Q3 next play | 401856719:411 / 418 suffixes | 62/63 → 73/73 |
| Q3 end / Q4 next play | 401856719:594 / 598 suffixes | 60/61 → 70/71 |

Sustained-close 84 consists of baseline 12, context 4, tension 47, leverage 6, event history 7 and existing signed trajectory +8. The recovery's history remains 6 and trajectory -2.108889; tension 31→44 and context 7→6 explain its +12. The archived false-closeness probe has a real trailing possession, second-and-15 at the opponent's 41: base 29→34, recomputed live award 32→29, no history. Its 63 is not evidence that an infeasible recovery now receives a generic floor.

| Preselected hypothetical condition | Before → after |
| --- | ---: |
| Routine 0–0, Q1 12:00, WP .5 | 61 → 61 |
| Defensive 3–3, Q2 7:00, WP .5 | 57 → 69 |
| Same state, ranks 5/8 and three-point line | 72 → 75 |
| Same state, national championship | 84 → 96 |
| 24–21 Q4 0:30, leader possession, no trailing timeouts, WP .99 | 17 → 19 |
| 24–21 Q4 0:40, trailing third-and-4 at opponent 15 | 90 → 92 |
| 42–7 Q4 1:00 | 1 → 1 |

The defensive tie needs no high score to reach 69: `12 + 10 + 46 + 1.140148`. The championship retains the same +27 stakes. The decisive drive's base rises 42→52, but authoritative live headroom falls 45→37; its unchanged +3.25 signed trajectory yields 92, rather than an algebraic 100. Controlled WP .5/.99/missing, history omission, context pairs and equal-elapsed quarter transitions are tested. Missing WP stays null; missing history earns no event points. Equal-elapsed quarter transitions are identical, with at most one point across the surrounding two seconds.

## One corrected replay and integration validation

`node scripts/replay-input-comparison.mjs --cfb-watchability` ran once to completion using corrected chronological reconstruction and authoritative rescoring. Full component evidence is in ignored `work/live-cfb-watchability-results.json`.

- 8,409 CFB checkpoints across 50 games: 6,585 increased, 515 decreased, 1,309 unchanged.
- Checkpoint mean 47.8907→53.0067; equal-game mean 47.7903→52.9082. Observed range of changes: -8 to +14.
- Counts at 70+: 681→1,850; 80+: 250→554; 90+: 178→218; exact 99: 107→151. These are consequences, not accuracy labels or optimization objectives.
- Every Generic Leverage award and every raw trajectory analysis was identical across policies.
- All 15,358 eligible non-CFB outputs matched exactly apart from policy ID: NFL 4,560; NHL 7,944; MLB 776; NBA 1,419; NCAAB 659. Synthetic coverage also includes Soccer and Tennis, which have no eligible archived replay states.
- Upcoming and completed outputs matched on all 107 archived games, 214 nonlive comparisons. Existing completed CFB and upset-result tests also passed.

The five largest increases and five largest decreases were retained with full components and inspected. Representative +14: event `401856726`, play `401856726345`, 14–14 Q2 0:38, 60→74. Tension 33→47 accounts for all movement; context 8, history 3 and trajectory +3.853447 are unchanged. The same game's 21–21 Q3 5:42 checkpoint moves 68→82 with tension 34→48 and unchanged history 9/trajectory +6. Representative -8: event `401856723`, play `40185672336`, 0–0 Q1 12:49, 70→62; tension stays 31 and retained context drops 27→19. Event `401856809` opening checkpoints also lose eight context points. These are reduced early reputation contributions, not erased current competition or history.

Validation passed: 145 focused scoring, browser, Worker, feed/default selection, cache, history/timeline, completed CFB and capture tests, plus one targeted repeated browser/Worker refresh check (146 total). The latter confirms upset metadata equals the awarded factor and does not repeatedly multiply it. Browser bundle build and Wrangler dry-run passed. Relevant commands:

```powershell
node scripts/build-site.mjs
node --test test/live-cfb-watchability.test.js test/live-cfb-context.test.js test/live-nhl-allocation.test.js test/live-endgame-allocation.test.js test/live-history-relevance.test.js test/release-integration.test.js test/release-cache.test.js test/capture-live-cfb.test.js test/startup-feed.test.js test/recorded-history.test.js test/timeline.test.js test/scoring-module-parity.test.js test/scoring-modules.test.js test/cfb-completed-calibration.test.js test/cfb-completed-upset.test.js test/detail-live-refresh.test.js alerts-worker/test/sports-feed.test.js
node --test --test-name-pattern='CFB upset metadata' test/release-integration.test.js
.\alerts-worker\node_modules\.bin\wrangler.cmd deploy --dry-run --config alerts-worker/wrangler.toml
```

## Release, rollback and observation

Publication uses the established workflow and original URL, `https://mmueller091.github.io/sports-radar/`. The browser and Worker select the same new policy by default. `MODEL_VERSION` advances scored-feed caches, alert namespaces and history labels; the existing history boundary handling prevents joining different models. Git-stamped asset URLs and service-worker caches advance with the release. Visitor preferences remain intact.

Before editing, new remote branch `backup/live-before-cfb-scale-20261030` and annotated tag `live-before-cfb-scale-20261030` were created and verified at `bfa955fa989206dd9833784132f5ed90bd5a153d`. Earlier `live-before-scoring-upgrade-20261030` branch/tag backups at `fc20ad8` were preserved. The pre-correction Worker version is `ce7a741e-4749-40c3-9a75-62ba39af45e5`. For rollback, revert this correction commit on a fresh current-main checkout and push normally, then roll the Worker back to that recorded version. Never force-push the original divergent main.

Saturday's local capture keeps the two releases explicitly named on identical captured inputs:

```powershell
node scripts/capture-live-cfb.mjs --date 20261031 --interval-seconds 60
node scripts/capture-live-cfb.mjs --latest
```

The compared IDs end in `cfb-context` and `cfb-watchability`. The third historical `production` series is explicitly labelled as the preserved pre-first-upgrade core, not today's production. No observer process is automatically started by this release. Fixture/replay success is not live-game validation; actual deployment/feed verification is reported separately with the release commit and Worker version.

Remaining judgments: R07 improves ten points but 55 may still undershoot “moderate bordering on high”; its unchanged history allocation and weak immediate field position still distinguish it from R18. Weak R18 lands at 70, just above the requested high-60s neighborhood; strong/upset land at 76/75. The national-championship hypothetical reaches 96 with preserved stakes, and the archived last-gasp possession remains 63; these deserve observation, not a claim of fresh human approval. No numerical ceiling was fitted to the approximate preferences. Low-end calibration stays deferred. This release ends the tuning pass for Saturday observation.
