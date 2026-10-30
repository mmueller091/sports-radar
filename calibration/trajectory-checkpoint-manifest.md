# Proposed experimental checkpoint staging manifest

Base commit: `e29a929603e7847a6a9a21590f46a22f12074cad`. Apply the following overlay to that complete tracked tree. **Do not stage automatically.**

All listed modified-file hunks are intentional dependencies; there are no partial-file exclusions. Production/default/completed behavior and policy constants remain frozen. The validation tree uses archived HEAD content plus this explicit overlay, never unstaged files outside its root.

Action | Path | Exact hunk scope | Required role
--- | --- | --- | ---
modify | `rating-core.js` | `@@ -30 +30 @@; @@ -850,12 +849,0 @@; @@ -866,37 +854,10 @@` | Phase 2 dependency: aggregateLiveBonus import and equivalent live aggregation call; both hunks required together with pressure.js.
modify | `scoring/shared/pressure.js` | `@@ -2,0 +3,39 @@; @@ -49 +88 @@` | Phase 2 dependency: aggregateLiveBonus implementation and export; preserve existing production aggregation.
modify | `scoring/shared/basketball.js` | `@@ -41,0 +42 @@; @@ -42,0 +44 @@; @@ -60,4 +62,6 @@; @@ -81,0 +86 @@` | Phase 2 dependency: track genericTimePoints/reasons, preserve production points, expose candidatePoints split.
modify | `scoring/shared/probability.js` | `@@ -71,0 +72 @@` | Telemetry correction: NHL positioned WP uses elapsed provider clocks.
modify | `scoring/shared/trajectory.js` | `@@ -33,0 +34,2 @@` | Telemetry correction: NHL scoring moments use elapsed provider clocks.
modify | `scoring/shared/history.js` | `@@ -15 +15,2 @@; @@ -386,0 +388 @@; @@ -727,0 +730,5 @@` | Phase 3.1: optional ownership argument, suppress sustained factor only in explicit live path, inject trajectory before caps.
modify | `scoring/sports/nhl.js` | `@@ -495 +495 @@; @@ -556 +556,2 @@` | Phase 3.1: optional ownership argument and sustained replacement before NHL history/headroom caps.
modify | `calibration/shadow-candidate.cjs` | `@@ -4,0 +5,3 @@; @@ -7,0 +11,2 @@ const {aggregateLiveBonus} = require('../scoring/shared/pressure.js');; @@ -249,3 +254,8 @@ function candidateBaseForPolicy(core,game,prepared,policy) {; @@ -253,0 +264,2 @@ function finishCandidateGameRating(core,game,prepared,base,live) {; @@ -270 +282 @@ function finishCandidateGameRating(core,game,prepared,base,live) {; @@ -278 +290,9 @@ function candidateGameRating(core,game,competition,summary,policy=null) {; @@ -311,0 +332 @@ module.exports = {` | Phase 2/3/3.1 integration: explicit policy dispatch, batched finalization, off default retained; all current hunks required.
modify | `scripts/shadow-candidate-report.mjs` | `@@ -451,9 +451,2 @@ function rowForCandidate(prepared,candidate) {; @@ -521,0 +515,7 @@ export function evaluatePreparedCheckpointPolicies(prepared,policies,{verifyInpu` | Replay dependency: retain full telemetry/scoring diagnostics and batched trajectory checkpoint evaluation.
modify | `test/live-phase.test.js` | `@@ -57 +57 @@ test('NBA 2OT flows through card, accessibility, explanation, history, detail an` | Full-suite dependency: load recordedTimelinePoints in the existing UI fixture VM; required test helper, no scoring change.
modify | `test/trajectory.test.js` | `@@ -7,0 +8,17 @@ const {analyzeTrajectory} = require('../scoring/models.js');` | Telemetry regression for NHL elapsed clocks, coverage ordering and history duration.
add | `calibration/trajectory-policy.cjs` | `entire new file` | Frozen Phase 3 policy definitions, confidence treatment and trajectory calculation.
add | `calibration/trajectory-archetypes.mjs` | `entire new file` | Phase 3 synthetic histories through authoritative telemetry.
add | `scripts/trajectory-calibration.mjs` | `entire new file` | Phase 3 replay, summaries and report renderer; imported by Phase 3.1 tooling.
add | `calibration/output/trajectory-calibration.json` | `entire new file` | Preserved Phase 3 results consumed by regression tests.
add | `calibration/trajectory-calibration-report.md` | `entire new file` | Preserved Phase 3 experimental report, not renamed.
add | `test/trajectory-calibration.test.js` | `entire new file` | Phase 3 grid/artifact/summary regressions.
add | `test/trajectory-shadow.test.js` | `entire new file` | Phase 3 opt-in, caps, maturity, confidence and batch regressions.
add | `calibration/trajectory-live-policy.cjs` | `entire new file` | Frozen Phase 3.1 history ownership and current-urgency guardrails.
add | `calibration/trajectory-live-fixtures.mjs` | `entire new file` | Preserved Phase 3.1 pairs, NHL headroom, revival and missing-current-WP fixtures.
add | `scripts/trajectory-live-calibration.mjs` | `entire new file` | Phase 3.1 direct replay, comparisons and reporting; no broad replay rerun in this task.
add | `calibration/output/trajectory-live-calibration.json` | `entire new file` | Preserved Phase 3.1 replay results and validation provenance.
add | `calibration/trajectory-live-calibration-report.md` | `entire new file` | Preserved Phase 3.1 report, not relabelled.
add | `calibration/trajectory-history-ownership.md` | `entire new file` | Ownership audit and required pre-existing helper dependencies.
add | `test/fixtures/phase31-shadow-before.cjs.gz` | `entire new file` | Frozen pre-Phase-3.1 shadow orchestration oracle.
add | `test/helpers/phase31-oracle.cjs` | `entire new file` | Loads frozen oracle with candidate-local shared dependencies.
add | `test/trajectory-live.test.js` | `entire new file` | Phase 3.1 targeted semantics, off parity, unchanged completed path, direct/batch checks.
add | `test/trajectory-live-calibration.test.js` | `entire new file` | Phase 3.1 artifact, equal-game, 95/99, ownership and ablation checks.
add | `calibration/trajectory-checkpoint-fixtures.mjs` | `entire new file` | New unsaturated matched fixtures and historical thinning with fixed valid current WP.
add | `scripts/trajectory-review-pack.mjs` | `entire new file` | Fixed-checkpoint review generator, explicit policy provenance and complete diagnostics.
add | `calibration/trajectory-reviewer-pack.md` | `entire new file` | Blind 22-case review pack; blank human answers; no policy outputs.
add | `calibration/trajectory-diagnostic-key.json` | `entire new file` | Separate policy/contribution key, focused results and thinning comparisons.
add | `calibration/trajectory-focused-validation.md` | `entire new file` | Compact unsaturated results with retained earlier event differences.
add | `test/trajectory-checkpoint.test.js` | `entire new file` | Focused semantics, causal review projection, reproducibility and checkpoint off parity.
add | `scripts/prepare-trajectory-checkpoint.py` | `entire new file` | Reproducible explicit-overlay isolation builder; never stages content.
add | `calibration/trajectory-checkpoint-manifest.json` | `entire new file` | Machine-readable proposed staging manifest and source hashes.
add | `calibration/trajectory-checkpoint-manifest.md` | `entire new file` | Human-readable exact staging paths, hunks and dependency audit.

