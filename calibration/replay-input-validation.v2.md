# Replay repair validation v2

## Files changed in this task

- `scripts/replay-inputs.mjs`
- `scripts/replay-inputs.historical.mjs`
- `scripts/replay-input-comparison.mjs`
- `scripts/shadow-candidate-report.mjs`
- `scripts/trajectory-calibration.mjs`
- `scripts/trajectory-live-calibration.mjs`
- `scripts/trajectory-review-pack.mjs`
- `scripts/trajectory-review-correction.mjs`
- `test/replay-inputs.test.js`
- `test/replay-input-comparison.test.js`
- `test/shadow-candidate-report.test.js`
- `test/trajectory-checkpoint.test.js`

New artifacts:

- `calibration/replay-input-rules.v2.md`
- `calibration/replay-input-comparison.v2.md`
- `calibration/output/replay-input-scope.v2.json`
- `calibration/output/replay-input-comparison.v2.json`
- `calibration/output/replay-input-states.v2.json.gz`
- `calibration/trajectory-diagnostic-key.replay-v2.json`
- `calibration/trajectory-reviewer-pack.replay-v2.md`

## Validation

Final applicable suite: 527 tests, 527 passed, 0 failed, 0 skipped.

- Focused chronology/transition regressions passed before the bounded evaluation. Historical presentation/provenance tests also passed without replacing their frozen expected hashes.
- `node --test test/*.test.js alerts-worker/test/*.test.js` (one final full run; see `work/replay-full-suite.log`). This includes browser/Node API parity, Worker adapter parity, production/completed scoring regressions and Worker bundle checks.
- The full run passed 526/527 tests; esbuild could not read a parent directory under the sandbox. The sole failed Worker bundle test passed when rerun with the necessary read access: `node --test --test-name-pattern="Worker entry bundles" test/scoring-modules.test.js` (see `work/replay-worker-bundle-recheck.log`). All 527 distinct tests are now passing; no test expectations were weakened to resolve the access failure.
- `node test-score.js` (see `work/replay-smoke.log`).
- `node --check` passed for all 12 changed/new JavaScript modules.
- `git -c core.whitespace=cr-at-eol --no-pager diff --check` passed; separate whitespace inspection covers new files.
- All 53 initially hashed scoring, policy, production and frozen historical files retain their exact initial bytes.
- Scorer parity on identical inputs: 40163 batches matched the frozen trajectory-off oracle. Different repaired inputs are intentionally allowed to produce different outputs.
- One initial partial comparison was discarded after review found that stripping all prior-drive results would erase supported punt history. The corrected accepted-terminal reconstruction and period-boundary regressions passed before the single completed final comparison. No partial-run results were delivered.
- No scoring grid, policy selection, staging, commit, push, deployment or promotion.

## Results and limits

24562 old checkpoints; 23767 corrected checkpoints. 0 added, 2 removed by deduplication, 793 excluded by unresolved input contradictions.

Named anchors (Phase 2 / live-owned-45-95 / competitive floor, before -> after):

- R05: 99 -> 66; 99 -> 66; floor 35 -> 0. excluded: current football situation unresolved.
- R10: 87 -> 87; 87 -> 87; floor 0 -> 0. excluded from confident judgment: incomplete earlier history.
- R21: 84 -> 51; 82 -> 45; floor 32 -> 0. excluded: current football situation unresolved.

Exact affected game/state identities, reconstructed score/situation/WP/history deltas, and exclusion reasons are in `output/replay-input-scope.v2.json`. Scores and threshold crossings, equal-game and checkpoint-weighted summaries, exact-99 counts, and decisive-state/floor changes are in `output/replay-input-comparison.v2.json`; every per-state comparison is in the compressed states artifact.

Remaining production exposure is unchanged: shared football scoring can trust malformed possession/field-position inputs from callers outside this offline validator. A shared validated-current-situation contract is proposed separately in `replay-input-rules.v2.md`; no production guard was enabled.

The old staging manifest is historical evidence only. New source/artifact hashes and preservation evidence are in `output/replay-input-provenance.v2.json`.

## git --no-pager status --short

This includes pre-existing unrelated work. Only the files listed above and new replay artifacts were changed for this task. Nothing was staged.

```text
 M calibration/shadow-candidate.cjs
 M rating-core.js
 M scoring/shared/basketball.js
 M scoring/shared/history.js
 M scoring/shared/pressure.js
 M scoring/shared/probability.js
 M scoring/shared/trajectory.js
 M scoring/sports/nhl.js
 M scripts/shadow-candidate-report.mjs
 M test/live-phase.test.js
 M test/shadow-candidate-report.test.js
 M test/trajectory.test.js
?? calibration/output/replay-input-comparison.v2.json
?? calibration/output/replay-input-provenance.v2.json
?? calibration/output/replay-input-scope.v2.json
?? calibration/output/replay-input-states.v2.json.gz
?? calibration/output/trajectory-calibration.json
?? calibration/output/trajectory-live-calibration.json
?? calibration/replay-input-comparison.v2.md
?? calibration/replay-input-rules.v2.md
?? calibration/replay-input-validation.v2.md
?? calibration/trajectory-archetypes.mjs
?? calibration/trajectory-calibration-report.md
?? calibration/trajectory-checkpoint-fixtures.mjs
?? calibration/trajectory-checkpoint-manifest.json
?? calibration/trajectory-checkpoint-manifest.md
?? calibration/trajectory-diagnostic-key.corrected.json
?? calibration/trajectory-diagnostic-key.json
?? calibration/trajectory-diagnostic-key.replay-v2.json
?? calibration/trajectory-focused-validation.md
?? calibration/trajectory-history-ownership.md
?? calibration/trajectory-live-calibration-report.md
?? calibration/trajectory-live-fixtures.mjs
?? calibration/trajectory-live-policy.cjs
?? calibration/trajectory-policy.cjs
?? calibration/trajectory-review-correction-findings.md
?? calibration/trajectory-reviewer-pack.corrected.md
?? calibration/trajectory-reviewer-pack.md
?? calibration/trajectory-reviewer-pack.replay-v2.md
?? scripts/prepare-trajectory-checkpoint.py
?? scripts/replay-input-comparison.mjs
?? scripts/replay-inputs.historical.mjs
?? scripts/replay-inputs.mjs
?? scripts/trajectory-calibration.mjs
?? scripts/trajectory-live-calibration.mjs
?? scripts/trajectory-review-correction.mjs
?? scripts/trajectory-review-pack.mjs
?? test/fixtures/phase31-shadow-before.cjs.gz
?? test/helpers/phase31-oracle.cjs
?? test/replay-input-comparison.test.js
?? test/replay-inputs.test.js
?? test/trajectory-calibration.test.js
?? test/trajectory-checkpoint.test.js
?? test/trajectory-live-calibration.test.js
?? test/trajectory-live.test.js
?? test/trajectory-review-correction.test.js
?? test/trajectory-shadow.test.js
```
