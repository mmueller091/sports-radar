# Controlled-simulation threshold review

**PASS for the changed scoring factors; no additional calibration fix justified.** These are explicitly hypothetical inputs, not archived observations, real games, or historical alerts. The seven newly high rows reproduce through the frozen-before and current Worker facades. Detailed before/after factors, inputs, evidence flags, and possession controls are retained in [controlled-crossings.json](controlled-crossings.json); reproduce with `node audit/final-release-712f221/controlled-crossings.mjs`.

The 2,940-row controlled matrix contains 1,084 changed ratings and 741 changes of at least three points. It produces **five newly 85+ rows and two newly 90+ rows**; none crosses both thresholds. All seven have absent WP, synthetic pregame quotes passing validation, no scoring-history ledger, `evidenceQuality: partial` and `scoringPartial: true`. They are therefore alert-ineligible. The two final-shot rows differ only in whether zero timeouts is explicit; they are not separate games.

The [complete material-change JSON](controlled-material-changes.json) records all 741 material rows and all seven newly high rows with source path/model provenance. The [CSV](controlled-material-changes.csv) contains their union: 744 distinct scenario rows, because four threshold rows also meet the material-change criterion. Both artifacts explicitly label every row as a controlled simulation.

| Hypothetical case | Rating | Upset | Judgment |
|---|---:|---:|---|
| NCAAM +25.5, 49–50, OT 2:00, possession unknown | 75→86 | 0→11 | Credible one-point threat with two minutes left. Current Tension 42 and ordinary OT situation 11 remain unchanged. |
| NCAAM +35, same OT state | 75→86 | 0→11 | Same judgment; bounded strength prevents runaway extra credit for the larger spread. |
| NCAAM +35, 50–50, OT 2:00, possession unknown | 88→90 | 11→13 | Major underdog tied in OT; only two additional upset points. |
| NCAAM +25.5, 49–50, H2 0:02, underdog possession, timeouts unspecified | 75→86 | 0→11 | A potential winning shot is plausible. Existing decisive-possession bonus 20 is unchanged; the new factor represents market surprise. |
| Same final shot, explicit zero timeouts | 75→86 | 0→11 | Possession is already held, so zero timeouts does not make a shot impossible. |
| CFB +35, ahead 53–50, Q4 8:00, possession unknown | 83→85 | 16→18 | Narrow-lead correction; Current Tension 45, generic leverage 7 and carry 3 are unchanged. |
| CFB +14, ahead 51–50, untimed OT, possession unknown | 89→90 | 6→8 | The narrow-lead correction is plausible. The inherited OT floor adapts 44→43 as base rises 45→47; its total 90 cannot establish a specific decisive possession without more evidence. Partial status correctly blocks an alert. |

No row receives a separate WP award or history award: current WP is unavailable, history credit and overlap are zero. Exactly one upset factor is present. Existing current closeness and endgame situation remain separate from the pregame market surprise; no new duplicate ownership was found.

The two-second possession controls provide useful bounds. For the NCAAM underdog trailing one, totals are **86 with its possession / 55 unknown / 43 opposing possession**, upset **11 / 2 / 0**. NBA is more conservative at **75 / 44 / 34**, upset **8 / 2 / 0**, and adds no new 85/90 simulation crossings. Seven- and fourteen-point deficits at two seconds earn zero upset credit with every possession setting in both sports. The high NCAAM tied-and-possession example changes only **97→98**; the corresponding NBA case decreases **87→85**. The first score was already near the top of the scale, so its one-point increase alone is not evidence for recalibration.

| Sport | Scenarios | Changed | Changes ≥3 | Delta range | New 85 / 90 | Downward 85 / 90 |
|---|---:|---:|---:|---:|---:|---:|
| NCAAM | 735 | 438 | 319 | −18 to +11 | 4 / 1 | 14 / 8 |
| NBA | 735 | 460 | 362 | −18 to +9 | 0 / 0 | 2 / 0 |
| NFL | 735 | 104 | 38 | 0 to +5 | 0 / 0 | 0 / 0 |
| CFB | 735 | 82 | 22 | 0 to +6 | 1 / 1 | 0 / 0 |

The largest basketball reductions remove unsupported market credit: at two seconds, a +25.5 team leading one with stale/live/post-start/unverified odds changes NCAAM **71→53**, NBA **60→42** (upset 18→0). Large positive basketball changes recognize previously omitted viable narrow deficits: NCAAM +35 trailing one at H2 4:00 **58→69**; NBA +35 trailing one at OT 2:00 **61→70**. Football's largest changes remain narrow leads: NFL +25.5 leading one Q4 4:00 **62→67**; CFB +35 leading one Q4 4:00 **76→82**. The complete committed matrix retains all 741 material rows, not just these selected examples.

No provider observations, historical ratings, scoring files, or alert thresholds were created or modified by this review.
