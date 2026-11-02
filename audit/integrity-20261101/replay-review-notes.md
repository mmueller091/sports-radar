# Independent replay review

Reviewed by the evidence-integrity agent against pinned audited source `8ad7a0096307e0ab9038dbcba60f0e965e9bcfaa`. This is an explanation of observed replay differences, not a change to calibration targets or historical ratings.

## Final basketball check

`final-basketball-replay.json` (generated `2026-11-02T03:52:33.443Z`) was independently compared row by row with `baseline-replay.json`:

| Sport | Checkpoints | Changed fresh ratings | Changed sequential ratings | Fresh/sequential differences in both versions | Rejected sequential inputs in both versions | Repeat differences |
|---|---:|---:|---:|---:|---:|---:|
| NBA | 499 | 0 | 0 | 65 | 74 | 0 |
| NCAAB | 404 | 0 | 0 | 104 | 113 | 0 |

The existing basketball numeric sequence rejection guard was not changed. These finalized provider streams contain revised, nonmonotonic identities; the fresh/sequential differences already existed in the audited model. They are not evidence that the new implementation recovered the original live arrival order.

This intermediate artifact began before the replay runner gained its full-source fingerprint guard. The later full-source-verified `replay-differences.json` confirms the same basketball results and supersedes this intermediate artifact for release provenance. Following the deployment refresh correction, the release owner is regenerating matching fingerprints again; the final comparator artifact is authoritative.

## Introduced ordering defects found and corrected

The first candidate's generic event normalizer sorted basketball records at one game clock by numeric sequence, overriding the existing basketball reconciler's explicit event-wallclock order. This was an implementation defect, not an intended scoring change.

NBA checkpoint 206 (`401909088349`) contains a turnover at Q2 3:10, wallclock `19:59:38`, sequence 349. A coach challenge at the same game clock has sequence 297 but wallclock `20:00:02`. Ordering solely by sequence moved the turnover after the challenge. The changed number of subsequent plays changed current event-shock decay, producing +1 at indices 206, 209, 210 and 211. The fixed normalizer preserves wallclock order before numeric sequence when both records supply it.

The NCAAB fixture has a clearer score-state consequence:

| Event | ID suffix | Q1 clock | Provider wallclock | Score |
|---|---|---|---|---|
| Traveling turnover | 120398502 | 18:59 | 22:11:54 | 0-2 |
| Made dunk | 120398497 | 18:59 | 22:12:00 | 0-4 |
| Non-scoring foul | 120398521 | 18:35 | 22:12:21 | 0-4 |

The incorrect sequence sort placed the dunk before the turnover. It increased current shock at indices 14 and 15, and also left a false 0-2 score marker immediately after the 0-4 dunk. The following non-scoring foul then appeared to add two points without a scoring event. The new trajectory validator correctly refused that contradictory interval, but the contradiction had been introduced by the normalizer. An independent interval comparison found exactly one lost interval: elapsed seconds 61 through 85, with score 0-4, between the dunk and foul.

That lost 24-second interval caused downstream rounding changes at indices 189 (`401856574120398994`, 68 to 67), 202 (74 to 73), and 232 (77 to 76). Restoring the old trajectory code initially removed these symptoms because it ignored non-scoring score markers. This did **not** establish F3 as the underlying cause. Preserving the already-established wallclock order restores the observed interval and eliminates all five NCAAB rating differences. No basketball difference was accepted without a cause.

A separate identity control found that provider `sequenceNumber` alone is not safe as an idless event identity: MLB restarts sequences within plate appearances. Two legitimate idless sequence-1 records from different innings were incorrectly grouped as a contradiction. Idless identity now uses the full factual payload; distinct innings/periods remain distinct while an exact retransmission is still removed. This control covers MLB and NFL.

The two tests in `test/audit-event-ordering.test.js` failed against the first candidate (0/2, `event-ordering-before.log`) and passed after the fixes. Together with the 24 original evidence tests, the final focused run passed **26/26** (`event-ordering-after.log`). The original 24 tests separately fail against the audited source; the two ordering tests concern defects introduced during remediation and are not represented as original-production failures.

## Other sports and offline restoration evidence

The final all-sport comparison contains 1,997 checkpoints, of which 79 change and 1,918 do not. All four offline restorations have matching baseline, candidate and runner fingerprints; none of the 79 differences is unattributed. This supersedes the earlier intermediate MLB count of 90, which preceded the final observation-time corrections.

| Sport | Checkpoints | Fresh rating changes | Verified attribution |
|---|---:|---:|---|
| NFL | 220 | 0 | No integer rating changes in this fixture |
| CFB | 177 | 12 | Restoring CFB completed-quality retention removes all 12; restoring trajectory leaves all 12 |
| MLB | 385 | 67 | 59 F3, 5 C2, and 3 requiring both F3 and C2; zero unexplained changes |
| NHL | 312 | 0 | No integer rating changes in this fixture |

All 12 CFB changes occur at indices 165-176, Q4 1:44 through 0:11. The largest is 22 to 3 at the final live checkpoint. They follow removal of completed-quality retention from live watchability, not a hidden weight adjustment.

For MLB, the final verified comparator attributes 59 changes to observed-history coverage (F3), five to probability handling (C2), and three to their combination. The earlier 90-change/82-plus-eight restoration partition is superseded and must not be used as a release total. The comparator supplies row-specific mechanisms and retains an explicit unknown category; that category is zero in the verified final result.

The unchanged NHL fixture does not contradict the separate captured OTT-ANA reconstruction. That observed 63/71 pair uses retained canonical evidence from audit rounds 17/18; the corrected 61/69 pair removes unsupported opening duration while preserving the earned +8 comeback increase. The captured first row also becomes partial because its ledger is behind the 3-3 scoreboard. The archived chronological NHL fixture supplies different observed history and has no integer rating changes. Neither experiment should be substituted for the other.

## Replay limits

The runner uses only identity, season/format, the accepted event prefix, reconstructed current scores/clock and probabilities linked to that prefix. It excludes final boxscores, future results, rankings, odds and final records. These are causal reconstructions from finalized provider fixtures, not original response-arrival captures. Same-clock revisions and historical provider rewrites cannot recover an original polling sequence. Fresh, sequential and repeated results are reported separately, and an unchanged rounded rating does not mean all telemetry is byte-identical.

The ordering correction was frozen at `2026-11-02T03:51:09.159Z` (`scoring/provider-evidence.cjs` modification time). Subsequent refresh-pipeline changes are documented separately in `migration-notes.md`; the release's regenerated full-source manifests identify the complete final source.
