# NCAAM first-half calibration — November 2, 2026

## Baseline and scoring path

The clean branch begins at deployed commit `5641969b4dba3e4b1aa0f955fc9014dae5dbbc6f`. Its built site and complete suite passed 1,251/1,251 tests before scoring edits. The Miami production D1 state at 6:51:30 p.m. ET reproduces exactly: observed opening 51, live rating 40, Florida 41–Miami 31, first half 3:01, verified Florida win probability 0.877. The earlier 43 → 38 same-clock movement was a provider probability completeness issue corrected in that commit. This calibration neither changes that reconciliation nor rewrites any recorded rating.

Production live scoring uses `live-runtime.cjs` → `candidateGameRating` in `calibration/shadow-candidate.cjs` → `candidateStateRating` and `opening-transition.cjs`; `rating-core.js` supplies the established sport model, opening factors and non-live behavior. Its older live formula is not the final production calculation. At the Miami checkpoint, the production factors were game-state baseline 11.2633, carried pregame context 14.3942, and Current Tension 14.0792, with a 0.0614 live bonus. The 10-point gap received `1 − 10/24 = 0.5833` margin closeness despite roughly 23 minutes remaining. Comeback feasibility was already 1 and prevented an extra runway penalty, but did not add margin credit. The opening transition was 93.9% mature; only a small portion of the discounted ranked-matchup points remained in context.

The 51 opening is **preserved**. It already includes 11 spread-discounted ranking points for No. 1 vs. No. 14, two market competitiveness points and three season-opener points; the controlled unranked opener is 43 and a close top-10 opener is 59. This comparison did not justify changing the pregame ranking or market weights. Historical observed openings remain immutable.

## Change

- The NCAAM production Current Tension path now gives a smooth, bounded runway adjustment to moderate gaps from two to five possessions. It is zero for one-possession games, six-possession blowouts, overtime, and missing clock data, and approaches zero late in regulation. Existing comeback feasibility still acts once on the resulting closeness. NBA and the archived legacy scorer keep their original curve.
- The NCAAM opening transition retains part of *already awarded* two-ranked matchup context while play remains competitive in the first half, fading it through the second half. Its rank points have already been discounted by the pregame line; the change reallocates their carry rather than scoring rank or market a second time.
- The same transition lets the residual opening basis yield sooner to a verified wide early margin. All adjustments are multiplied by transition maturity, so tipoff remains continuous. The first-half end and second-half start produce the same score on identical input.

No team IDs, fixed ratings, sport baselines, pregame weights, win-probability weights, late urgency, history, provider reconciliation, UI, or recorded snapshots were changed.

## Paired calibration

Captured cases use preserved ESPN/D1 inputs. Controlled cases alter the named score, clock, ranks, or line and deliberately omit unrelated play history; they are counterfactual comparisons, not historical observations. Army's reconstructed baseline 42 differs from its recorded 41 because the original per-poll response body was not archived.

| Case | Before | After | Change |
| --- | ---: | ---: | ---: |
| A. Florida–Miami opening | 51 | 51 | 0 |
| A. Florida 41–Miami 31, first half 3:01, verified WP | 40 | 43 | +3 |
| A. Same play, detail WP omitted but scoreboard anchored | 40 | 43 | +3 |
| A. Stale detail header; current WP unavailable | 44 | 48 | +4 |
| B. Duke 18–Army 6, first half 11:30 | 42 | 41 | −1 |
| C. Close top-10 matchup, first half | 57 | 61 | +4 |
| D. Ranked 10-point first-half gap, current WP missing | 44 | 48 | +4 |
| E. Same 10-point gap, 2:00 left in regulation | 41 | 41 | 0 |
| F. Ranked favorite ahead 22 early | 44 | 39 | −5 |
| G. Ranked favorite ahead 22 late | 4 | 4 | 0 |
| H. Unranked competitive matchup | 52 | 52 | 0 |
| I. Captured late second-half comeback | 85 | 85 | 0 |
| J. Late close game / overtime / completed final | 53 / 59 / 40 | 53 / 59 / 40 | 0 |
| J. Ranked first-half game without odds or current WP | 43 | 47 | +4 |
| J. Identical first-half end / second-half start | 42 / 42 | 46 / 46 | +4 / +4 |

