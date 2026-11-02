# Evidence integrity implementation record

Baseline: audited source `8ad7a0096307e0ab9038dbcba60f0e965e9bcfaa`, model `2026-11-01.production-integrity.2`.

The isolated checkout preserves the user's original dirty workspace. These tests were added before production source changes. `node --test test/audit-evidence-integrity.test.js` produced **10 tests, 0 passed, 10 failed**, recorded in `evidence-before.log`.

## Baseline failures

- F1: captured ESPN play `4018730352076` revision from 1:23/1st-and-10/WSH20 to 1:38/4th-and-1/WSH19 is rejected. A synthetic corroborated same-ID correction is also rejected. The fixture retains receipt timestamps, which are explicitly not provider revision timestamps.
- F2: valid but lagging NHL 3–2 scoring ledger against a canonical 3–3 scoreboard is advertised as nonpartial; missing/invalid/truncated evidence has no explicit quality state.
- F4: duplicate interception changes 54 to 57; reversing scoring records changes 56 to 50. Revision ordering is not canonicalized.
- F5: appending future plays/probabilities changes an older canonical score in regulation and overtime; same-clock future IDs are admitted.
- Additional chronology control: NHL P2 4:00 followed by older P2 5:00 rolls backward.

## Planned semantics

One event identity is scored once. Stable provider IDs take precedence; timestamped revisions select the latest record; unresolved contradictory duplicates must be flagged instead of selecting whichever array copy happens to come last. Distinct IDs remain distinct. Exact idless duplicates may be coalesced only by a complete event fingerprint; incomplete records cannot prove that similar legitimate events are the same.

A corrected observation needs evidence beyond clock direction: changed same-ID payload plus matching current summary, ordered provider revision metadata, or explicit internally coherent clock-and-field correction in the provider's canonical scoreboard. Bounded superseded fingerprints prevent a known older version from undoing a revision. An unmodified same-ID clock rollback remains stale.

All live event, probability and aggregate evidence is bounded to the canonical scoreboard moment. Ahead summary event prefixes can be used after clipping; ahead aggregate box scores/manpower/news cannot be assigned backward to the earlier clock. The original boundary is retained as telemetry. Older/contradictory summaries remain subject to existing rejection and bounded historical retention.

Quality is explicit: `complete`, `partial`, `invalid`. Ledger consistency and end-state agreement are separate from validity. Known partial facts remain usable, without pretending missing coverage exists. The delayed NHL comeback increase remains earned. Stored observations remain untouched; history readers map explicit new quality to the existing public `verified`/`partial`/`invalid` contract.

## Implemented corrections

- `provider-evidence.cjs` normalizes duplicate IDs and exact fallback payloads; recognizes ESPN `modified` plus other explicit update timestamps; reconciles factual score/time/type conflicts across play, scoring-play and drive containers; preserves legitimate shortened scoring captions; quarantines unresolved factual contradictions.
- A bounded, game-identity-scoped `providerEventRevisions` cache prevents older or unversioned historical copies from undoing a known timestamped correction across polls and canonical JSON persistence. It replaces only identities actually present in the incoming resource; it does not fabricate absent events.
- Every accepted or retained summary is normalized again under the canonical observation boundary. Old-model cached duplicates and precomputed trajectories cannot bypass current normalization; retained trajectory telemetry is recomputed from retained provider facts.
- Same-ID football revisions may be corroborated by an ordered provider revision, a matching summary, or an internally coherent explicit timeout clock/field revision. The latter is labeled `scoreboard-event-corroboration`, not independently verified official truth. Superseded fingerprints reject observed stale replays; explicit older modification timestamps are rejected even if the clock looks later. An old agreeing lower-score scoreboard and summary from an earlier period cannot bypass chronology. A larger current clock correction without a play identity/revision is conservatively rejected.
- NHL now rejects genuinely backward scoreboard observations using the same current-state integrity path. Rejected lower-score inputs do not erase evidence belonging to the accepted state. Actual accepted score corrections still invalidate incompatible history/manpower evidence.
- `ledgerQuality` distinguishes invalid ledgers from valid incomplete ones. It checks end totals, plausible scoring increments, missing values, explicit provider incompleteness, unresolved revision conflicts and deferred future aggregate evidence. A late scoreless excerpt cannot claim complete coverage without observed opening coverage or a provider declaration.
- `evidenceCoverage.scope=score-progression` clarifies that a complete scoring ledger does not assert a complete event arrival stream or an observed opening duration. `trajectoryScoring` supplies separately measured duration coverage. No scoring weights changed in this work.
- Historical rows are never rewritten. `snapshotEvidence` maps new quality to the existing `verified`/`partial`/`invalid` contract, and reads an older row's explicit `ledgerMatches:false` as partial. Thus the originally stored 63 stays 63 and becomes correctly classified when read; 71 remains 71.
- Future event evidence is clipped in regulation, overtime and same-clock ordered football identities. A future drive endpoint/result is deferred even if its summary header remains synchronized. Future aggregate boxscore/manpower/news fields are withheld from the earlier moment; the supported event prefix remains available.

