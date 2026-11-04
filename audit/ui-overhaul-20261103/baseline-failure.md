# Baseline replay failure and protected-code verification

Baseline: `5b7f797c879d36826d08b2ea31a6fecd18ef092c`.

The sole failing root regression also fails in a clean, detached, sparse checkout of that exact commit at `work/baseline-replay-5b7f797`. `git status --porcelain` is empty there. No UI changes were copied into the baseline checkout.

Command: `node --test work/baseline-replay-5b7f797/test/replay-input-comparison.test.js`.

Result: exit 1; the test file fails during import because its `git show` exits 128. The hardcoded historical commit `1bf1c66703a097c97fcde55b4c7af13055c3c593` does not contain `calibration/trajectory-current-checkpoint-manifest.json`. Git history shows the manifest was introduced at `88f5b40b3d90aeac7f0c266c77f49fa6519c41e7`. See [the pristine baseline log](baseline-replay.log).

The replay test's SHA-256 is identical in HEAD, the clean baseline checkout, and the UI working tree:

`151922b3577864dda6987e987b2b64a201d4e5b88f43b267ea4378f6082b5e57`

The UI working tree's complete root run passed **1,564 of 1,565 tests**, with only this same import failure. See [the full log](tests-root.log). Legacy scoring/watchlist/timeline fixtures passed; the 30 provenance and NHL graph checks passed after restoring original repository bytes for line-ending-sensitive inputs.

An independent esbuild run from the pristine baseline produced a scoring bundle byte-for-byte identical to `dist/scoring-runtime.js`. Both SHA-256 values are:

`aa5ee805be4401866607f0c25a1f98ebf756f1fc04a19e5097b71cadb1a09622`

[Protected hashes](protected-hashes.json) record 151 protected scoring, provider, Worker, notification, Game Center, and calibration source files. All canonical contents match HEAD. Raw hashes are also recorded: existing Windows CRLF checkout differences are explicitly distinguished from content changes. The generated scoring bundle comparison is exact, without newline normalization.

Final `app.js` diff review found presentation changes only: logo contrast hooks, verified trend icons, verified NHL badge formatting, search appearance, schedule spotlight classification, Game Center arrangement, break-state clock display, slate placeholders, DOM reuse, stable visible ordering, and count-scope labels. Rating formulas, the heatmap mapping, scoring inputs, provider URLs, polling cadence, notification behavior, and timeline evidence calculations are unchanged. No protected files or historical-test repair are part of this UI release.
