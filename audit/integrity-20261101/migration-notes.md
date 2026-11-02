# Bounded model-transition refresh

## Failure and diagnosis

The first deployment's postdeploy gate failed: the refresh repeatedly reached the unchanged 25-second deadline and retained the previous model's stale canonical feed. The release owner rolled back before attempting another release. Production timing showed about 3.3 seconds collecting, 1.2 seconds recovering records, 2 seconds loading context and 16.3 seconds processing summaries, with 25.7 seconds total. These observed figures are not a synthetic performance measurement.

The 259 critical candidates were **non-Tennis** games. Tennis is excluded before summary-candidate counters; the newly collected 225 matches add snapshot/feed work but make no generic summary requests. A model-version change invalidates every nonlive computed-enrichment record. The old pipeline recalculated all of them before publication, then discarded the computed games and metadata on deadline. Persisted provider resources alone did not preserve completed scoring work.

## Correction

- Live summary acquisition retains first priority and its existing deadline/failure behavior.
- Nonlive model migration stops accepting more work when fewer than seven seconds remain for snapshots and atomic publication. A missing or incompatible cache can start a provider request only when its existing seven-second request timeout also fits before that reserve. The global 25-second deadline and 30-second lease are unchanged.
- A provider cache survives a model change because it contains facts, not ratings. The current model recomputes a cached summary only when lifecycle, both team identities and both scores match the current nonlive scoreboard. A cached live resource cannot certify a final. Stale compatible input retains its original resource version and explicit stale/degraded indicators; ordinary maintenance can revalidate it after publication.
- Unprocessed or failed migration acquisitions publish freshly normalized current-model rows with `enrichmentPending`, `scoringPartial`, `evidenceQuality:partial` and `summary-enrichment-pending`. These fields also qualify the embedded scoreboard used by the browser. They never copy an old-model score. Partial finals are excluded from completed history.
- Successfully recalculated metadata is committed with the canonical publication. Next refresh prioritizes rows still awaiting model enrichment, so a deadline no longer discards all progress.
- A newer cache timestamp for an already-computed current-model row is checked after untouched migration rows. If that validation cannot fit, only a fingerprint-matching current-model rating may be retained, with its **original** summary hash/version and explicit `summaryValidationPending`, stale and partial flags on both canonical and embedded scoreboard representations. It is not written as a newly validated final. These validations remain bounded after model migration finishes; a successful check recomputes a pending row and clears its qualification.
- Reuse requires both enrichment metadata and the prior game itself to identify the current model. Metadata alone cannot relabel an old-model rating.

The public pending fields are displayed as provisional ratings/details still loading by the release owner's UI change. Tennis keeps its separate honest scoreboard-only coverage qualification.

## Regression evidence

The heavy mixed-slate regression failed against the pre-fix pipeline with a 25,000 ms summary-stage deadline, no publication and no provider failures (`refresh-migration-before.log`). The first candidate then exposed a second defect: cached-version checks spent the next poll's budget before pending model work, leaving 187 pending rows unchanged (`migration-review-progress-before.log`). Independent review also reproduced a stale live cache incorrectly entering completed history; the before capture is `migration-review-stale-final-before.json` and the review describes the corrected controls.

The final six migration tests cover: explicit old-model reuse rejection; bounded publication and repeated-poll progress; incompatible cached lifecycle, scores and identity; and a failed last pending provider acquisition that remains partial and succeeds later. The combined targeted run passes **41/41**: six migration tests, 26 existing refresh-policy tests and nine Tennis tests (`refresh-migration-after.log`). This count overlaps the full suite and must not be added to it. Only the initial heavy test was run as a formal test before the production correction; the later cases were added from independently captured failing repros and review findings, not represented as six original baseline test failures.

The deterministic mixed fixture has 259 completed non-Tennis games, one live game and the actual captured 225 Tennis matches, for 485 total. Cached summary reads consume a deliberately conservative simulated 250 ms each; snapshot/feed batches consume 100 ms each. It verifies live-first ordering, current model identity on every row, absence of a previous-model score sentinel, both public pending representations, canonical persistence and absence of pending final-history rows.

| Poll | Model-enrichment rows still pending | Simulated publication time |
|---|---:|---:|
| 1 | 187 | 18,750 ms |
| 2 | 115 | 18,550 ms |
| 3 | 43 | 18,550 ms |
| 4 | 0 | 18,700 ms |

After resource versions settle, remaining validation-pending counts converge separately: 114, 48, then zero. Existing lease fencing, timeout cancellation, stale same-model behavior, current live priority, failed-collection preservation and immutable-publication tests continue to pass.

The independent Tennis-only transition control publishes all 225 captured matches in a simulated 4.6 seconds with no summary candidates or requests. It skips 143 partial finals, stores 82 upcoming rows in two batches and writes five feed parts. This supports the diagnosis that Tennis summary work was not the blocker; it is not proof of production latency.

## Limits and release gate

A subsequent production smoke found that 88 scheduled NBA/NHL rows remained pending even though the feed was publishing. Captured examples (`production-pending-smoke.json`: NHL 401892633/401892679 and NBA 401909951) had matching team identities and explicit pregame status in both resources, but summary scores were omitted while scoreboard scores were zero placeholders. The narrow correction treats missing/null/blank and numeric zero as equivalent only when both resources are explicitly pregame. It does not fill raw scores, accept boolean false as zero, or relax played/final score checks. Four provider-representative positive cases failed before the correction while four negative controls already passed (`migration-pregame-before.log`); all eight pass afterward. The combined focused refresh/coverage suite is **49/49** (`migration-pregame-after.log`). This scheduling compatibility correction does not change the scoring graph.

Final inspection also found that exact string equality would accept unknown scores when both played resources omitted them or both supplied null. Five added controls (both omitted, null, blank, boolean false, or nonnumeric text) failed before correction; genuine numeric-zero and string-zero controls passed (`migration-played-score-before.log`). Non-pregame compatibility now requires finite, present numeric values before applying the existing exact equality check. The pregame exception remains separate, raw resources remain unchanged, and all seven controls pass. The final combined focused count is **56/56** (`migration-played-score-after.log`), superseding the earlier overlapping 49-test run.

The reserve is a scheduling bound, not a guarantee that arbitrary database/provider latency will fit. Existing deadline checks and atomic publication fencing still preserve the prior canonical feed if necessary. Progress assumes stable enough input observations to reuse completed work; continuously changing inputs may remain explicitly provisional. No provider quota, timeout or global deadline was raised, and no scoring weights changed.

These offline tests establish bounded behavior and integrity invariants. A new production publication must still pass the postdeploy freshness/model gate before the release is accepted. The refreshed source-fingerprinted scoring replays and full-suite results are owned by the release report; the earlier successful 1,074-test run predates this refresh correction and is not its final validation.
