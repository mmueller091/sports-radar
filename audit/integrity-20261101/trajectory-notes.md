# F3, F6, F7, C1 and C2 implementation evidence

These are offline reproductions and synthetic controls, not claims of new live observations. The baseline is audited commit `8ad7a0096307e0ab9038dbcba60f0e965e9bcfaa`, model `2026-11-01.production-integrity.2`. The candidate model is `2026-11-01.audit-integrity.3`. Publication status and the complete release gate belong to the main audit response.

## Disposition and mechanism

**F3 fixed:** `scoring/shared/trajectory.js` no longer seeds an observed opening 0–0. Actual scored records, including non-scoring observations of an unchanged score, establish score intervals. A matching current header may close an existing interval; a header alone, a lone current marker, an unpositioned record, or elapsed clock alone cannot establish history. A changed score on a non-scoring marker, simultaneous unexplained increases for both sides, or an impossible single-event scoring increment leaves a coverage gap. Actual positioned win-probability observations can independently support uncertainty over their own interval. Score and WP evidence intervals are combined without filling gaps between them. Future positions are excluded at the canonical live boundary.

`observedCoverageStart`, `observedCoverageEnd`, `observedCoverageSpan`, `observedCoverageShare`, `scoreObservationCount` and `hasObservedHistory` expose that support. `calibration/trajectory-policy.cjs` gates duration credit on actual observed span and finite supported telemetry. It does not treat unsupported historical snapshots as mature evidence. Existing policy weights, caps and current-state gates are unchanged. Non-scoring scoreless observations can still earn sustained-competition credit; truncated late histories cannot earn whole-game duration credit. This is an evidence correction, not smoothing.

The final duration audit also found two uses of the generic period-midpoint display fallback: positioned WP history and football's sustained underdog lead. Both now require real event time; football sustained duration also requires a known current clock. Tennis set numbers alone cannot locate an observed duration. Explicit WP positions (including zero), genuine clock observations and numeric probability boundaries remain supported. These guards do not change a known clock's scoring convention.

**F6 fixed:** trajectory closeness rejects null, undefined, empty and non-finite hook values before numeric conversion. The intended score-margin fallback operates for Soccer/Tennis; explicit numeric zero and one remain valid boundaries. No invented probability is introduced.

**F7 fixed:** Soccer pressure uses a five-minute match-clock window, including stoppage-time notation and numeric provider clock seconds. When match clocks are absent, explicitly supplied occurrence wallclocks and a canonical wallclock may establish age. Receipt/update times are not event times. Events with unknown or future times cannot be advertised as recent pressure. Different periods do not share a pressure window across an intermission. Stable IDs, or exact-record identity when absent, prevent duplicate pressure awards; the active input pipeline additionally normalizes provider revisions. Current pressure weights and the seven-point cap are unchanged. Five minutes is the explicit Soccer recency definition introduced by this fix, not a global scoring weight.

**C1 fixed:** CFB's late-game retrospective assessment is now `gameQualitySoFar: {score, provisional:true, basis:'current-score-and-observed-history'}`. It is present only with observed history and clearly assumes the current result stood. It never adds to live `score` or its factors. Final games retain the existing completed engine. The exact reviewed legal kneels lose only the former 24/43/46-point completed-quality additions. No ratings are forced to decrease and stored observations are not recalculated. A credible late possession remains substantially more urgent. NFL has no equivalent completed-quality retention function; its identical kneel controls remain 55/55/55 and no NFL-specific change was made.

**C2 fixed:** `baseballPlateAppearance()` determines the batting side, confirmed occupancy, outs, deficit and tying/winning-run location. A known late live plate appearance whose runners plus batter can tie uses the reachable plate-appearance deficit in the existing MLB current-tension curve. Runners are not added to the score; the raw-score wide-margin penalty remains. The old `gap <= 2` explanation and `gap <= 3` decisive-appearance gates no longer exclude the tying batter when down four with loaded bases. The existing situation floor and points still combine with `max`, not additive copies of the same award. Existing coefficients and caps are unchanged. All three base states and a valid out count must be known; three outs, the leading batting side, early innings and deficits beyond runners plus batter receive no new support. Upcoming/completed state ratings and their old snapshot behavior remain pinned.

## Exact before/after controls

Full ratings, factors, reasons, pressure components and history diagnostics are in [trajectory-baseline.json](trajectory-baseline.json) and [trajectory-corrected.json](trajectory-corrected.json). [trajectory-reproduce.mjs](trajectory-reproduce.mjs) runs without provider requests against a selected source tree.

