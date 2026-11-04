# SlateMeter Live Audit Monitor

This is a separate Cloudflare Worker. It runs `*/3 * * * *`, reads the canonical
feed, existing rating snapshots, and (when already cached) NHL public play-by-play
from the production D1 database. It never calls the production scorer and makes
zero new provider requests. Production ratings and alert delivery are untouched.

The monitor checks all published live games in NFL, CFB, MLB, NHL, NBA, NCAAB,
Soccer, and Tennis. It skips inactive slates. A scan writes one timestamped
observation per live game and stores current findings and open/recovery events.
It also checks chronological integrity of already cached ESPN play timelines;
the retained NCAA basketball replay fixture covers sequence IDs that disagree
with source clock order.
Deterministic integrity failures open immediately; heuristic findings need two
consecutive scans. An open finding needs two clean scans to recover. Report
evidence includes the model version, feed revision, prior snapshot reference,
observed and expected state, confidence, severity, and likely failure layer.

The score plausibility thresholds are review prompts, not ground truth. Stakes,
unseen events, provider corrections, and sparse historical peers can explain an
outlier. Similar-state comparisons require five distinct games. NHL cross-source
checks use a fresh cached official play-by-play copy when available; other sports
have only same-provider score and history checks. Historical replay files used by
tests are reconstructed checkpoints, not observed production snapshots.

## Report

The report is a read-only bearer-protected endpoint:

```powershell
$token = Get-Content -Raw ..\work\live-audit-read-token.txt
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Headers $headers 'https://slatemeter-live-audit.mmueller918.workers.dev/report'
Invoke-RestMethod -Headers $headers 'https://slatemeter-live-audit.mmueller918.workers.dev/report?date=2026-11-03'
```

