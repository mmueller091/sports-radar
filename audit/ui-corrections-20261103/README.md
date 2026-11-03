# SlateMeter UI corrections

Production baseline: `5a1da813ea9288739039b4a50b5a44d97303129d` (the revision served by slatemeter.app at capture).

[Before-and-after screenshot gallery](comparison.html)

## Changes and root causes

- The original contrast system's cream surface was superseded by the surface-fix and polished-halo blocks. The halo block set transparent backgrounds and zero padding with `!important`. Later rules removed both its radial background and filter. Chrome confirmed transparent card shells and `filter: none`; the Capitals artwork disappeared into the charcoal card.
- Those three blocks and the later neutralizing rules are replaced with one team-logo contrast section. Existing card buttons/shells and hero wells carry a compact `#e4ded2` cream surface. Other team-logo surfaces use the same surface on the image without padding. The official images, image dimensions, and colors are unchanged. League marks are excluded. No new contrast `!important` declarations were added.
- `mobile-readability.css` explicitly applied `display:none` to `.team-record` at 600px and below. The existing canonical tuple value `team[5]` is still rendered exactly once and omitted when absent. A mobile flex wrapper keeps names, rankings, and 11px records together and allows wrapping. At 360px and below the existing provider short name is used. Desktop uses `display:contents`, preserving its prior layout.
- Card moments now carry a presentation-only `data-moment-kind`. Only `last-score` is hidden at 600px and below. Decisive plays and latest live events remain visible. The game object and Game Center markup are unchanged.

## Verification

- Real feed capture: see `test/fixtures/ui-corrections-feed.json.gz`, with source URL and capture time. Ten games cover NHL, NFL, CFB, NBA, MLB and NCAAM, including pregame, live and final states. Official ESPN images loaded successfully.
- Chrome: 1440px, 390px and 320px. All 30 card render checks passed, with computed cream backgrounds, unchanged 25px desktop/24px mobile artwork, visible records, no name clipping, no record/score/rating overlaps, and no page overflow. Desktop record positions and styling exactly match the baseline.
- Additional browser checks passed at 600/601px, for missing records and non-clickable logo shells, Game Center scoring history/timeline/decisive plays, team navigation, standings, schedules, search, and favorites. No browser exceptions.
- Screenshots were opened and visually reviewed, including Capitals/Stars, Lightning, Raiders/Jets, full 320px slate, and Game Center. See `before.json` and `after.json` for computed-style/geometry evidence.
- Focused UI/navigation/player-display suite: 11/11 passed.
- Full root suite initially: 1487/1493 passed. Five historical failures came from Windows CRLF checkout bytes and consequent oversized assertion output. Restoring exact repository LF bytes without changing tracked content resolved them: all 34 tests in the four affected files passed on rerun.
- One unchanged historical audit remains blocked: `test/replay-input-comparison.test.js` hardcodes commit `1bf1c66703a097c97fcde55b4c7af13055c3c593`, which does not contain `calibration/trajectory-current-checkpoint-manifest.json`. This fails before its tests execute on the production baseline as well. The manifest was introduced later at `88f5b40`. Neither this historical test nor any referenced scoring/fixture source was changed.
- Worker suite: 263/263 passed. An initial overlapping run exhausted process resources; the completed isolated run passed.
- `node test-score.js`: scoring, watchlist and timeline fixtures passed.
- Build passed. The generated scoring runtime is byte-identical to the baseline (SHA-256 `e785de3e46ddea0279451fdc18d65cbe87ffdd08a7c1932cbd36f5703286b3f0`). No Worker, scoring, Game Center logic, service worker, build configuration, infrastructure, or production scoring configuration changes.

## Deployment gate

The UI implementation and visual verification are complete. The user explicitly approved deployment with the documented pre-existing historical-audit exception on November 3, 2026. Production revision, asset hashes, cache upgrade, and live browser results are recorded by the production verification scripts after publication.

## Reproduction

1. Install the locked `alerts-worker` dependencies and run `node scripts/build-site.mjs`.
2. With Playwright and Chrome available, run `node scripts/verify-ui-corrections.mjs` to verify the frozen real feed against the complete built stylesheets. Detail/team data is fetched read-only and retained in ignored `work/ui-review/responses`.
3. `--before` uses a baseline build saved at `work/ui-review/before`. `--capture` refreshes the real feed fixture. `--production` uses actual deployed responses without interception and checks the published revision.

The original working folder and all its unrelated local changes remain untouched; implementation is in an isolated clone under `work/ui-corrections-20261103`.