## Dependencies already committed at the base

- all scoring modules and sport models at baseCommit
- alerts-worker/src/game-model.js and display/provider adapters
- calibration/helpers.mjs, expectations.json and context-overrides.json
- scripts/current-tension-calibration.mjs and Phase 2 JSON/report/tests
- test/helpers/scoring-source.cjs, index.html, sw.js and browser fixtures
- 107 tracked test/fixtures/real-games/*.json files and compressed parity oracles
- alerts-worker/package.json and package-lock.json; npm ci required inside the candidate

The current rating-core.js import/call hunks, pressure.js helper/export hunks and basketball.js generic-time/candidate split are included together. The live-phase test helper hunk is included because the complete UI test fixture needs recordedTimelinePoints; it is not a scoring change.

## Deliberate exclusions

No current non-ignored dirty change was found outside this manifest.

Ignored work/, alerts-worker/node_modules/, .wrangler/, .wrangler-config/, temporary logs, and the isolated validation receipt are not proposed for staging. Install dependency packages from the committed lockfile in the isolated tree. No local package directory is reused. Unchanged HEAD content needs no staging.

The initial text scan flagged relative imports inside embedded payload strings in the four existing apply-recorded-excitement-history*.mjs migration scripts. Inspection confirmed these are generated Worker/test imports, not root-level runtime dependencies. Their snapshot-history.js and sports-feed.js targets are already committed. Only those template payload scans are excluded; the scripts remain in archived HEAD content.

## Assembly and verification

Run `python scripts/prepare-trajectory-checkpoint.py` to create a new isolated temporary tree. The builder reads git archive and copies only the paths listed above; it does not reset, stash, clean, stage, commit, or create a worktree. Run npm ci against the candidate lockfile, clear RATING_CORE_PATH/NODE_PATH/NODE_OPTIONS, and run tests with the candidate as cwd. Source hashes and exact hunk headers are in the JSON manifest. No scoring grid or promotion is part of this checkpoint.
