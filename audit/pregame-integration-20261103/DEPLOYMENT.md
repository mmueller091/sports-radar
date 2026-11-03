Production deployment preparation — not executed

Gate: successful desktop/phone verification documented against the final candidate. If the authorized browser workflow is blocked, preserve the integration branch and follow MANUAL-QA.md. No production deployment, merge to main, push to the deploying branch, recurring AI job, migration or Phase 2 integration is part of a blocked release.

The visual gate passed on November 3, 2026 in Chrome 156.0.8078.80; see [VISUAL-QA.md](VISUAL-QA.md). The release is prepared and remains undeployed. A fresh origin/main fetch after visual QA still resolves to the recorded production baseline. The final documentation commit does not change the tested or visually inspected runtime code.

After the gate passes, first fetch origin/main again. It must still match the recorded production baseline, or the candidate must be rebased/reintegrated and affected checks rerun. Keep the exact released commit and previous production commit `31f3eb26fbd3c3fc083f7828b2bb93d181fdb888` for rollback.

The current release has two independently deployed components: the static Pages site and the existing Cloudflare Worker. Main pushes trigger `.github/workflows/deploy.yml`, which builds versioned static assets. The Worker is deployed from `alerts-worker` with the existing Wrangler configuration and bindings. No database migration is required. The candidate Worker bundles to 790.71 KiB (182.80 KiB gzip) in the recorded dry run.

Build the static site with ASSET_REV set to the exact release commit. Reconfirm a clean worktree and no Phase 2 files/ancestry. Deploy the Worker and verify health retains the same model/policy and alert-delivery version, then promote the same reviewed candidate to main for Pages. Confirm the Pages workflow succeeds and HTML/service-worker revisions refer to that release. Do not override a concurrently changed main branch or deploy from the original dirty checkout.

Preparation commands, from the integration worktree:

```powershell
git status --short
git fetch origin main
git rev-parse origin/main
$releaseCommit = git rev-parse HEAD
$env:ASSET_REV = $releaseCommit
node scripts/build-site.mjs
Push-Location alerts-worker
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir ../work/worker-dry-run
Pop-Location
```

Actual release commands below are intentionally not executed. Before running them, confirm origin/main still equals `31f3eb26fbd3c3fc083f7828b2bb93d181fdb888`, preserve the currently deployed Worker version for rollback, and use the reviewed candidate SHA. The push must remain a normal fast-forward push; do not force it.

```powershell
Push-Location alerts-worker
node node_modules/wrangler/bin/wrangler.js versions list
node node_modules/wrangler/bin/wrangler.js deploy
Pop-Location
# Verify Worker health and unchanged model/policy before this Pages promotion.
git push origin HEAD:main
```

Production smoke checks: feed and game detail return valid canonical games; desktop and phone show the reviewed narratives; scores/records agree between card and Game Center; live and completed games still use their existing explanations; watchlist persists; no unexpected console failures. Do not send real notifications as a smoke test. Health remains available before any new research pass. At the next scheduled pass, coverage diagnostics must correspond to the same research timestamp and remain within the documented selection/provider/AI limits. Link eligibility is not a promise that a deduplicated public story is already displayed.

Operational expectations: no additional feed dependency or recurring prose inference; unchanged 8,000-neuron reservation ceiling, request caps, cron schedule and scoring model. Research priorities can consume more of the existing allowance and discover different legitimate contextual inputs. Inspect actual returned usage and coverage before considering any further AI or Phase 2 work. Roll back both static and Worker releases to their prior versions if release-specific failures appear; preserve data and investigate rather than deleting historical context or calibration artifacts.
