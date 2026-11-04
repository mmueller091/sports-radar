# CFB verified-context correction — November 4, 2026

Release status: all predeployment checks passed; approved candidate for the
user-authorized production release. Postdeployment evidence is recorded separately.

## Baseline and scope

The isolated branch `fix/cfb-verified-context-20261104` starts at current main
`a411fc5ae52d109e292f5225545b2c95b50ffc7f`. The original working tree was dirty
and substantially behind main; none of its unrelated work was copied or edited.
The production Worker source in main is identical to deployed candidate
`40f9de3a1e5a53f1340720183337a966e8acb119` for the Worker, scoring and core files.
Production Worker version: `0bcf9648-7078-4ce5-b6ff-7f756789341a`.
Production model: `2026-11-03.live-underdog.1`.
Candidate model: `2026-11-04.cfb-context.1`.

The public feed captured at **2026-11-04 19:15:03 UTC** contained 111 Saturday
CFB games, one with qualitative scoring credit and three with editorial stories.
All eight reported ratings were reproduced exactly. A later read at 19:46 UTC
still used the original model; main and the public site's asset revision were
unchanged. Existing provider-summary errors were recorded separately from this
change. Private runtime files, raw health/feed captures and test logs stay under
ignored `work/cfb-context/` and are not publication artifacts.

## Confirmed causes and corrections

- The old `researchGame` helper admits ordinary CFB games only with rankings;
  the active cached-feed path also excludes unranked games rated below 47.
  Both now admit reviewed rivalry candidates. Up to two existing rotation slots
  protect those candidates, after the unchanged quality and sport-coverage slots.
- Research reads recent ESPN league news, so historical rivalry/rematch coverage
  depends on whether a recent snippet happens to mention it. A small reviewed
  registry supplies facts independently of those news/AI slots.
- Editorial eligibility permitted one matching team tag. Notre Dame's scheduling
  story about Purdue/Illinois therefore passed despite being unrelated to Miami.
  CFB scheduling/series stories now require both participants in the text, and
  stored editorial rows undergo that check again on read.
- BYU-Utah was identified directly in frontend prose without a scored factor.
  That identity-only exception is removed. The existing Game Center narrative
  and linked-story section now describe the supplied ledger and reviewed facts.
- CFB rematch types share one deduplication group. A reviewed event classification
  also prevents a generic news headline from upgrading an older rematch or adding
  a second bonus. Alabama's coaching connection is explanation-only.

The weights remain rivalry **7**, playoff rematch **6**, meaningful rematch **2**.
No live formula, completed formula, ranking coefficient, notification behavior,
hosting setting, audit Worker/database, layout or unrelated sport is changed.

## Complete comparison

The [machine-readable audit](scoring-comparison.json) contains every original
and proposed factor, all 111 games, both top-ten lists, source links and displayed
explanations. These are fixed-input comparisons, not promises about later market
or ranking updates.

| Game | Before | Proposed | Factor change and rationale |
|---|---:|---:|---|
| BYU at Utah | 80 | 87 | +7 rivalry; first top-ten meeting explains significance, with no extra ranking bonus. |
| Georgia at Ole Miss | 81 | 87 | +6 playoff rematch of the immediately preceding season's CFP quarterfinal. |
| Miami at Notre Dame | 79 | 88 | +7 established rivalry and +2 distinct recent selection/rematch significance; not a playoff game/rematch award. Remove unrelated scheduling story. |
| Kentucky at Tennessee | 73 | 80 | +7 border rivalry. Rare ranked meeting and Kentucky's ranking record are explanation, not additional bonuses. |
| Air Force at Army | 44 | 51 | +7 service-academy rivalry; ranks are not required. Trophy-series participation adds no separate clinching bonus. |
| Oregon at Ohio State | 64 | 66 | +2 meaningful rematch. The CFP meeting belongs to the 2024 season, too old for full recent-playoff credit. |
| Alabama at LSU | 83 | 83 | Keep existing +7 rivalry; explain Kiffin's Alabama connection without coaching/duplicate rivalry credit. |
| Texas at Missouri | 82 | 82 | First Columbia visit since 2011 is historical background only. |

