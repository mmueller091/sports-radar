# Live feed latency changes, November 9, 2026

## Release status

Implemented and verified in the branch `fix/live-feed-latency-20261109`, based on
`ab0abe3f083c8bcf133676ad389cbd0c83ba046c`. Not merged or deployed. The complete
site suite retains one pre-existing historical-provenance failure, which is an
unresolved release gate under `AGENTS.md`.

## Changes

- The website requests `/feed?view=compact`. The response is a projection of the
  same accepted canonical revision, with duplicate scoreboard data, retained
  server evidence and unused top-level calculation/enrichment maps omitted.
  Default `/feed` consumers keep their existing response. Stored game data,
  scoring inputs and per-game display calculations are retained.
- Visible live website polling waits three seconds after request completion,
  instead of seven. The nonoverlap guard, near-start and hidden timing, model
  checks, stale handling and rewind protection are retained.
- Live refresh eligibility and live scoreboard/summary cache lifetimes use five
  seconds for NFL, CFB, NCAAB, NHL, MLB and NBA. Soccer and Tennis retain the
  existing twelve-second live resource policy. Nonlive and near-start policies
  are unchanged.
- Required summary work uses a rolling maximum of six concurrent operations
  when the queue contains only supported sports. Each free slot admits the next
  existing queue entry without waiting for the slowest sibling in a fixed batch.
  Unsupported or mixed queues retain grouped scheduling. Required summaries,
  history writes, lease ownership and atomic publication checks still complete
  before a new canonical revision is published.

The implementation does not add a streaming service, Durable Objects, a new data
provider, database schema changes, scoring changes or UI styling changes. The
separate pending NBA calibration branch is not included.

## Payload measurements

These are measurements of saved fixtures, not production latency measurements.

| Captured slate | Full JSON bytes | Compact JSON bytes | Reduction | Full gzip bytes | Compact gzip bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ten games across six sports | 371,212 | 106,357 | 71.3% | 33,573 | 12,143 |
| 302 games | 2,564,797 | 1,515,888 | 40.9% | 150,671 | 106,927 |

The captured six-sport fixture produces identical card and Game Center HTML with
the full and compact responses. The scheduler integration test blocks one
required summary, proves the seventh request starts when another slot becomes
free, prevents premature publication, and compares complete game objects,
calculations and snapshot rows against an unobstructed identical-fixture run.

## Validation

All complete suites used normal concurrency. No tests were skipped or cancelled.

| Command and source | Result |
| --- | --- |
| `npm test --prefix alerts-worker`, unchanged baseline | 449 passed, 0 failed |
| `node --test test/*.test.js`, initial baseline before build/history setup | 1,659 passed, 19 failed |
| `node scripts/build-site.mjs`, unchanged baseline | Passed |
| `node --test test/*.test.js`, baseline after build and restoring available history | 1,688 passed, 2 failed |
| Initial complete candidate Worker runs | 465 passed, 2 failed: old twelve-second assertions in NFL cache tests |
| `npm test --prefix alerts-worker`, final candidate run 1 | 467 passed, 0 failed |
| `npm test --prefix alerts-worker`, final candidate run 2 | 467 passed, 0 failed |
| `node scripts/build-site.mjs`, final candidate | Passed |
| `node --test test/*.test.js`, final candidate | 1,690 passed, 1 failed |
| Pinned Wrangler `deploy --dry-run` | Passed |
| `git diff --check` | Passed |

The candidate's two NFL cache assertions were updated to the requested
five-second policy. The final complete Worker suite passed twice afterward.

One baseline site assertion assumed an unconditional timeline call in source
text. Existing standings behavior already guards unrated games. A separate test
repair executes the actual tab function and verifies that rated games render
the timeline first while unrated games never call the timeline renderer.
Production timeline code is unchanged.

The baseline build was compared with the downloaded production Worker. After
removing source-path/source-map comments and accounting for equivalent existing
cron constants, the code matched. The candidate dry-run bundle SHA-256 is
`6eca183a3cdba0170b478b1107d5f52f721be27572d4013b5c9f363bbebc93fd`.
Wrangler version: 4.151.3, from the existing installed dependency tree.

## Remaining release gate

`test/replay-input-comparison.test.js` reads historical source and its checkpoint
manifest from commit `1bf1c66703a097c97fcde55b4c7af13055c3c593`. That commit is
missing from GitHub and all available local repositories. GitHub reports no
commit for the SHA, and Git fetch reports `not our ref`.

The missing dependency fails on unchanged main as well as the candidate.
Searching six repositories, including 2,403 unique Git blobs, available workspace
copies and historical compressed fixtures did not recover the required source.
Another checkpoint contains the same manifest but has different source hashes,
so it cannot replace the original evidence.

The provenance test, expected hashes and frozen artifacts remain untouched.
Resolving the gate requires the original historical Git object/tree or the exact
manifest-matching source bytes from the earlier local checkout or archive. After
recovery, rerun the complete site suite normally before merging or deploying.

No new ESPN-to-browser latency claim is made. That measurement remains a
post-release check after the release gate is cleared.
