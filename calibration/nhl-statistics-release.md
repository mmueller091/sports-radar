# NHL Game Center statistics release — October 31, 2026

This release adds Corsi, Fenwick, confirmed 5-on-5 splits, rolling five-minute attempts and recent trailing-team attempts to the NHL Team Stats tab. NHL data is fetched only for Game Center, using the existing cache, identity checks and optional-enrichment deadline. Box scores, player statistics, plays and rating histories retain their existing paths.

The production baseline is GitHub main `2a1be10169f1bb2da2233496657b6cd1cce30bee`. The retained Cloudflare version is `78852fdd-d8e3-4334-a495-d9a225322a50`; the previous Pages build is [run 41172499104](https://github.com/mmueller091/sports-radar/actions/runs/41172499104). The baseline commit is the recoverable website/Worker source reference.

Production model remains `2026-10-31.football-pregame.1`, policy `live-owned-45-95-relevant-history-cfb-competition`. All 29 browser scoring dependencies are unchanged against that baseline, and the compiled scoring bundle is byte-identical (SHA-256 `05c17f3bf729e6125d4bff74a75445636b05c1a6e113ed6304fd338208c88ea4`). Thus this release changes no sport's rating calculations for identical inputs. Neither the browser scoring graph nor the production Worker imports the offline pressure experiment. `NHL_LIVE_PRESSURE` is absent; offline `nhlAdvancedPressure` still defaults to false. Its baseline reference was updated to the existing production policy without changing that policy.

Validation before publication:

- Complete suite: **662 passed, zero failed/skipped**.
- Production website build and Cloudflare Worker dry-run build passed.
- Eight public historical NHL ledgers and the 3,087-checkpoint offline comparison reproduce; no experiment is activated.
- Official NHL game `2026020214` maps to live-site ESPN game `401892611` (New Jersey at Vegas, October 30), and supplies real advanced statistics.
- The 320px browser harness recorded working Game Center tabs, excitement graph, player statistics, ten advanced-stat rows, percentages and no horizontal overflow or JavaScript errors. Its away-first heading assumption was incorrect: the existing ESPN summary uses home-first columns. A regression now verifies headings and nonzero mapped counts in that existing order.
- **Visual verification remains incomplete** at the requested four widths and live/missing/delayed states. Native browser automation stopped because it could not establish Chrome's current URL confidently. No successful screenshot review of the complete matrix is claimed. The user explicitly waived this gate with “ignore, publish” after being informed of the blocker.

The [original audit](nhl-advanced-pressure-audit.md), [implementation review](nhl-pressure-review.md), and [experimental comparison](nhl-pressure-results.md) describe the earlier local research baseline. Their scoring experiment remains offline and available for future review. Publication status and live endpoint checks are recorded separately in the release receipt after deployment.