Original factor totals (before rounding): BYU 79.75, Georgia 80.75, Miami 78.5;
the complete individual ledgers are authoritative in the JSON audit.
Alabama alone originally had a qualitative factor: rivalry +7. The other seven
had only the existing quantitative/stakes factors. No original scoring factor is
removed from these eight games. Six ratings change; **105 Saturday ratings are
unchanged**, including Alabama and Texas. No other Saturday game materially changes.

Calibration: Miami (88), BYU and Georgia (87) move above Alabama (83) and Texas
(82). Kentucky reaches 80; Army-Air Force reaches 51, distinct from an ordinary
unranked game without being promoted to the top tier. Oregon receives only two
points. No score reaches the existing 90-point pregame cap. These differences
come from the established weights, not target scores or new ranking multipliers.

## Evidence for each new award and explanation

- BYU rivalry and first top-ten meeting: [BYU game-week preview](https://byucougars.com/news/2026/11/2/byu-football-game-week-2026-at-utah).
- Georgia's January 2026 elimination by Ole Miss, 39-34: [Georgia preview](https://georgiadogs.com/news/2026/11/2/football-georgia-travels-to-oxford-to-take-on-ole-miss).
- Miami rivalry and 2025 result/selection significance: the **Up Next** section
  of [Miami's November 2 report](https://miamihurricanes.com/news/2026/11/2/canes-rewind-a-look-back-at-the-win-over-north-carolina).
  The recap portion is not the evidence used for the upcoming matchup.
- Kentucky-Tennessee rivalry and rare ranked meeting: [Tennessee preview](https://utsports.com/news/2026/11/2/football-16-16-vols-ramping-up-for-rivalry-showdown-against-8-7-kentucky).
  Kentucky's ranking record is supported separately by the [official CFP release](https://collegefootballplayoff.com/news/2026/11/3/rankings).
- Army-Air Force rivalry and November 7 meeting: [Army's schedule announcement](https://goarmywestpoint.com/news/2025/12/17/army-football-to-open-2026-vs-bryant-all-12-opponents-set).
  Annual trophy-series structure: [Army's official game notes](https://goarmywestpoint.com/documents/download/2025/10/28/Army_2025_Game_Notes__8__at_Air_Force.pdf), Commander-in-Chief's Trophy section.
  No current trophy-clinching scenario is inferred from the older notes.
- Oregon's older postseason rematch: [Oregon preview](https://goducks.com/news/2026/11/2/football-ducks-buckeyes-clash-in-columbus).
- Kiffin background, no new points: [LSU staff biography](https://lsusports.net/sports/fb/roster/season/2026/staff/lane-kiffin).
- Texas historical visit, no points: [Texas schedule announcement](https://texaslonghorns.com/news/2025/12/11/footballs-2026-schedule-announced).

## Integrity, validation and cost

The registry requires a valid HTTPS primary-source hostname, title, evidence
summary, review date, publication date when known, event identity, correct ordered
opponents and New York game date. It does not turn AI/editorial descriptions into
scoring evidence. Missing/malformed evidence fails closed. It never adds facts to
completed games, historical games before activation or events outside the
seven-day horizon. Facts stop applying at completion or the earlier of the
event's absolute expiration and 12 hours after kickoff. A recorded pregame
baseline remains historical evidence in the existing transition machinery.

Pregame-to-live tests cover five minutes before kickoff, the exact opening state,
repeated refreshes, initial win probability, early clocks and a scored play.
Opening scores match pregame exactly; no-action early refreshes differ by at most
one point under the unchanged progression formula. Repeated context/summary
application is idempotent. Browser/Worker equivalence and completed-game guards
also pass for all eight matchups.

The existing six-sport causal replay matches the deployed source in **all 1,997
states**, including full factors, fresh and sequential scores, repeat scores,
rejection flags and history/trajectory fields. No repeated-refresh differences.
See [replay verification](replay-verification.json). These are reconstructed
provider prefixes, not original live arrival streams. Existing NBA/NCAAM
fresh-versus-sequential differences are identical in both engines.

Focused football/research regressions: 89 passed. New context suite: 19 passed.
Explanation checks and `test-score.js` pass. Site build and Worker dry run pass.
Full applicable suite: **1,877 passed, zero failed, skipped or cancelled**.
All implementation and test files were compared against that passing verification
copy and match after line-ending normalization.

Historical tests depend on mixed recorded LF/CRLF byte formats. Verification uses
an ignored copy: LF text except the three recorded CRLF files
`trajectory-checkpoint-manifest.json`, `trajectory-checkpoint-manifest.md` and
`output/replay-input-provenance.v2.json` under `calibration/`. Their hashes are
checked by the original tests. No historical source, fixture, hash expectation,
or assertion was changed in the release checkout to obtain these results.

No new service, dependency, provider fetch or AI request is introduced. Limits
remain 30 games, 60 articles, four per game, six provider requests and three AI
requests. The reviewed facts are deterministic local data.

The native browser tool stopped because it could not confidently determine the
current URL; no further UI interaction was attempted. Actual screenshot/visual
QA was therefore unavailable. No layout or styles changed; functional tests
exercise the actual frontend explanation and linked-story functions.

## Maintenance and remaining limits

Add a rivalry by exact ESPN CFB team IDs only after reviewing a primary source.
Keep durable rivalry membership separate from current ranking, personnel or
trophy scenarios. Add exceptional facts through the event list with ID, ordered
teams, date, expiration, evidence and a conservative existing context type. The
review timestamp is not a fabricated publication timestamp. Undated biographies
retain a null publication date.

Use full playoff-rematch credit only for the preceding season; an older rematch
requires a current preview establishing relevance and gets at most meaningful
rematch credit, with a two-season bound. Do not add an extra award for ordinary
rankings, a historic visit, or coaching color already explained by the occasion.
Run `node scripts/cfb-context-report.mjs`, the context tests, the football opening
tests and the full regression/replay gates before publication.

Coverage remains curated, not exhaustive across every CFB rivalry. Future
authoritative-source discovery can be proposed within the existing request and
AI budgets; automatic editorial promotion remains prohibited. Additional facts
require another reviewed source change. Existing provider-summary failures are
an independent feed limitation and are not repaired in this release.

## Recovery and publication

Exact files changed:

- `scoring/cfb-verified-context.cjs` (new reviewed facts and validation)
- `scoring/shared/context.js` (CFB rematch deduplication and evidence)
- `scoring/live-runtime.cjs` (version and shared validator export)
- `alerts-worker/src/research-allocation.js` (bounded selection and links)
- `alerts-worker/src/editorial-context.js` (CFB article relevance)
- `alerts-worker/src/storylines.js` (reviewed-fact integration)
- `alerts-worker/src/game-model.js` (evidence propagation)
- `alerts-worker/src/live-game-model.js` (registry input validation)
- `app.js` (ledger-consistent explanations and reviewed source links)
- `test/cfb-verified-context.test.js` (new coverage)
- `test/helpers/cfb-verified-context.mjs` (fixed public-input reconstruction)
- `test/fixtures/cfb-context/slate-20261107.json` (public Saturday baseline)
- `test/pregame-editorial-pass.test.js` and `test/pregame-quality.test.js`
  (remove the old identity-only rivalry expectation)
- `scripts/cfb-context-report.mjs` (reproducible audit)
- `audit/cfb-context-20261104/README.md`, `scoring-comparison.json` and
  `replay-verification.json` (this report and its evidence)

The original main revision and complete source archive are retained locally in
`work/cfb-context/verification-source.tar`; the original Worker version above is
the recoverable deployment checkpoint. No database migration is needed. Release
must use the existing GitHub Pages workflow and `sports-radar-alerts` Worker only.
The audit Worker, database, cron, notification configuration and all protected
visual assets remain unchanged. Production verification and final commit/version
identifiers are recorded here after a successful release.