## Regression evidence and review

Original evidence targeted run: **24 tests, 24 passed, 0 failed** (`evidence-targeted.log`). The same tests executed against the exact pinned audit source using `AUDIT_BASELINE_ROOT` produced **24 tests, 0 passed, 24 failed** (`evidence-baseline-expanded.log`). The original preimplementation 10-test failure log remains intact. Final replay review added two tests in the separate `audit-event-ordering.test.js`: both failed against the first candidate and passed after correction, bringing the combined focused run to **26/26** (`event-ordering-after.log`). These two are remediation regressions, not original audited-production failures.

An independent agent's adversarial review found additional holes in the first candidate: dropped provider-incomplete flags during retention, old unversioned event replay overriding a timestamped correction, old-model cached duplicates bypassing normalization, idless period-only duplicates, agreeing stale lower-score resources, and future drive aggregates surviving a synchronized header. Each was reproduced in a failing targeted regression before its correction. Failure evidence is retained in `evidence-review-before.log`, `evidence-review-additional-before.log`, `evidence-drive-before.log`, and `evidence-rejected-cache-before.log`.

Combined focused verification: **78 tests, 78 passed, 0 failed** across the new evidence tests, existing production-integrity, football-live, live-sync and Worker history-storage tests (`evidence-review-after.log`). Existing browser/Worker release integration: **5 tests, 5 passed** (`evidence-release-parity.log`; local esbuild required broader read access). Two comprehensive archived output/rating parity tests pass unchanged (`evidence-complete-parity.log`). These totals overlap; they must not be added to the full-suite total.

A final missing-recency regression demonstrated that period-only plays still earned current shock through `eventPosition`'s period-midpoint fallback. Shared event shock now requires actual event and current clocks for NFL, CFB, NBA, NCAAB, NHL and Soccer, and excludes events even one second after the canonical boundary. It retains the untimed historical record without inventing its recency. The targeted test fails before this correction (`evidence-recency-before.log`) and preserves the ordinary observed-current-event bonus in all six sports. Full-suite and bundle parity must be rerun after this final shared-module change.

The final full-suite run exposed four old test expectations that admitted future events: seven NFL plays after the displayed clock were allowed to age a current touchdown, an NHL goal at 19:00 earned shock at displayed 19:30, and NBA/NCAAB parity fixtures put a 0:10 event after the displayed 0:12 clock. Test-only corrections now require future records to have no such effect and preserve ordinary observed-event decay and credit. The basketball archive-parity fixture uses the observed 0:12 clock, with an additional explicit Node/browser future-0:10 regression demonstrating the old defect. Both affected test files pass **122/122** (`event-time-regressions-after.log`); no production code or rating weights changed for these expectation corrections.

