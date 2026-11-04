# Frontend publication plan

Deployment approval is recorded. Local visual acceptance is complete for the representative coverage documented in [README](README.md); the browser interruption is resolved. Final paired-logo search checks passed at 1440px and 320px after the last CSS correction. The final build and 23 focused UI/logo tests pass. Publication has not yet occurred from this branch.

1. Preserve the scorer SHA-256 `aa5ee805be4401866607f0c25a1f98ebf756f1fc04a19e5097b71cadb1a09622` and the [protected-file verification](protected-hashes.json). Rebuild and recheck affected surfaces if additional source changes become necessary.
2. Fetch GitHub `main` again. The last verified remote head is `5b7f797c879d36826d08b2ea31a6fecd18ef092c`. Incorporate any intervening changes before release without overwriting them.
3. Stage only the frontend, related tests and local QA harness listed in README, plus the exact valid review artifact paths in [release-evidence.txt](release-evidence.txt). Inspect the staged diff. Do not use an unrestricted add: the Windows checkout has unrelated line-ending status noise in protected files. The root suite's reproduced baseline failure is disclosed in [baseline-failure.md](baseline-failure.md).
4. Commit, then push without force to `https://github.com/mmueller091/sports-radar.git` on `main`. Local `origin` points to another local checkout and is not the publication destination.
5. Verify the existing `Deploy SlateMeter to GitHub Pages` workflow succeeds for that exact commit. Its unchanged workflow builds `dist` and deploys Pages only. Verify the production revision and inspect the live UI after deployment.

No Cloudflare Worker deployment, scoring recalibration, data-provider change, live-audit change, notification change, new hosting service or dependency is part of this release.