| Scenario | Original | Corrected | Exact reason |
|---|---:|---:|---|
| NFL 24–19, Q4 1:50, trailing side own 25, header only | 84 | 83 | Unsupported +3.964 trajectory credit removed; existing NFL floor allocation reuses some resulting headroom, so final delta is not simply −4 |
| CFB same header-only control | 92 | 88 | Unsupported +4.390 trajectory credit removed; no fabricated game-quality field |
| NBA 100–100, Q4 2:00, header only | 64 | 57 | Unsupported +6.5 history removed, normal final rounding preserved |
| NCAAB 100–100, second half 2:00, header only | 78 | 71 | Same evidence correction |
| MLB tied bottom ninth, empty, no outs, header only | 78 | 71 | Same evidence correction |
| Soccer goal at 20, equalizer at 21, tied at 90+5, no WP | 53 | 65 | Null hook no longer creates zero competitiveness; supported tie replaces the −6.4 false-dominance penalty |
| Soccer 1–0 at 90+5, no history | 39 | 45 | Missing evidence contributes zero rather than −6.4 |
| Same Soccer state, one chance from minute 3 | 45 | 47 | Recent-pressure component 6→0; null correction and the actual unchanged-score interval separately produce +1.963 history |
| Same old chance repeated seven times | 46 | 47 | Recent-pressure component 7→0; same canonical historical observation counts once |
| CFB reviewed legal kneel at 0:59 | 58 | 34 | Remove 24-point live/final blend; provisional quality remains 80 |
| CFB reviewed legal kneel at 0:19 | 77 | 34 | Remove 43-point blend; provisional quality remains 80 |
| CFB reviewed legal kneel at 0:01 | 80 | 34 | Remove 46-point blend; provisional quality remains 80 |
| NFL equivalent kneels | 55 / 55 / 55 | 55 / 55 / 55 | No equivalent mechanism found; unchanged |

All listed differences are intentional, tied to the described mechanism, and use the new model version. None is justified merely by preferring its numerical result. Soccer's overall rating can rise while its stale-pressure component correctly disappears because F6 independently removes a false penalty; that is exposed rather than hidden.

Bottom ninth, no outs (old → corrected), after removing F3 contamination:

| Deficit | Empty | Loaded |
|---|---:|---:|
| 0 | 78 → 71 | 80 → 73 |
| 1 | 60 → 57 | 62 → 73 |
| 2 | 29 → 29 | 49 → 73 |
| 3 | 3 → 3 | 22 → 61 |
| 4 | 1 → 1 | 2 → 43 |
| 5 | 1 → 1 | 1 → 1 |

Loaded, down four: 0/1/2 outs are 43/42/44; the two-out pressure difference comes from the existing decisive-appearance formula, not a new probability model. Three outs removes the opportunity and returns 1. The reason now names the tying batter. Loaded down three names the winning batter. This is a watchability model, not an estimated probability that every runner will score.

## Tests and historical baselines

The new [audit-trajectory-integrity.test.js](../../test/audit-trajectory-integrity.test.js) contains **19 targeted tests**. Against the original source, **3 passed and 16 failed** ([before log](trajectory-before-final.log.gz)); against the candidate, **19 passed, 0 failed** ([after log](trajectory-after-final.log.gz)). The generated original-source runner preserves the exact assertions and changes only module/fixture locations. It is an evidence artifact, not part of the production bundle.

The final [audit-observation-time.test.js](../../test/audit-observation-time.test.js) adds **4 tests** for period-only WP across eight sports, valid explicit positions/clocks, NFL/CFB sustained-lead duration, and Tennis set-only history. Immediately before the narrow duration guards, **1 passed and 3 failed** ([before log](observation-time-before.log.gz)); all four pass afterward. The final combined run covering both new files, football live, trajectory, shadow and frozen checkpoint tests passes **65/65** ([after log](observation-time-after.log.gz)). No fixture annotation changes were needed for these last guards.

Additional tests preserve observed scoreless and defensive contests, real late threats, final assessments, independent NFL behavior, numeric boundaries, stoppage time, occurrence timestamps, repeated/ordered pressure records, empty/loaded bases, missing occupancy, batting side and inning/outs transitions. Existing fixtures that asserted sustained history while supplying only a header now supply explicit synthetic history. The Soccer pressure fixture now supplies actual event clocks. NBA synthetic shape tests use valid single-side scoring records rather than impossible seven-point baskets or simultaneous score increases.

No archived golden rating or historical observed rating was rewritten. The old review generator claimed to be a frozen historical reproduction while importing mutable scoring dependencies. Its explicit historical path now loads a compressed, hash-checked copy of the audited legacy adapter/core/candidate graph, including historical WP telemetry. [Historical source provenance](../../test/fixtures/audit-20261101/historical-scoring-provenance.json) records the source commit, each input SHA-256, build entry and esbuild version; final uncompressed bundle SHA-256 is `28846fc6779ecb003e9a7bfde7e4c1e98ad862941fd34e2408a2bb5d4ea5f826`. The [rebuild script](tools/freeze-historical-scoring.mjs) validates all 35 source module hashes before bundling the original tree. The independent Phase 3.1 oracle also resolves its three dependencies to that same frozen graph. Exact archived review regeneration passes **4/4** tests. The historical prepare helper retains exact input immutability and competition identity checks. Current scoring tests continue to use the current graph.

Where a former exact-current assertion intentionally changes, the test still pins the original source's numeric baseline and verifies unchanged current-state/live/event-history components, then attributes the new score solely to the corrected trajectory term. One audited archived MLB checkpoint (`4019080241601010001`) changes 48→47: base 42, live bonus 0 and event history 6 remain identical; removal of unsupported duration yields trajectory −0.824162 instead of 0. MLB extraction parity permits only the explicitly covered late live reachable-run scenarios to differ and still checks current browser/Node equality, unchanged historical components and all unrelated old cases.

