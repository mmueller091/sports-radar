# Independent adversarial review of integrity changes

These cases were executed against the in-progress implementation after its initial targeted tests passed. They were sent to the snapshot/evidence owner and root for failing-before regressions and correction. The six reproduced failures were then independently rerun and verified corrected on model `2026-11-01.audit-integrity.3` at `2026-11-02T03:42:03.396Z`. Machine-readable results are in `adversarial-review-after.json`; the main audit response records the final release disposition.

1. **F2 retained partial metadata.** NFL 7–7, Q2 5:00; complete scoring ledger of 7–0 at Q1 1:00 and 7–7 at Q2 10:00, but provider `playsComplete:false`. First result: `partial`, reason `provider-history-incomplete`. Next identical scoreboard with null summary: `complete`, no reasons, `sameStateEvidenceRetained:true`. The compact cache omitted provider completeness metadata.
2. **F4 corrected event replay across polling.** Same NFL 7–7 Q2 5:00. Summary event `old` at Q2 6:00 says interception. Next response revises that ID to an incomplete pass with `modified:2026-11-02T02:00:00Z`; a later response replays the original. Observed ratings **52 → 49 → 52**, shock **3 → 0 → 3**. Within-payload deduplication did not retain the revision boundary across responses.
3. **F4 model-transition cache bypass.** A serialized old-production game containing one versus three copies of interception `turnover` at Q2 5:00 yields old ratings **54 versus 60**. Passing those previous games to the new model with the same scoreboard and null summary yields **53 versus 59**, shock **4 versus 10**, with same-state retention enabled. The retained old input was loaded after new normalization, so duplicate records bypassed it. The old-source adapter was loaded from the pinned audit archive for this check.
4. **F4 unpositioned fallback.** NFL 7–7 Q2 7:30; one/two/three idless interception entries have only `period:{number:2}`, text, scores and `scoringPlay:false`, with no clock. They yield **54 → 57 → 60**, shock **4 → 7 → 10**. The fallback identity used array position while shock timing invented the period midpoint. A control with no period at all earned zero shock; the period-only case is the demonstrated failure.
5. **F1 stale lower-score agreement.** First observed NFL state: Q4 1:00, 14–0, last play `12345900`. Then both stale scoreboard and summary agree on Q2 10:00, 7–0, play `12345200`. Result rolled back to Q2 and 7–0 with `liveUpdateRejected:false`. Lower-score correction acceptance bypassed chronology unless that exact old state had already been seen in the process.
6. **F5 future drive aggregate.** NFL OT period 5, 5:00, 14–14, home possession, current play `12345100`. An observed away drive has no result. Append future play `12345101` at 4:50 and set the drive result to Punt/end clock 4:50, keeping the summary header synchronized at 5:00. The future play is excluded, but its drive aggregate remains. Rating changes **56 → 92**; sudden-death/can-win/field-goal-wins become true. Aggregate clearing was gated only on an ahead summary header, not on excluded future events within that drive.

Additional review observations:

- Captured F1 revisions updated the state correctly, but a second reconciliation changed `observationIntegrity` from revised/provenance to accepted/null. Preserve the reason through the full adapter invocation.
- A late one-second excerpt (0–0 NFL, Q4 1:01 and 1:00 non-scoring markers) produced complete/non-partial metadata with no reasons despite observed trajectory coverage of approximately 0.000278 and `hasHistory:false`. No history bonus leaked. The completeness definition should explicitly distinguish score consistency from meaningful historical coverage.
- The new F9 production flow rereads canonical storage and preferences after an atomic claim. Mock tests cover concurrent drains, queue selection races, database failure, uncertain transport and acknowledgement loss. No real notifications were sent.
- Tennis future-set records were independently reproduced and fixed within the Tennis adapter, with a failing-before/passing-after test. Current-set explicit winner flags remain usable as observed facts; inferring a winner from a game margin remains prohibited.

## Independent rerun after corrections

| Review case | Verified result |
| --- | --- |
| Provider partial retained | Partial remains partial; `provider-history-incomplete` remains present. |
| Corrected event replay | Ratings 52 → 49 → 49; shock 3 → 0 → 0. |
| Old model cache normalization | One and three old copies both produce new rating 53/shock 4. Old baseline ratings remain 54 and 60 in the captured comparison. |
| Idless repeated period-only records | One/two/three copies all produce 54/shock 4. Duplicate accumulation is removed. |
| Lower-score stale observation | Rejected; Q4 and 14–0 retained. |
| Future drive endpoint | Before/after both 56; the later play is excluded and cannot establish overtime possession rights. |
| Revision provenance | Preserved as `revised` with `scoreboard-event-corroboration`. |

The period-only record still receives one shock award through the preexisting period-midpoint recency approximation. The duplicate defect is corrected, but this is not a claim that the event's actual clock was observed. This narrower recency limitation was raised to the root and evidence owner for a bounded decision under the no-invention rule.

## Final queue review in this subtask

The delivery claim is a conditional update of a pending row, guarded by original creation time and assigned a unique owner token. Only its winner can send. Settlement requires that exact owner and creation time. A new crossing may replace only cancelled rows; sent, uncertain and owned in-flight rows are not eligible for replacement. Current canonical storage and current preferences are checked after claiming. A definite old-endpoint rejection removes only the matching subscription endpoint, preserving a replacement endpoint. Missing data cancels before transmission, while uncertain acceptance is not retried. Mock tests exercise these transitions, including a replacement row with the same second-level creation time. No obvious remaining blocker was found in these reviewed SQL claim/cancel/re-cross paths. Provider/device arrival delay after transmission remains outside that guarantee.

Latest subtask verification: **43/43 focused/notification/public-feed tests**, and **144/144 full Worker tests**, with no skipped or cancelled tests. Final full-project regression and release checks remain owned by the root. No UI tool was used in this subtask, and no real notification, commit or deployment occurred.
