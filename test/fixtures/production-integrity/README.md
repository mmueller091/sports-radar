# Production integrity evidence

Captured from the public Sports Radar Worker and its existing ESPN summary
source on November 1–2, 2026 UTC. Each sport/event gzip contains the public
feed game, provider event/summary, Game Center detail/history and capture time.

The nine cases are OKST–ISU, Miami–UNC, Chiefs–Broncos, Notre Dame–Villanova,
Colts–Jaguars, Celtics–Magic, Patriots–Dolphins, Oilers–Rangers and Cardinals–Cowboys.
The provider identifier for men's college basketball is NCAAB.

`anomaly-snapshots.json.gz` contains selected existing D1 observations at the
reported clocks, including their original model versions and normalized state.
Evidence caches were already excluded by production persistence.

The additional `NFL-401873033-final.json.gz` and
`NFL-401873033-prematch.json.gz` resources capture the production-verified
completed-to-prematch provider reversion found during deployment checks.
The final resource came from Game Center (whose header is canonicalized);
the prematch resource is the exact cached provider payload read from D1.
Neither includes private subscription data.

`before-runtime.cjs.gz` is the esbuild CommonJS bundle of
`scripts/finish-audit-entry.mjs` at production commit
`359d2b8b65dd03e812a7ee8295eb69b5364c3e77`.
It is the independent, unchanged baseline for the before/after comparison.

Run `node scripts/production-integrity-report.mjs` for the comparison and
`node scripts/audit-production-integrity.mjs` for original history transitions.
The capture helper expects the source public feed in `work/feed-before.json`;
it is a capture utility, not a requirement for offline tests.

Original raw summaries at each old snapshot were not retained. The test helper
reconstructs live input from captured plays limited to the recorded clock,
score and provider play ID, excludes later box scores/recaps, and anchors win
probabilities to those plays. Reconstructed input ratings can differ from the
original historical rating. They demonstrate the missing-input failure and
its correction; they do not retroactively replace historical ratings.
