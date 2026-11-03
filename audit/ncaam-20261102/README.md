# NCAAM live audit — November 2, 2026

## Baseline and evidence

The deployed site was built from `6e6afefd1e7a6b8961446b86a2b64fc4642b4aa0` (GitHub Pages run 41539552368). All comparisons used an isolated checkout at that commit. The original working tree was left alone.

`miami-production-snapshots.json` contains exact normalized states from production D1. The public Worker captures and ESPN game summaries in this directory preserve the affected games as available during the audit. The original ESPN response body for each 15-second poll was not archived, so the exact detail-array arrival time is inferred from the stored normalized inputs and scorer result. The replay script uses causal prefixes of the captured ESPN play ledgers; it does not claim to recreate the original per-poll packets or their exact historical ratings.

## Miami 43 → 38 → current 40

Times below are New York time. At 6:50:45 p.m. and 6:51:00 p.m., Miami–Florida was 30–41, first half 3:01, with the same foul (`401906769120470645`) as the last play. Teams, possession/situation, DraftKings line (Florida -6.5, total 158.5), pregame baseline, summary state, accepted input evidence, and basketball facts were unchanged. The 43 state had `live.winProbability=null`; the 38 state had the provider's Florida home-win probability `0.893`. That difference reduced the scorer's tension factor from 16.895 to 12.202 and removed a 0.072 historical adjustment. The scoreboard's last play carried `0.893` in both stored states. The evidence points to a temporarily incomplete detail probability array, not a score, clock, line, possession, or momentum change. The 6:51:15 p.m. 38 was a duplicate normalized observation. An earlier 6:49:45 → 6:50:00 p.m. 46 → 38 showed the same null-to-present probability pattern, alongside a 3:28 → 3:27 clock advance.

At 6:51:30 p.m., Miami made the first of two free throws (`401906769120470757`), changing the score to 31–41 while the displayed clock remained 3:01. The rating became 40 with provider probability `0.877`, higher tension, and a small immediate-event factor. That movement had verified game evidence. Game Center's current 40 versus latest recorded 38 was also valid: the current Worker detail was newer than the last persisted history snapshot. Recorded timeline points were preserved.

The fix uses the NCAAM scoreboard's last-play probability when the detail array omits that same event, provided the header is current, the play ID appears in the positioned play ledger, scores match, and play time matches the scoreboard within two seconds. A present detail probability wins. Stale or unanchored values are ignored. No scoring weights or thresholds changed.

## Other corrections

- Ordinary NCAAM explanations now describe the verified score gap in game-time context and use natural verbs for full team names. Existing specific comeback, possession, and other sport sentences retain their precedence.
- A missing NCAAM period cell is derived from the canonical total only when exactly one elapsed period is unknown and all other provider period scores are valid. Contradictory or ambiguous splits are withheld; valid cells are retained.
- NCAAM halftime shows its viewing-priority badge once on the card and avoids a redundant Game Center clock chip. Period labels resume in the second half.

## Validation

- Baseline and changed basketball calibration outputs are identical (`baseline-basketball-calibration.json`, `after-basketball-calibration.json`). This includes the Notre Dame–Villanova close-game checks and six existing basketball fixture replays.
- Reconstructed replays of Miami (181 checkpoints), Army–Duke (109), and Oakland–Michigan (186) have identical before/after ratings at all 476 checkpoints (`replay-before.json`, `replay-after.json`). Four Oakland play rows were excluded by the existing causal replay rules. The isolated Miami omitted-probability probe changed from 41 with no probability to 37 with the verified `0.893`; these replay ratings are not the recorded 43 and 38 because the later source capture differs from the original poll inputs.
- Focused tests cover same-clock probability omission, stale and unanchored values, first-half/halftime/second-half/OT/final period cells, ambiguous provider splits, natural-language explanations, and live/halftime/second-half presentation.
- The final focused run passed 101/101 tests. A broad run across 106 test files, excluding the memory-heavy fixture provenance test, passed 1,155/1,171. The 16 failures were from restricted filesystem access during esbuild (confirmed passing when rerun outside the sandbox) and byte-for-byte fixture comparisons against files checked out with Windows CRLF conversion. For example, the committed NHL fixture SHA-256 is `d4e35aaa…`, matching its provenance file, while the local CRLF checkout is `2d9e5998…`; the same condition affects a frozen calibration artifact. These files and tests were not modified. No NCAAM regression failure was found.
- The complete Worker suite passed 221/221 tests, and Wrangler's production bundle dry run completed successfully.
- Desktop 1440×1000 and mobile 390×844 visual checks passed (`visual-results.json`). Both showed current 40, recorded 38, Miami first-half 31, one Oakland halftime label, no script errors, and no horizontal overflow. Screenshots are retained locally under `work/ncaam-audit-visual`.

The older `test-score.js` CSS assertion fails on the deployed baseline as well: it expects an obsolete `-webkit-text-stroke` declaration. The older `verify-basketball-release.mjs` browser script targets a removed `.detail-scoring-details` selector. Neither was changed to alter approved typography or UI. The standalone `fixture-provenance.test.js` exceeded available memory when run as part of the first full-suite attempt; the remaining test files were run separately.

Reproduce the focused checks with `node --test test/game-center-dynamic.test.js test/fan-explanations.test.js test/live-phase.test.js test/ncaam-live-audit.test.js`, `node scripts/basketball-audit-report.mjs`, `node scripts/ncaam-audit-replay.mjs .`, and `node scripts/verify-ncaam-live-audit.mjs` after building the site. The visual script requires the local Playwright runtime.
