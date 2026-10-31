# Completed-game retention and CFB late-drive audit

Model: `2026-10-31.finish-feasibility.1`. Immediate production baseline: `dc201f6d912cb822592a07af52ae472b311aa6ef`.

## Findings and implementation

- CFB used different retention rules above and below an eight-point final margin. A wider result could reach the competitive-path floor without a substantial comeback, while a close result needed a 14-point comeback. One continuous margin-decay curve now uses verified competitive duration, late relevance, lead changes and comeback magnitude. Existing OT and upset awards consume the floor rather than adding to it. Incomplete or inconsistent ledgers cannot establish the path floor.
- As regulation expires, CFB gradually retains the already verified completed path during the final two minutes. It does not reduce a threatening drive's immediate rating. Matched final-score ledgers at 0:01 and 0:00 agree with the completed rating within two points, including Arizona–Texas Tech and both reported FCS games. Missing history is not fabricated to meet this continuity check.
- CFB's late situation floor previously treated sufficient drive time as sufficient feasibility. The shared feasibility now considers third/fourth-down conversion distance, remaining yards, timeouts, clock budget and the additional conversion needed when trailing by eight. The existing possession/runoff model still prices multiple required possessions and the opportunity to regain possession. Feasibility attenuates existing state, upset and situation contributions; it creates no additional urgency award and does not substitute win probability for excitement. Sparse distance data remains finite and does not invent a down or distance.
- Tampa–Nashville already received the nine-point shootout award. Its completed floor counted a generic finish award that NHL's `handlesFinish` flag subsequently suppressed. The floor now counts only awarded contributions. A completed summary can also supply missing shootout/OT status, with the result contribution awarded once.
- NHL one-goal finals can retain verified late tied/one-goal duration, comebacks, lead changes and trailing-team shot pressure. A reconciled, complete goal ledger and substantial late competition are required. Garbage-time one-goal finishes and incomplete ledgers do not receive this floor. Regulation, ordinary OT, playoff OT depth and shootouts retain separate rules; the experimental advanced-pressure feature remains disabled.

## Listed examples

| Game / situation | Recorded old rating | New rating |
| --- | ---: | ---: |
| VMI 10, Chattanooga 24 | 67 | 45 |
| Indiana State 23, Northern Iowa 45 | 66 | 26 |
| Arizona 26, Texas Tech 34 | 56 | 82 |
| Northwestern trailing 26–34, 2:00, third-and-19 at own 20 | 90 | 63 |
| Buffalo 3, Los Angeles 2 | 48 | 65 |
| St. Louis 5, Detroit 4 | 53 | 65 |
| Tampa Bay 4, Nashville 5, shootout | 55 | 69 |
| Chicago 4, Boston 5, OT | 74 | 74 |

The Northwestern checkpoint uses the verified third-and-19 state recorded at 2:04, advanced to the 2:00 timeout with no intervening play. D1's captured rating was 90 at 2:00. Reconstructed provider inputs produce 99 under the frozen old scorer and 63 under the new scorer: archived public plays do not reproduce every contemporaneous market, baseline and timeout input. The observed and reconstructed old numbers are deliberately distinguished. No model receives a game ID or target rating.

## Evidence and checks

Eight compressed provider fixtures and their original recorded rating histories are retained under `test/fixtures/finish-audit/`. Their capture times, sources and hashes are in that directory's manifest. The independent bundled old scorer is `test/fixtures/scoring-before-finish.cjs.gz`.

`scripts/finish-audit-report.mjs` causally replays every accepted provider checkpoint with the old and new scorers and records the original observed timeline separately in [the comparison JSON](output/finish-audit-20261031.json). Rejected chronology and shootout-attempt records remain excluded. Replays omit unavailable historical manpower and cannot reconstruct unrecorded timeout/market changes. Controlled final-status probes use the same final score and verified history on each side of the status boundary; they do not claim to be captured live observations. The UI continues to show actual recorded history, including each point's original model version.

Permanent regressions cover these exact failures, the seven/eight/nine/ten-point neighborhood, terminal continuity, absent/partial evidence, sparse distances, genuine short-field winning drives, low-WP threats, defensive games versus stagnation, NHL pressure versus garbage time, shootout factor reconciliation, browser/Worker parity, and unchanged archived outputs for other sports. Older calibration assertions preserve their original artifacts and independently unchanged components while explicitly recognizing this recalibration.

The complete release gate passed: **772 tests, 772 passed, zero failures/skips**, using `node --test --test-concurrency=4 test/*.test.js alerts-worker/test/*.test.js`. Both `node test-score.js` fixture groups, the versioned site build and Worker dry run also passed. This repository's frozen replay tests additionally need historical Git object `1bf1c66703a097c97fcde55b4c7af13055c3c593`, recovered from the existing local repository. Historical byte checks use the repository's original blob bytes; automatic checkout line-ending conversion was disabled locally.

Desktop 1440×1100 and mobile 390×844 browser checks cover final cards, CFB/NHL Game Center, timelines, keyboard point explanations and horizontal overflow. Screenshots and execution logs are retained in ignored `work/finish-audit/`. Publication requires a passing full suite, then a commit, Pages deployment, required shared-model Worker deployment, and production model/asset/feed verification.