## Limitations

Actual score observations support unchanged-score intervals; they are not proof of uninterrupted provider polling. Positioned WP is still time-interpolated inside its observed endpoint interval under the established model; internal delivery gaps and sample density remain separately limited by the existing confidence fields. Neither process invents an opening score or a missing scoring transition.

The new MLB opportunity semantics intentionally affect all supported late reachable-run states, not only the audited down-four example. The complete replay and release gates must inspect those wider but directly attributable differences. No experiment was enabled, no global coefficients changed, no notifications were sent, and this work alone is not a deployment claim.

Replay attribution must account for interactions: restoring trajectory alone can free or consume capacity used by an unchanged sport floor, and restoring the MLB or former CFB policy alone can still leave a trajectory delta. Combined restorations of trajectory plus the relevant sport mechanism are the appropriate baseline equality check. A one-at-a-time ablation is diagnostic, not proof that every remaining numerical difference is independent.

## Final replay attribution

The final fingerprinted replay and ablations supersede all interim replay counts. [Per-checkpoint JSON](replay-differences.json) and [concise CSV](replay-differences.csv) contain **79 changed ratings out of 1,997 checkpoints**, with **zero unexplained changes**. These are reconstructed causal prefixes from six archived games, not original live arrival streams.

| Sport | Checkpoints | Changed ratings |
|---|---:|---:|
| NFL | 220 | 0 |
| CFB | 177 | 12 |
| MLB | 385 | 67 |
| NHL | 312 | 0 |
| NBA | 499 | 0 |
| NCAAB | 404 | 0 |

The 12 CFB differences are C1. MLB has 59 F3-only differences, five C2-only differences and three affected by both F3 and C2. The JSON retains every individual and combined restored rating, so these labels are not presented as independent additive point contributions. All applicable combined restorations reproduce the original rating. All changed rows record `intentional:true`, `weightsChanged:false` and `modelChanged:true`.

The largest CFB decrease is **22 to 3 (-19)** at game `401856723`, play `401856723835`, Q4 0:11: restoring C1 returns 22 while restoring trajectory alone leaves 3. The largest MLB increase is **62 to 87 (+25)** at game `401908024`, play `4019080241205010001`, inning 7: restoring MLB returns 62, restoring trajectory alone yields 89, and restoring both returns 62. This exposes the current-tension/history interaction directly.

Baseline and candidate each have **zero sequential-to-repeat rating differences**. Each separately has 169 fresh-to-sequential differences (NBA 65, NCAAB 104), with 187 rejected updates. Those pre-existing stateful differences remain distinct from the 79 cross-version sequential differences; the offline fresh-input ablations do not claim to explain update-rejection behavior.

The comparator validates the recorded candidate source manifest against every restoration, each restoration's baseline manifest against the original replay, and matching runner hashes. All four ablations pass those checks. Its source-manifest scope covers all scoring modules, Worker source and the two trajectory policies; the root report supplies the complementary unchanged-dependency manifest. No complete dependency-graph fingerprint is claimed by this comparator. The seven comparator regression tests pass, including mismatched source/runner rejection, unknown-attribution handling, input-boundary checks and nonlinear restoration controls. Repeated generation produces identical artifact bytes. Source replays and their exact SHA-256 hashes are recorded in the JSON provenance.

## First rollout and rollback

The first release, commit `c138f5f0e6761d3169ea54f2bcc8a15dccefaa4c`, failed the canonical-feed consistency gate after repeated refresh deadlines. It was rolled back through commit `30cd7c437a5f94404fa5cffa8179882a8b96efba`, restoring the exact audited source `8ad7a0096307e0ab9038dbcba60f0e965e9bcfaa`, and Worker version `8bb6ab4e-ff5b-43ca-bae4-493371b20d9e`. This remains part of the release history regardless of any later successful attempt.

The [first smoke record](production-smoke-notes.md) distinguishes the failed gate from permanent publication failure: later-reviewed logs show a candidate publication at approximately 04:10:23.611 UTC, followed by a successful refresh, before the rollback completed. Representative candidate details were not validated from those publications. Baseline health and a fresh baseline feed were subsequently verified. The bounded nonlive enrichment migration addresses the observed scheduling problem; its simulated budget tests are not production latency measurements.

After the migration fix and final model-reuse guard froze, the six-sport candidate replay and all four ablations were rerun. Their final recorded source fingerprint is `553534784f3a1dca4416e8be21928a703b2ec1d142a295670cf855798e190931`; all source/baseline/runner checks pass. The 79 attributed baseline differences above remain unchanged. Direct comparison with the first release's committed replay verifies **zero changes across all 1,997 fresh, sequential and repeated ratings**; see [second-release verification](second-release-replay-verification.json). Jobs spanning the last source edit were rejected or superseded and are not used as final provenance. This replay result confirms unchanged scoring outputs for the reviewed archive; it does not by itself certify the second production rollout.
