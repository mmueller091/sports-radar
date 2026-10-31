# College Football filters

Selecting College Football shows Conference and Top 25 Only below the sport selector. They narrow every tab, including Watching, before the existing favorite/excitement ordering. Either participating team can match; ranked versus unranked games qualify. The controls are hidden for All Sports and other sports. Preferences persist in the existing browser settings; Clear filters restores All Conferences and Top 25 off. Selecting an FCS conference turns FCS on with a visible explanation. Turning FCS off clears an active FCS conference with an announcement. The existing FCS crossover policy is retained.

## Conference source and caching

`GET /metadata/CFB?season=2026` uses ESPN's structured seasonal [FBS standings](https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80&season=2026) and [FCS standings](https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=81&season=2026). Stable team IDs map to conference IDs, including independents. Nested divisions inherit their parent conference. Both source seasons must match; there is no team-name inference or static membership map. Separate seasonal keys accommodate realignment, with January using the preceding football season.

The Worker reuses the existing resource and lease tables to cache only the compact membership index for 24 hours. A refresh makes two bulk provider requests, coordinated by a global lease with a five-minute failure backoff. Same-season stale metadata remains usable for up to seven days with a visible notice. Absent membership never creates an assumed conference match. Metadata loads lazily when CFB is selected and is cached in the browser for an hour. No database migration is required. It does not enter scheduled feed processing, scoring, history, or notifications.

The verified 2026 responses contain 25 conference groups and 266 team IDs; the index is approximately 14 KB. These counts are observations, not hardcoded membership requirements. The one current-feed team absent from these standings is UFTL (ID 124110); its conference is left unknown. A matchup can still qualify through its verified opponent.

## Rankings and extension

Top 25 reads the normalized ESPN scoreboard `curatedRank.current` / `team.rank` already present in team slot 6. Only integer ranks 1–25 qualify; missing rankings stay unranked. `scripts/verify-cfb-metadata.mjs` independently compares production rankings with ESPN scoreboards and captures current source responses under ignored `work/cfb-filters/`.

Future sport-specific predicates can be added to the `SPORT_FILTERS` registry with independent preferences. Only CFB is implemented. The predicate runs before tab counts, tab selection, and existing sorting. It never rewrites game data or scores.

## Validation and release

- `node --test test/cfb-filters.test.js alerts-worker/test/cfb-metadata.test.js`: conference membership on either side, cross-conference games, rank combinations, missing data, all tabs, sorting, persistence, FCS, seasonal changes, caching, failure backoff, and concurrent callers.
- `node scripts/verify-cfb-metadata.mjs`: current ESPN source verification and production ranking comparison (100 team observations verified on October 31, 2026).
- `node --test --test-concurrency=4 test/*.test.js alerts-worker/test/*.test.js`: complete regression suite, including the deployed NFL/CFB kickoff corrections.
- `node scripts/build-site.mjs` and Worker deployment dry run.

The release workflow deploys the Worker first, verifies `/metadata/CFB` with the production Origin, then publishes main through the existing GitHub Pages workflow. Publication checks compare deployed HTML asset revisions and asset hashes against the release build, and confirm `/health` and `/feed` retain model `2026-10-31.football-transition.1`.

### Current verification status (October 31, 2026)

The final site build and Worker dry run passed. The focused release suite passed 102/102 tests, including the 13 new filter/metadata tests, football-transition and football-pregame checks, startup/feed behavior, notifications, history, cache upgrades, and existing mobile markup/navigation checks. Logs are under ignored `work/cfb-filters/` (`relevant-tests.txt`, `worker-dry-run.txt`). A broader regression run was interrupted after an out-of-memory error during a separate check; it did not complete and is not counted as passed.

The production Worker deployment is version `48e4c837-82ee-404f-bf97-2f504c17bd03`. Its metadata response was verified against the independently fetched ESPN membership index: 25 groups, 266 team IDs, valid production CORS, and unchanged model `2026-10-31.football-transition.1` in health and feed responses. Production check artifacts are saved under ignored `work/cfb-filters/`.

Desktop/mobile visual verification remains incomplete: Computer Use stopped automatically because it could not determine Chrome's current URL with sufficient confidence to enforce policy. No visual QA success is claimed. The 102 automated checks include existing mobile markup/navigation checks, but those do not replace rendered layout inspection.

To resume visual QA, run `node work/cfb-filters/preview.cjs` if the ignored captured source files are still present; it serves the built assets on `http://127.0.0.1:8766` with the captured production feed and verified ESPN conference index. Otherwise rerun the verification script first. Use fresh browser state, check CFB and other-sport transitions at desktop and phone widths, filter dropdowns, Top 25, FCS, combined empty states, and persisted preferences before publication.
