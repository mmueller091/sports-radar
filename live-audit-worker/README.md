# SlateMeter Scoring Quality Audit

The audit is the independent Cloudflare Worker `slatemeter-live-audit`. Version
`2026-11-04.quality.2` investigates retained canonical ratings; it never imports or
runs the production scorer. Production formulas, ratings, notification settings,
provider refresh schedules and the public website remain outside its scope.

The existing `*/3 * * * *` schedule, D1 database, audit tables, 14-day observation
retention and finding/recovery history are preserved. There are no additional
provider requests, AI calls, scheduled scans or notification deliveries. Scans
still write the existing audit rows; richer evidence increases bytes per row.
On-demand quality reports and exports additionally read bounded retained history.

## Source and release boundary

The deployed quality-1 audit came from `e3c6a63`, a separate audit release checkout.
Current main also contained UI-only commit `42b09f6`; those histories diverged
from `5b7f797`. The working branch `audit/scoring-quality-20261104` starts from
`42b09f6`. Integration commit `ab6dcdc` adds the existing audit release, and this
upgrade changes only `live-audit-worker/`. Do not publish the old checkout over
current main or deploy the production Worker/public site for an audit change.

See [the upgrade report](reports/upgrade-20261104.md),
[the November 3 investigation](reports/november-3-investigation.md),
[scan cost measurements](reports/offline-scan-measurement.md), and
[production file verification](reports/production-scope-verification.json).
The upgrade report records validation and deployment status separately; source
changes or passing unit tests alone do not establish a live deployment.

## Protected dashboard and reports

