# Mobile alignment regression check

The local fixture browser checked four card sets and all 15 Game Centers at 320, 375, 390, 428, and 1440 pixels. Fixtures cover all six sports, short and long names, multiline names, 0–0, 9–10, 100–99, 120–115, and pregame, live, halftime, intermission, and final states. Provider detail teams and box-score teams are intentionally reversed from the scoreboard order. The browser checks logo loading, score/logo/record alignment, overflow, clipping, overlap, team ordering, statistic values, and team bar colors. Full measurements are in `results.json`.

Representative rendered screenshots:

- `center-320-12.png`, `stats-320-12.png`, `box-320-12.png`: Miami Heat–Golden State Warriors across the scoreboard and comparison views.
- `center-320-10.png`: multiline Texas A&M-Corpus Christi against Kentucky, pregame.
- `center-375-13.png`: two long college football names with 9–10 scores.
- `center-390-5.png`: college basketball.
- `center-428-1.png`: hockey power play and team badges.
- `cards-320-2.png`: narrow cards with preserved logos, records, and excitement indicators.
- `center-1440-12.png`: desktop Game Center.

`node scripts/mobile-alignment-visual.mjs` passed all 95 rendered views. The targeted Game Center test set passed 134/134; the Worker suite passed 368/368; `node scripts/build-site.mjs` passed. A full root test run did not pass: the initial parallel run had 38 failures, primarily from VM harness omissions, test resource contention, and Windows line-ending checks of unrelated frozen artifacts. The harness omissions were corrected and targeted tests passed. A limited-concurrency rerun was stopped when an unrelated historical fixture test consumed roughly 20 GB of memory after 306 passing tests. No scoring or fixture provenance logic was changed for this UI fix.
