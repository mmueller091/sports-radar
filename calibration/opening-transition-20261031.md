# Cross-sport opening continuity — October 31, 2026

Model: `2026-10-31.opening-transition.1`. Previous production: `c9623643b589a79553785d1c5c9920e011f47dd7`, model `2026-10-31.football-transition.1`. [Executable comparison](../scripts/opening-transition-report.mjs) and [full factors, components, history and trajectory](output/opening-transition-20261031.json).

## Findings and correction

The mature live baseline/context/Current Tension combination was awarded at the first live status in every nonfootball sport. A missing WP selected maximum margin-based competition even before gameplay. NHL's reported opening 53 also contained two invalid research awards (+3 for Minnesota's streak and +2 for an ordinary prior overtime win), while its serialized opening factors summed to 48. A fresh production read reproduced both exact erroneous storylines and the 53-versus-48 factor mismatch.

The six sports now use a production-only smooth ownership transfer, following the existing football approach. At zero gameplay, the capped and rounded valid pregame score owns the state basis. Cubic smoothstep transfers that ownership to the existing live baseline, context, stakes and Current Tension through half a regulation game. Generic leverage, pressure, penalties, event shocks, history and trajectory retain their existing owners and budgets. No finalized-score deduction, new score cap, frozen early interval or live-status bonus is used.

MLB measures completed outs and halves instead of assigning a quarter inning at the first top-of-inning label. Tennis uses games played across sets (or completed sets when game scores are absent), rather than the initial synthetic half-set estimate. NHL uses its existing regulation/OT clock interpretation; shootouts and overtime are fully developed states. Period/quarter/half/set resets do not restart the transfer. Missing clocks start at the known period boundary instead of its midpoint.

Market prices are converted to internal outcome uncertainty after removing two-sided overround; spread-only expectations use sport scoring units. Available market evidence dominates the opening, then yields smoothly to validated live WP or the developed scoreboard. The sport model continues to own margin and comeback viability, avoiding a second margin discount. The estimate is not displayed as provider WP. Stale, finished and score-inconsistent WP remains rejected by the existing chronology validator.

Ordinary early goals/runs/baskets receive immediate event credit inside the existing event-shock budget while the pregame basis still owns the state: goal 4, run 2, basket 1. Existing stronger event shocks take precedence. This supplemental early credit fades with the ownership transfer, so mature event/history awards and NHL targets remain unchanged. Early penalties, runner pressure, break points and existing momentum signals remain independent of this transfer.

Observed baselines retain score, raw score, factors, odds and underdog identity through feed refreshes, D1 recovery and JSON/browser reloads. Recovery checks sport, game and participant IDs, calibration compatibility, factor reconciliation and the pregame cap. NFL/CFB retain their original calibration compatibility and preceding-release migration. Other old-model scores are not silently relabeled as observations. Missing observations produce an explicitly `reconstructed` basis and hide “vs start” for every sport. Verified context first learned during play earns separate retained live context without rewriting the observed pregame score. Context already in the baseline survives its omission from a later research payload.

Context enrichment refreshes opening factors alongside opening/raw scores. Storyline achievement ownership is validated separately from article relevance, for deterministic and AI classifications and cached rows on read. Opponent tags do not establish who owns a streak/performance. Routine overtime wins, previous-game mentions and game-winning plays alone no longer qualify as notable recent performances; exceptional achievements such as hat tricks remain eligible. No cached production rows or historical fixtures are deleted.

## Controlled comparison

All rows use the same valid observed opening of 53 to isolate transition behavior. These are controlled projections, not historical claims. Missing live WP; no market adjustment. “Early” is two quiet minutes in clock sports, one completed out in MLB, and two games played in tennis. Late states are described below.

| Sport | Opening | First live before → after | Early before → after | Late before → after |
| --- | ---: | ---: | ---: | ---: |
| NHL | 53 | 67 → 53 | 67 → 53 | 85 → 85 |
| NBA | 53 | 66 → 53 | 65 → 53 | 77 → 77 |
| NCAAB | 53 | 66 → 53 | 65 → 53 | 77 → 77 |
| MLB | 53 | 66 → 53 | 66 → 53 | 63 → 64 |
| Soccer | 53 | 66 → 53 | 66 → 53 | 51 → 51 |
| Tennis | 53 | 63 → 53 | 63 → 53 | 77 → 77 |

