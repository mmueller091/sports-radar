# NHL pressure implementation review — October 31, 2026

Historical local review. See the [statistics release record](nhl-statistics-release.md) for the current release's 662-test validation, unchanged production scoring baseline and visual-verification limitation.

Local implementation is complete. **Production excitement scoring is unchanged; the experiment is disabled and nothing has been published.** Existing NHL scoring coefficients and the active policy/model versions have no diff. No push, release, deployment, migration or rating-history rewrite ran.

Read the [scoring/data audit and integration design](nhl-advanced-pressure-audit.md), [comparison tables](nhl-pressure-results.md), and [complete rating histories](output/nhl-pressure-comparison.json).

## Implemented

- NHL Game Center Team Stats now includes full-game and confirmed 5-on-5 Corsi/Fenwick counts and shares, rolling five-minute attempts, and recent trailing-side pressure from NHL public PBP.
- Worker details map ESPN games to NHL identities using the public schedule, reuse existing cache/lease infrastructure, bound optional enrichment to 2.5 seconds, and mark unavailable, partial or stale data.
- The reducer rebuilds complete snapshots so delayed, duplicate, corrected and removed events cannot silently accumulate. Shootouts are excluded from attempts while final shootout scores still reconcile.
- The offline experimental entry requires `nhlAdvancedPressure:true`. It replaces both old shot-pressure entry points with one +0–4 component. It preserves existing close-game target anchors, margin/time/manpower rules and history ownership. No production consumer imports the experiment.

## Comparison

Eight historical NHL public ledgers produced 3,087 reconstructed rating checkpoints. Delayed/corrected delivery is tested separately through clearly labeled injected snapshots.

| Measure | Result |
| --- | --- |
| Changed checkpoints | 820 of 3,087 |
| Rating difference | -3 to +2; mean -0.156 |
| Live late one-goal checkpoints | 43 of 99 changed; mean -0.293 |
| Live blowout checkpoints | 459; all unchanged |
| Peak rating differences | -1 to +2 |
| Final ratings | All eight unchanged |
| Retained history-point differences | Zero |
| Maximum experimental pressure observed | +4 |

The principal redundancy was recent shot pressure being represented both as its own +0–7 component and as half-pressure inside the situation target. Corsi and Fenwick overlap too, so full-game possession measures are displayed rather than separately rewarded. PP, goalie-pull leverage, goal drama and sustained history retain their existing owners.

Recommendation: retain the +4 cap, PP attempt weight .65, empty-net weight .5 and OT half-weight. Review changed moments before any activation; broaden regular-season and genuinely observed live-correction coverage. Six Finals games frequently hit the 99 cap, and reconstructed prefixes cannot establish historical arrival timing, market context or the exact ratings users saw at the time.

## Verification

| Check | Result |
| --- | --- |
| `node --test test/*.test.js alerts-worker/test/*.test.js` | **600 passed, zero failed/skipped** |
| Focused new tests included in suite | 23 passed |
| `node scripts/nhl-pressure-report.mjs` | Eight ledgers, 3,087 checkpoints; final report generated |
| `node test-score.js` | Scoring, watchlist and timeline fixtures passed |
| `node scripts/build-site.mjs` | Final local browser assets built |
| `git diff --check` | Passed |
| Browser/Worker policy parity and Worker bundling | Passed within full suite |
| Actual Game Center route/cache and unchanged stored feed | Passed within full suite |
| Desktop/mobile visual QA | Incomplete; browser connector unavailable and native automation stopped because Chrome's current URL could not be verified |

The full suite/build needed elevated local filesystem access because sandboxed esbuild could not read parent directories. The successful final suite used no skipped checks. Local logs are in ignored `work/nhl-pressure/tests-final.log`. The preview server was stopped.

## Main source files

| File | Purpose |
| --- | --- |
| `scoring/nhl-advanced.cjs` | Public-PBP statistics, strength splits, windows, correction handling |
| `alerts-worker/src/providers/nhl.js` | Schedule mapping and Game Center enrichment |
| `alerts-worker/src/sports-feed.js` | Optional NHL enrichment only in `gameDetails` |
| `app.js` | Statistics panel in the NHL Team Stats tab |
| `calibration/nhl-pressure-experiment.cjs` | Disabled experimental pressure and overlap replacement |
| `calibration/nhl-public-replay.mjs` | Historical contract adapter and correction simulations |
| `scripts/nhl-pressure-report.mjs` | Offline comparison and complete history artifacts |
| `scripts/capture-nhl-pbp.mjs` | Explicit public-source fixture capture |
| `test/nhl-advanced.test.js`, `alerts-worker/test/nhl-provider.test.js` | New statistics, scoring, replay, UI and route checks |
| `test/fixtures/nhl-public/` | Eight public ledgers with source URLs and SHA-256 sidecars |

Future scoring activation requires review and a new policy/model identity under the existing history-boundary workflow. No activation was performed.
