# Six-sport publication audit — 2026-11-02

Production baseline: `e784420eae7a4cc7cf61d5d48efda5bb0dda704e`, verified against the revision in `https://slatemeter.app/sw.js` before editing. This work was made in an isolated worktree; the original checkout's unrelated changes were left alone.

## Baseline and visual review

- [Desktop baseline](baseline-desktop.png) and [mobile baseline](baseline-mobile.png)
- [Pregame Game Center baseline](baseline-pregame.png)
- [Desktop candidate](candidate-desktop.png) and [mobile candidate](candidate-mobile.png)
- [Pregame Game Center candidate](candidate-pregame-final.png)
- [Final rating and trend candidate](candidate-badge-50.png)

The desktop and mobile slate keep the existing layout and score colors. Soccer and Tennis are hidden from public controls and discovery. The final-card trend fits below the rating, and pregame Game Center no longer opens an empty Team Stats panel. The existing rating, team logos, and Game Center history remain visible.

## Scoring integrity

`node scripts/audit-integrity-replay.mjs` produced 1,997 rows before and after. The SHA-256 digest of the `results` array was identical: `fba48d78c0d2e02adb69aac9009cf4defa29ea482382a0bf7538dc31271b6eab`. Calibration output was also identical before and after: `828811122c9847f6af6e6bd3215a3eff5b97c288fac9294760f86b89553a3562`. Scoring code was not changed.

## Publication behavior

`sport-visibility.js` is the shared public allowlist for the browser and Worker. Add a dormant sport there to restore public access; its collectors, model, tests, and saved user choices remain available. Existing queued alerts for hidden sports are canceled by the Worker rather than sent. All includes finals whose start was within 48 hours, with the newest completed date first. The Final view retains older finals.