Open [the protected dashboard](https://slatemeter-live-audit.mmueller918.workers.dev/dashboard).
The existing password creates the same secure, HTTP-only, 12-hour session. Bearer
authentication remains supported. The password is retained in the ignored
`work/live-audit-read-token.txt` of the original authorized checkout; do not commit
or print it. `/health` remains public and exposes scan health, not per-game
investigation evidence.

The dashboard preserves slate selection, finding history and export controls.
**Load Scoring Quality** requests `/quality?date=YYYY-MM-DD` on demand; the normal
one-minute dashboard refresh does not run the larger historical analysis.
`/report` retains the established current/recent monitor view. Dates use
America/New_York and original game start dates, including after-midnight finishes.

Scoring Quality presents executive findings, deterministic integrity problems,
potential over/underrating, event responses, volatility, threshold usefulness,
sport/model calibration, evidence coverage and recommended investigations.
The raw historical findings are preserved. `historicalFindingReview` explains
whether retained evidence supports, limits or reclassifies an old warning.
A recovered source error is not silently erased; active-game, unrelated and
unresolved request scope are distinguished where retained URLs allow it.

## What the analysis measures

- Pregame, live, peak-live, decisive-event, completed and resolved sudden-death
  states have separate meanings. A lower rating after a hockey overtime winner
  cannot establish that the game was underrated while still in play. Unknown
  lifecycle, shootout totals and malformed evidence remain explicit.
- Peer comparisons require the same sport, model, period/overtime state, score
  margin and a narrow actual-clock window, plus at least two retained context
  dimensions. Five independent comparison games are required before using a
  median. Match coverage, mismatches and unavailable dimensions accompany it.
  Default or unverified context values are not corroborating evidence.
- High ratings alone are not inflation. Overtime, credible underdog threats and
  substantial recoveries can justify 95?99. A large change is an investigation
  prompt whose event, clock and component changes must be inspected together.
- Comeback measurements quantify observed deficit, recovery, game-clock interval,
  before/after rating and available factors. Repeated unchanged recoveries retain
  first/last references, count and rating range. Score corrections cannot create
  a fictitious comeback. Historical rarity is withheld without enough distinct
  comparable same-model games.
- Recommendations distinguish confirmed defects, strong calibration concerns,
  calibration hypotheses, data-quality limitations, expected behavior and
  insufficient evidence. They include game/time/rating, verified circumstances,
  components, suspected cause, supporting references, peers, gaps, confidence,
  user impact, a bounded investigation, possible regressions and replay needs.
  No target rating or scoring adjustment is automatically selected.

The thresholds are inclusive 70, 80, 85, 90 and 95. Each reports its first
retained crossing, the corresponding clock/runway, the separately observed
audit-cadence crossing, sampled duration, episodes and censoring. An episode
means observed below/above behavior, not proof of uninterrupted real-world
eligibility. The <30-second, <120-second and longer runway bands are descriptive;
they are not validated human tune-in times or changes to notification policy.
The legacy `estimatedSecondsAbove85` field remains strictly greater than 85;
the new per-threshold duration is inclusive and identifies its observation source.

NFL, CFB, NBA, NCAAM (stored as `NCAAB`), NHL, MLB and verified Grand Slam tennis
are presented separately. Hidden Soccer remains in raw audit history but is not
prioritized in public-facing recommendations. Model cohorts stay separate;
combined cross-version peak distributions and threshold percentages are withheld.
One slate cannot establish that a sport is miscalibrated or that 85 means equal
excitement across sports. Equal statistical distributions are not an objective.

## Evidence and timestamp semantics

The scanner uses only the canonical feed, existing snapshots, and already cached
provider responses. It retains supported event identities and provider event
wallclock values when available, aligned to the rated game state. Supported event
families include scoring, lead/tie changes, turnovers and fourth downs, pressure
opportunities, runs and comebacks, manpower/goalie changes, overtime/shootouts,
baseball leverage/walk-offs, and tennis point/break/tiebreak developments. Missing
sport-specific fields do not become inferred facts merely because a family is
supported.

Event analysis reports before/after ratings, signed change, expected direction
when context supports one, simultaneous events, source reliability and the
observed bracket. Both increases and decreases can be appropriate. State changes
without timestamped plays produce an explicitly inferred interval, never a made-up
event timestamp. Magnitude adequacy remains unvalidated without comparable replay.

These timestamps must not be interchanged:

| Retained field | Meaning |
| --- | --- |
| Provider play `wallclock` | Provider-supplied event occurrence timestamp, when present |
| `sports_resources.updated_at` | Cache acquisition/version metadata |
| Canonical `feed.updatedAt` | Refresh-start reference, before canonical publication |
| Live `sports_snapshots.observed_at` | Refresh-start reference floored to a 15-second bucket |
| Audit `observedAt` | Time the independent audit observed the retained feed |
| Actual provider/canonical publication | Not established by the fields above |

The legacy quality field `publishedAt` is retained for compatibility but is
labeled as a canonical refresh-start reference. It is not proof of publication.
Exact provider latency, publication latency, polling delay and scorer-processing
time are not claimed. Snapshot refresh buckets cannot establish strict observed
response-latency bounds. Threshold and duration estimates disclose the same
limits; no missing interval is silently converted into continuous coverage.

Production `evidenceQuality: complete` means the score-progression ledger
reconciles. It does not certify complete audit context or an event stream.
The audit independently classifies evidence as **complete**, **partial**,
**invalid** or **unavailable**, lists missing fields and preserves producer status.
Legacy observations remain unchanged in D1. Retained fields can be recovered for
analysis with their actual row/model/source attribution; missing values are never
backfilled or relabeled as originally captured structured evidence.

## Nightly ZIP and bounded historical reads

**Export Nightly Audit** downloads `slatemeter-audit-YYYY-MM-DD.zip`. Existing
filenames and entries are preserved:

- `summary.md`: a concise investigation overview with supporting identifiers.
- `findings.json`: schema version 3; original audit observations, findings,
  recovery events, retained snapshot projections, scoring quality and coverage.

The export is read-only, authenticated and secret-scrubbed. It does not rescore a
game or update old findings. Lightweight SQL projections of all games' audit
observations and scoring snapshots are read first. Each point retains its exact
source timestamp, row model, rating, scores, period/clock, lifecycle, evidence
flags and scalar scoring ledger. Large histories and duplicate event/component
arrays cannot consume the budget before later-game trajectory points are read.
Flagged observations, large changes and 85-crossing endpoints then receive
bounded detailed projections. `diagnosticDetailCoverage` records requested,
read, included and omitted detail rows separately from lightweight coverage.
At most 100 requested detail rows per source/game are selected across their full
time span, including the first/last requested endpoints when the cap permits.
Full raw `normalized_state` remains in the exact referenced D1 row while retained.
This is not a full raw-state dump. Archive compaction removes no included rating
rows, and a missing detailed projection is not a missing collection observation.

Snapshot reads have row and projected-byte budgets, including per-game limits.
The unchanged shared input ceiling is 36 MiB. Snapshot row ceilings remain 2,000
per game and 20,000 per export, including additional snapshot detail reads;
actual limits and reads appear in `sourceHealth.onDemandSnapshotReads`. The audit
trajectory is also bounded to 2,000 rows per game. When a row/byte cap prevents
complete lightweight coverage, the export preserves the retained time span and
first/last endpoints when they fit, rather than returning an early-game prefix.
`availableRows`, `rows`, `fullSpanPreserved`, `sampling` and `complete` make the
difference explicit in `observationCoverage` and `snapshotCoverage`. A sampled
trajectory is never called complete, and its intentionally omitted intervals
are not reported as collector outages. Exported audit deltas and quality
continuity are unavailable across omitted source rows; detailed upgrades retain
those gap markers rather than reconnecting sampled endpoints.
`metadata.trajectoryCoverageComplete`
and `metadata.diagnosticDetailCoverageComplete` are separate measures. Cached
timeline reviews also
identify their revision/acquisition time; a later cache revision cannot prove the
exact earlier provider payload. After retention expires, an export may preserve
finding history without reconstructing the lost trajectory.

The dashboard and summary reserve the high-priority scoring section for actual
`critical`/`high` recommendations, excluding expected behavior. Medium/low and
unassigned concerns remain in investigations with their real priority labels.
Evidence counts distinguish usable scoring observations, complete producer
score-progression evidence and the much stricter complete contextual evidence.
Zero fully contextual records does not mean zero usable ratings.

## Local validation

From the repository root, the normal site build supplies the existing browser
parity-test artifact only; this command does not publish the public site:

```text
node live-audit-worker/scripts/build-dashboard.mjs
node scripts/build-site.mjs
node --test live-audit-worker/test/*.test.js
```

The observed November 3 fixtures retain exact source hashes and distinguish
observed production records from synthetic boundary tests. Tests cover the
Winnipeg resolved-state false positive, Dallas sparse/dense crossings, Carolina
peer mismatch, shootout/clock semantics, corrections, stale/invalid evidence,
model boundaries, auth, export escaping, ZIP construction and scan isolation.

With the authorized read-only captures available locally, these commands run
without provider/network requests or production writes. Choose a new output
directory for each export replay to preserve previous evidence:

```text
node --expose-gc live-audit-worker/scripts/replay-november3.mjs work/audit-upgrade-20261104/before-findings.json work/audit-upgrade-20261104/d1-retained.json work/audit-upgrade-20261104/replay-new
node live-audit-worker/scripts/measure-scan-cost.mjs work/audit-upgrade-20261104/d1-retained.json work/audit-upgrade-20261104/scan-cost-new.json
```

Passing local checks is necessary but does not verify Workers memory limits,
authenticated live routes, or an actual scheduled execution. Record those
separately before claiming deployment complete.

## Audit-only publication and recovery

Use only this directory's `wrangler.toml`, which names `slatemeter-live-audit`.
There is no database migration or production backfill. Once the release's tests,
resource bounds and authenticated runtime verification pass, the existing audit
Worker can be published from `live-audit-worker/` using the installed Wrangler:

```powershell
& ../alerts-worker/node_modules/.bin/wrangler.cmd deploy --config wrangler.toml
```

Do not run the production Worker deployment or public-site publication. Preserve
the current auth secret, D1 binding and cron. After publication, verify the
protected dashboard, `/quality`, downloaded ZIP and unchanged unauthorized access
behavior. Then verify that a normal scheduled three-minute run advances with no
error; deployment alone does not prove the Cron Trigger ran. Do not add a manual
scheduled scan solely to manufacture this evidence.

For recovery, restore the known prior audit Worker version/source and redeploy
only that Worker. Keep its audit tables and historical evidence. Do not reset the
production database, rotate unrelated secrets, delete the public Worker or change
provider/notification schedules as part of audit rollback.