Open [the private dashboard](https://slatemeter-live-audit.mmueller918.workers.dev/dashboard)
in a browser and paste the password stored at
`work/live-audit-read-token.txt` when prompted. The sign-in sets a private,
secure 12-hour browser session. The dashboard is responsive and uses SlateMeter's
dark, brass, and blue palette. It links back to the public game site but runs on
its own Worker URL; the public frontend is unchanged.

The selected date uses New York local time. `postSlate` contains every audited
game's rating range and observation count, scan totals, errors, and
alert/recovery events. `/health` is
public and shows the latest scan status but no per-game evidence. The generated
token is in `work/`, which this repository ignores. If it is lost, rotate it with
`wrangler secret put AUDIT_READ_TOKEN` from this directory.

Confirmed findings currently create deduplicated `live_audit_events` and appear
in the protected report. No outbound delivery destination has been configured;
the monitor records `notifications=0` until one is selected. Do not send monitor
diagnostics through entertainment push subscriptions without those subscribers'
consent. No paid integration or recurring expense is enabled.

## Deploy and validate

From this directory, using the Wrangler installed in `../alerts-worker`:

```powershell
& ../alerts-worker/node_modules/.bin/wrangler.cmd deploy
Invoke-RestMethod 'https://slatemeter-live-audit.mmueller918.workers.dev/health'
```

This audit-only upgrade uses the existing database. No schema migration, backfill,
or historical recalculation is required or authorized by this release.

Check that `latestRun.finished_at` advances after a scheduled three-minute tick,
`error` is null, and the protected `/report` has the same run, source freshness,
game evidence when live games exist, and open/recovery events. A zero-game scan is
complete if the canonical feed has no active games. Deployment alone does not
prove a Cron Trigger fired.

Each scan reports `provider_requests=0`, estimated `storage_writes`, and
`notifications=0`. Worker invocation count is one per three-minute tick (up to
480/day), plus report requests. Additional D1 reads are one feed/header read,
part reads, one active-finding read, two history reads and one cached summary
read per live game, and one
similar-state read per populated sport/bucket. Additional writes are one run,
one observation per live game, changed findings/events, and a run update. Monitor
actual usage in Cloudflare analytics; these counters are workload estimates,
not billable-usage guarantees. The monitor does not enable paid upstream APIs.
Per-scan observations and runs are retained for 14 days; findings and their
open/recovery events are preserved for historical review.

## Export a nightly audit

Open the [protected dashboard](https://slatemeter-live-audit.mmueller918.workers.dev/dashboard),
sign in with the password in `../work/live-audit-read-token.txt`, choose a New
York slate date, and click **Export Nightly Audit**. The date defaults to the
most recent completed audited slate when one exists, or the previous New York
calendar date when no slate has been observed yet. The download is named
`slatemeter-audit-YYYY-MM-DD.zip` and contains:

- `summary.md`: a ChatGPT-ready overview, every monitored game (including clean
  games), model and audit versions, source health, findings, and coverage gaps.
- `findings.json`: full three-minute audit observations and rating changes,
  findings and recovery events, and stored scoring snapshots around anomalies.

Games are grouped by their original New York start date even if play continues
after midnight. A ZIP can be downloaded directly with the existing bearer token:

```powershell
$token = Get-Content -Raw ..\work\live-audit-read-token.txt
curl.exe -L -H "Authorization: Bearer $token" -o 'slatemeter-audit-2026-11-03.zip' 'https://slatemeter-live-audit.mmueller918.workers.dev/export?date=2026-11-03'
```

The export is read-only and does not change the scorer, audit cadence, or
findings. It removes secret fields and strips unsafe URL parameters. Per-scan
observations are retained for 14 days; older exports can show historical
finding events but cannot reconstruct purged observation curves. The archive
records this limitation as a coverage gap. No outbound provider request is made.

## Scoring Quality

The existing dashboard now includes **Load Scoring Quality** for the selected
New York slate date. It calculates the report on demand through the same private
session/bearer authentication at `/quality?date=YYYY-MM-DD`. Regular one-minute
dashboard refreshes do not invoke this analysis. The existing ZIP filenames and
entries are preserved; `findings.json` adds `scoringQuality` and schema version 2,
and `summary.md` adds the Scoring Quality section.

The analysis covers all eight supported sport keys (NCAAB is displayed as NCAAM).
It includes top-ten *games* by potential over/underrating, separate model cohorts,
70/80/85/90/95 peak reach percentages, peak quantiles, sampled time strictly above
85, significant moments and never-observed-at-85 games, event response censoring,
current-versus-past watchability checks and same-publication priority conflicts.
Every candidate includes source state, timestamps, model, confidence, suspected
cause, missing evidence, next correction and impact. It is an investigation queue,
not an objective excitement benchmark. In particular, a close final contributes
nothing to an earlier live assessment. An equivalent 85 across sports remains
unvalidated with sparse and selected samples.

Future scans add compact `qualityEvidence` to the existing observation JSON;
there is no migration, new storage row, query, provider/AI call or cron change.
Retained legacy observations remain unchanged and disclose fields they lack.
Canonical possession, field position, timeouts, foul/bonus/shot clock, bases,
manpower, goalie, tennis format/point state and verified market evidence are used
only when present. No score or alert is changed. Experimental NHL pressure
scoring remains disabled. Expanded JSON increases bytes per existing observation;
retention and write counts remain unchanged.

Duration is a left-held estimate between fresh, distinct publications at most six
minutes apart. Unknown gaps, model boundaries, completed states and retrospective
replay duration are excluded. Event response requires an actual event timestamp
and pre-event publication baseline, is marked as an observed association and is
censored when no rise is observed. Event wall-clock, acquisition, scan and feed
timestamps never substitute for provider publication timestamps. Current provider
publication latency remains unavailable.

Local build and focused verification (no provider requests or deployment):

```text
node live-audit-worker/scripts/build-dashboard.mjs
node scripts/build-site.mjs
node --test live-audit-worker/test/*.test.js
```

The source review and offline replay evidence remain on the separate local branch
`audit/scoring-quality-20261103` at `65a3cce`. The disabled NCAA metadata candidate
remains separately at `a3a997a`; its code, tests, and calibration scripts are
excluded from this release. No production scorer or audit entry imports it.

## Existing Worker rollback

Disable the schedule first by removing `[triggers]` from `wrangler.toml` and
redeploying this Worker, or delete the independent Worker:

```powershell
& ../alerts-worker/node_modules/.bin/wrangler.cmd delete slatemeter-live-audit
```

Deleting the Worker stops audit scans without changing production scoring or the
production alert Worker. The additive `live_audit_*` D1 tables can be left for
forensics. Drop them only after exporting any evidence you need. If a deployment
fails during a scan, leave the tables in place and roll back the Worker; do not
run the production Worker's deployment from this checkout.
