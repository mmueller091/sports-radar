# Blind review input correction

This audit starts from R10, R02, R21 and R05 and their retained ESPN public site API fixtures. Verification here means support in the retained capture, not independent confirmation of real-world events. The separately generated corrected key records SHA-256 provenance for the original artifacts and the four fixtures. Original artifacts, checkpoint manifest, scoring functions and policy constants are preserved. No scoring evaluation, calibration grid, promotion, deployment, staging, commit or push is part of this correction.

## R10 chronology: replay input defect

Fixture: `test/fixtures/real-games/NCAAB-20260328-401856574.json`, captured 2026-10-21T12:21:13.185Z. Checkpoint: `401856574120399220` (P2 8:58).

| Record | Clock | Home–Away | Sequence | Wall clock |
| --- | --- | --- | --- | --- |
| 401856574120399079 | P2 16:19 | 36–38 | 120399079 | 23:36:56Z |
| 401856574120399016 | P2 14:30 | 39–39 | 120399016 | 23:44:01Z |
| 401856574120399163 | P2 12:42 | 43–43 | 120399163 | 23:47:26Z |

The retained `summary.plays` array has these in chronological order, consistent with clocks, wall clocks and increasing cumulative scores. The later free throw has a smaller sequence number. `chronologicalStream` in `scripts/shadow-candidate-report.mjs` assumes game-wide sequence numbers are chronological and sorts them. This puts 14:30 before 16:19; `publicInput` samples ten entries from that replay ledger without reordering them. Sampling exposes the upstream discrepancy; it does not create it. Only one capture is retained, so a provider revision history or score correction cannot be established. No duplicate-record/score rollback correction is demonstrated.

The actual replay `summary.plays` and `summary.scoringPlays` have the same disorder. `scoring/shared/trajectory.js:scoringMoments` and `scoring/shared/history.js:momentumImpact` sort scoring moments by position, so the downstream final moment order is normalized. That does not repair earlier checkpoint membership, `rollingScore`, play-index-based WP membership, or history computed on prematurely admitted records. Within this same fixture, a later P2 3:16 scoring record also has a smaller sequence number than earlier events (record `401856574120399256`); therefore this is not limited to the displayed triple.

For the selected R10 checkpoint, the corrected display uses retained source-array order for the same accepted scoring IDs and asserts that every one precedes the checkpoint in the source. It records original/replay/source orders separately. R10 is context-only and excluded from confident calibration judgment pending replay validation. No replay or scoring implementation was changed.

## Postseason context

R10's event season is `type=3`, `slug=post-season`; summary season also has `type=3`. The retained event note identifies the NCAA tournament Elite Eight. The anonymized card shows postseason, round and single-elimination context without teams, region, model scores, policy names or contribution points.

R02: `test/fixtures/real-games/MLB-20261018-401930515.json`, captured 2026-10-21T12:21:10.888Z. Event and summary season corroborate postseason; event note says `ALCS - Game 5`. However summary series snapshots conflict: current series tied 3–3 versus playoff series leading 3–2, and the label's game number is inconsistent with those snapshots. The card establishes postseason championship-series context only. It explicitly withholds exact game number, series standing and elimination/clinching stakes. The frozen model's postseason input is not itself proof of those details.

## Football transition input defect

R21: `test/fixtures/real-games/NFL-20261011-401872982.json`, captured 2026-10-21T12:21:05.102Z. Play `4018729824233` is a timeout at Q4 0:45 following an accepted rushing touchdown record. Its end has `down=-1, distance=0, yardsToEndzone=0`, with a team ID. The next retained event is a kickoff, consistent with a scoring-to-kickoff transition; that future event is diagnostic evidence only and is not shown to reviewers or used to infer possession. The prior touchdown text includes an unsuccessful PAT, but retrospective scoring prose does not establish a pending try at this checkpoint. No explicit pending-try flag is supplied.

`footballSituation` copies `end.team.id` into possession and converts zero yards to end zone into `isRedZone=true` despite the invalid down. Its own `situationUsable` reports this state unusable, but that flag does not gate scoring. Shared `footballSituationImpact` admits it as an active tying/winning drive; `scoring/sports/nfl.js:nflSituation` then supplies a competitive floor. The frozen diagnostic shows situation points 11, competitive floor 32 and trajectory decisive strength 1 with negative multiplier 0.25. These are diagnostic outputs, not validated watchability labels.

R05: `test/fixtures/real-games/CFB-20261017-401856719.json`, captured 2026-10-21T12:21:06.753Z. Play `401856719774` is a timeout at Q4 1:18, sharing sequence 171 with the preceding own-fumble recovery. That preceding accepted play ends fourth-and-16 at the offense's own 23. The timeout endpoint instead has `down=0, distance=11, yardsToEndzone=28`, and its start/end team IDs differ. Those fields do not establish a normal down or authoritative current possession. `footballSituation` copies this endpoint into replay; `scoring/sports/cfb.js:cfbPossession/cfbSituation` accepts it for viable-possession leverage without validating a scrimmage down. Frozen output has situation points 12, competitive floor 35 and decisive strength 1.

Both cards state the supported timeout situation, suppress the unreliable current possession/down/field-position projection, and are explicitly unsuitable/excluded. They preserve game score and clock. Raw endpoint fields and unchanged frozen model outputs remain in the diagnostic key. No normal down, possession or pending try was invented.

The demonstrated scope is these two retained timeout checkpoints and the shared replay endpoint interpretation plus NFL/CFB active-possession scoring guards. Other transition states entering those paths may be affected; their prevalence has not been measured. This audit does not claim a general production incident count or repair all football transitions.

## Separate corrections and validation requirements

`scripts/trajectory-review-correction.mjs` reads frozen diagnostics without evaluating policies and writes `trajectory-reviewer-pack.corrected.md` and `trajectory-diagnostic-key.corrected.json`. Case IDs remain R01–R22, human answers are blank, and the reviewer projection hides teams, policies, model scores and contribution points. Game scorelines remain necessary live-review context. R01/R15 describe missing possession/situation information; “ordinary” remains only an original synthetic diagnostic ID, not a verified possession category.

Focused checks in `test/trajectory-review-correction.test.js` cover the exact sequence conflict, source-based display reconstruction, preserved IDs/results/hashes, postseason provenance and conflicting series details, excluded timeout states, missing synthetic situation wording, artifact reproducibility and reviewer blinding.

Validation: `node scripts/trajectory-review-correction.mjs` generated 22 cases with R05/R10/R21 excluded; `node --test test/trajectory-review-correction.test.js` passed all six focused checks. The generator also asserts that rebuilt audited checkpoints match their frozen checkpoint hashes and that the R10 display contains the complete causal source scoring prefix before sampling. These are presentation/provenance checks, not validation of defective scoring inputs.

Before relying on the previous calibration, chronology validation must precede rebuilding affected NCAAB checkpoints (including score and causal play/WP membership). Transition-aware football input handling and active-drive scoring guards need explicit tests for timeouts, touchdown/try/kickoff transitions, valid scrimmage downs and explicit tries. Then rerun the affected high-fidelity shadow, trajectory and live-calibration comparisons, regenerate diagnostics, and run appropriate broader regressions if shared football scoring changes. No broad calibration grid was run for this presentation correction, and previous calibration validity remains unresolved.