The older football-live assertion expected duplicate scoring records to destroy sustained surprise. It now verifies idempotence and separately verifies that an unresolved contradictory same-ID record earns no sustained surprise. The live-sync synthetic larger clock/score correction previously provided no event identity/revision; it now checks rejection without corroboration and acceptance with an explicitly ordered same-ID review. Neither change weakens stale-update protections.

## Exact controlled comparisons

The reproducible `scripts/audit-evidence-replay.mjs` produces `evidence-replay-before.json` and `evidence-replay-after.json`. It accepts `AUDIT_BASELINE_ROOT` for the original archive.

| Scenario | Audited model | Corrected model | Cause |
|---|---:|---:|---|
| Captured OTT–ANA, lagging 3–2 ledger at canonical 3–3 | 63, falsely nonpartial | 61, partial | F2 corrects the quality flag; F3 removes unobserved opening-duration credit |
| Captured OTT–ANA, tying goal delivered | 71, nonpartial | 69, complete scoring ledger | The supported comeback still adds exactly 8; F3 changes the shared duration baseline |
| One identified interception | 54, shock 4 | 53, shock 4 | F3 removes 1.421875 phantom history points before rounding |
| Two copies of that interception | 57, shock 7 | 53, shock 4 | F4 scores the event once |
| Three copies | 60, shock 10 | 53, shock 4 | F4 scores the event once |
| NFL Q4 1:00, current WP .5 | 65 | 58 | F3 removes fabricated 6.5 history points |
| Append only summary play/WP .99 at 0:50 | 52 at displayed 1:00 | 58 at displayed 1:00, WP .5 | F5 excludes later evidence while preserving the current supported probability |

The NHL reconstruction uses only the canonical games' persisted historical/manpower fields from audit rounds 17/18, with provenance recorded in the gzip fixture. It reproduces the original 63/71 exactly; it is not mislabeled a full original raw summary capture. In the corrected second NHL observation the trajectory contribution also legitimately changes slightly as more observed coverage arrives, but integer movement remains +8 and the comeback factor itself is exactly +8.

An initial candidate unexpectedly reordered historical WP using finalized PBP and used MLB per-plate-appearance sequence numbers as global ordering. This changed a completed NBA rating 47→43 and an MLB explanation's WP swing 38→39 points. Both were investigated and fixed: probability resource order is preserved, and MLB uses actual inning half and its fixed-width event identity within that half. The complete archived cases now match the original values; these unexpected differences were not accepted as calibration improvements. NBA/NCAAM numeric sequence guards were not changed.

## Bounds, persistence and limits

The independent [replay review](replay-review-notes.md) records a further introduced same-clock basketball ordering defect and unsafe idless sequence identity, their 0/2 to 2/2 regression evidence, and final NBA/NCAAB fresh and sequential parity. All nine initially unexplained basketball integer differences were removed by preserving the existing event-wallclock order; none were accepted as intended calibration changes.

- Historical evidence cap is 32 KB (formerly 24 KB) and same-state evidence cap is 200 KB (formerly 180 KB), accommodating explicit probability anchors, revision and quality metadata without silently truncating the scoring ledger.
- Revision cache holds at most 1,024 timestamped event records and 384 KB; overflow exposes partial revision-coverage telemetry. Superseded scoreboard fingerprints are bounded to 16. These are input-evidence bounds, not rating smoothing.
- Internal revision/fingerprint caches are retained in canonical current-game storage for the next poll, but removed from public feed/detail/embedded scoreboard and long-term rating-history payloads. Regression coverage includes canonical JSON round trips and actual SQLite-backed snapshot storage.
- Exact idless payloads are treated as retransmissions. Without any identity, timestamp, score or participant difference, two truly distinct identical provider records cannot be distinguished. Similar records with distinct IDs or factual fields remain distinct.
- Internally corroborated ESPN revisions do not establish an independent referee ruling. Older unseen unversioned provider revisions remain an upstream limitation; known superseded versions and explicit older revision timestamps are fenced.
- No global weights, experiment flags, original historical ratings or completed-game retention semantics were altered by the evidence changes. Model-version bump and C1/F3 sport semantics are documented in the main response report.