Miami's +3 comes from Current Tension 14.08 → 15.96 and carried context 14.39 → 15.73; the live bonus and observed opening remain unchanged. The 22-point early lead falls because carried opening context moves 38.68 → 33.43, while Current Tension stays near 1.06. The stale-detail variant has no trusted current probability, so it still differs from the verified case; the calibration does not use weights to conceal that evidence distinction.

The close top-10 game's +4 is carried ranked context, while its one-possession tension stays unchanged. The controlled ten-point first-half game's +4 combines runway and ranked context; the same gap at two minutes receives neither first-half adjustment. Duke–Army moves down one because its single-ranked, very wide-line opening gets no ranked carry while the early opening basis yields to the 12-point score gap. The unranked close, late comeback, overtime and final controls retain their scores. Missing odds change the *opening basis* to 49, but the time-aware live margin remains available from the verified score and clock.

## Historical and affected-game replays

The retained causal archive covers 107 fixtures and 23,767 checkpoints. All **23,108** non-NCAAM outputs match exactly before and after: NFL 4,560, CFB 8,409, NHL 7,944, MLB 776 and NBA 1,419. Per-sport hashes include checkpoint IDs, scores, opening ratings, base ratings, Current Tension and carried context. The 659 NCAAM archive checkpoints come from two games; 340 ratings change (336 up, four down), with deltas from −1 to +5 and a checkpoint-weighted mean change of +1.16. Their competitive ranked states account for the increases. No archived tipoff edge acquired more than a one-point extra jump, and both observed halftime boundaries have zero added jump. The largest difference in any adjacent rating change is two points, associated with game or provider updates; a same-score example reduced a pre-existing four-point jump to two.

The separately preserved Miami (181 checkpoints), Army (109), and Oakland (186) causal replays add 476 observations. Miami has 111 changed ratings (105 up, six down; −1 to +4), Army 31 (five up, 26 down; −2 to +1), and Oakland 76 (43 up, 33 down; −1 to +2). Initial ratings stay 49, 40 and 39 respectively. These are reconstructed source prefixes, not the original per-poll packets. The Miami omitted-probability probe remains anchored to the same verified 0.893 on both models; its reconstructed rating moves 37 → 41 from calibration, not from a change in probability handling.

The paired controlled-case JSON files and the per-sport replay hashes/counts are retained in `calibration/output/ncaam-calibration-{before,after}-20261102.json` and `calibration/output/ncaam-historical-replay-summary-20261102.json`.

## Verification

The complete candidate suite passed 1,255/1,255 tests. Focused checks cover the NCAAM runway boundaries, retained ranking context, unchanged NBA curve, identical halftime boundary, unchanged late controls, and the probability fallback from commit `5641969`. The original basketball audit retained its late close-game ratings 85/85/82, ordinary early/late controls 43/66, late blowout 1, NBA close game 53, and prior replay results. The production Worker bundled successfully in a dry run.

The desktop 1440×1000 and mobile 390×844 Game Center checks passed with no page errors or horizontal overflow. The captured presentation still shows Miami's verified first-half 31, the preserved recorded timeline, team logos and explanation, and one Oakland halftime label. The visual fixture intentionally preserves its old stored current 40 to check UI and history rather than claim a new historical observation.

The two-game NCAAM historical archive is limited; the controlled cases and three affected-game replays broaden coverage, but live results should still be monitored. The global model version is not changed because that would split timelines and cache identities for the other five sports even though their scores are identical. A current NCAAM game can retain a cached pre-calibration rating until its next provider input refresh; recorded historical rows are never edited.

Run `node scripts/ncaam-calibration-comparison.mjs` on the candidate checkout, then copy that script into a clean `5641969` checkout to reproduce the baseline cases. Do the same with `node scripts/ncaam-historical-replay.mjs <output.json>` for the retained causal fixture archive. The original ESPN per-poll bodies were not archived, so reconstructed cases are labeled separately from production observations.