Late examples: NHL tied 2–2 with 1:00 left; NBA/NCAAB trailing by one with possession and 0:10 left; MLB down one, bases loaded, one out, bottom ninth; soccer 1–1 at 89 minutes following an equalizer; tennis deciding-set tiebreak match point at 6–6. The soccer example has no supplied chance-pressure sequence and retains the existing low-information trajectory discount; equalizing the prior deficit still changes its state competitiveness immediately. The table does not assert that every close game should rate 90+.

Opening factor explanation: previous NHL was 12 state baseline + 21 context + 34 tension = 67; most other sports were 12 + 20 + 34 = 66. Tennis's synthetic first-set progress produced 12 + 17 + 34 = 63. Each now starts with 53 carried pregame points and zero unearned live baseline/tension; event-free bonuses are zero. Early fractional ownership changes are rounded normally. New research after start is separately labeled `Verified context learned during play`.

Reviewed movements: MLB's late +1 follows actual out-based progress instead of the midpoint-of-half estimate. The additional NHL grid flags a +9 movement for a three-goal deficit ten minutes into the first: more of the valid opening basis remains during the transfer, while the existing margin penalty, pressure and event owners still operate. All mature NHL grid scores, including one/two-goal finishes, goalie pulls, shootouts and playoff sudden death, remain unchanged; deciding Stanley Cup Final OT retains 99. No unexplained movement remains in these comparisons.

The confirmed Edmonton–Islanders matchup-only basis is **48** after removing its invalid +5 research; an event-free projection with those four factors scores 48. Production also recovers a valid near-pick'em market from the accepted summary, adding 5. Its corrected reconstructed opening is therefore **53 = 32 + 5 + 4 + 7 + 5 market**, with factors fully reconciled and neither invalid storyline present. The 53-based table separately isolates the systemic scoring defect from the relevance correction.

## Validation and release

The root and Worker suites cover initial and early states, ordinary scoring and pressure, favorite/even markets, missing/valid/stale WP, disappearing odds, pre/post-start context, D1 recovery, old snapshots, browser-bundle parity and reloads, period boundaries, NHL late/OT/shootout/playoff allocations, and decisive situations in all six sports. The comparison additionally verifies all 107 archived completed ratings/factors and 270 NFL/CFB projections unchanged. The NFL/CFB transition module and frozen experimental policy definitions are unchanged; advanced NHL pressure remains disabled.

All **731 root and Worker tests passed** (zero failures/skips), along with both scoring smoke packs, the comparison/reload probes, production build, syntax/whitespace checks and Worker dry run.

Final commands: `node --test --test-concurrency=4 test/*.test.js alerts-worker/test/*.test.js`, `node test-score.js`, `node scripts/opening-transition-report.mjs`, `node scripts/build-site.mjs`, `node scripts/verify-opening-transition.mjs`, and Wrangler deployment dry run. Frozen files are checked using their exact Git bytes; the local historical checkpoint required by the provenance suite was imported without modifying frozen content.

Publication uses the model identifier above and the commit SHA for HTML asset revisions and the service-worker cache. `node scripts/verify-opening-transition.mjs --production` checks health/feed models, current feed factor reconciliation, published bundle opening/reload probes for all six sports, and Pages/cache revisions. Graphical browser inspection is unavailable because local browser use is disabled in Work settings; executable verification uses the actual published browser bundle.

Production verification succeeded for implementation commit `32592d8619e3b71d7e1cbe1bb7c35a4d11092736`. Worker deployment `3ec1730c-2b79-4d96-8044-b3dfa8c802ef` is active. [Pages run 201](https://github.com/mmueller091/sports-radar/actions/runs/41232560512) completed successfully. Health, the 309-game feed and the published scorer all report `2026-10-31.opening-transition.1`. Published HTML and service-worker cache use the deployed commit revision. All six published opening/reload probes return 53; all active feed opening factors reconcile. The NHL example was live at 61 with the reconstructed opening 53 described above. The working tree was clean after publication. A subsequent documentation-only commit records this receipt and the recovered market explanation; its Pages assets receive that commit's revision while sharing the identical Worker scoring code.

## Exact changed files

```text
README.md
alerts-worker/src/game-model.js
alerts-worker/src/snapshot-history.js
alerts-worker/src/sports-feed.js
alerts-worker/src/storylines.js
app.js
calibration/opening-transition-20261031.md
calibration/output/opening-transition-20261031.json
calibration/shadow-candidate.cjs
scoring/live-runtime.cjs
scoring/opening-transition.cjs
scripts/opening-transition-report.mjs
scripts/verify-opening-transition.mjs
test/cfb-filters.test.js
test/football-pregame.test.js
test/helpers/opening-transition.cjs
test/opening-transition.test.js
test/release-integration.test.js
```
