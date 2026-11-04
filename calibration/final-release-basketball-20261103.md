# Supplemental basketball release audit — November 3, 2026

**PASS.** Eight additional public provider archives produce 3,367 causal replay states, 3,351 numerical comparisons and 16 zero-clock states withheld by both models. There are **781 changed ratings, 497 changes of at least three points, and no upward 85 or 90 crossings**. No further scoring calibration is justified by these observations.

The source [manifest](../test/fixtures/release-basketball-20261103/manifest.json) records exact capture URLs, timestamps and SHA-256 hashes. All eight archives remain byte-identical. These are retrospective play-prefix reconstructions, not original live provider responses. Only an explicit archived closing quote supplies a market; its availability to the app at the historical instant is not established. Missing possession and WP stay missing; later play/WP records, recaps and final box scores are not injected into live checkpoints. The existing chronology rules disclose reordered and excluded records in the [full ledger](output/release-basketball-20261103.json).

| Regular-season game | Accepted closing expectation | Rated states | Changed | Changes ≥3 | Rating delta | New 85 / 90 |
|---|---|---:|---:|---:|---|---|
| Stephen F. Austin–Duke, Nov. 26, 2019 | None retained | 402 | 0 | 0 | 0 | 0 / 0 |
| Evansville–Kentucky, Nov. 12, 2019 | None retained | 321 | 0 | 0 | 0 | 0 / 0 |
| UNC Wilmington–Kentucky, Dec. 2, 2023 | None retained | 347 | 0 | 0 | 0 | 0 / 0 |
| Detroit–Boston, Dec. 28, 2023 | None retained | 476 | 0 | 0 | 0 | 0 / 0 |
| Chattanooga–Louisville, Nov. 2, 2026 | Chattanooga +30.5 | 400 | 0 | 0 | 0 | 0 / 0 |
| Oakland–Michigan, Nov. 2, 2026 | Oakland +26.5 | 442 | 52 | 0 | 0 to +1 | 0 / 0 |
| Memphis–Iowa State, Nov. 2, 2026 | Memphis +15.5 | 444 | 364 | 267 | −12 to +6 | 0 / 0 |
| Brooklyn–Boston, Oct. 27, 2026 | Brooklyn +13.5 | 519 | 365 | 230 | 0 to +7 | 0 / 0 |

All 497 material changes and every 75/85/90 crossing are retained in the [material ledger](output/release-basketball-material-20261103.csv); all smaller changes remain in the JSON. There are 53 distinct crossing rows: 10 downward 75, 18 downward 85 and 11 downward 90 boundary events in Memphis, and 18 upward 75 events in Brooklyn. Four rows cross two thresholds. These cross-model comparisons are not chronological notification events.

## Ordinary NCAAM games

Memphis +15.5 supplies 207 rated first-half and 114 rated second-half states within three points, finishing with an archived 80–76 upset. Oakland +26.5 supplies 94 close first-half states before Michigan pulls away; Chattanooga +30.5 supplies ten. The older three genuine upset archives add close states in both halves, but their missing or untimestamped current markets do not establish a verified pregame line. No historical quote was invented to activate the upset factor.

Representative archived observations, with score listed away–home:

| Memphis +15.5 source play | Phase / clock | Score | Dog WP | Rating before → after | Upset before → after |
|---|---|---|---:|---|---|
| 401909771120508496 | H1 6:09 | 30–30 | 16.6% | 46 → 48 | 0 → 2 |
| 401909771120510828 | H1 5:29 | 32–31 | 16.4% | 58 → 46 | 14 → 2 |
| 401909771120554850 | H2 13:10 | 48–48 | 23.9% | 52 → 58 | 0 → 6 |
| 401909771120557575 | H2 12:04 | 53–50 | 38.8% | 71 → 62 | 16 → 7 |
| 401909771120577943 | H2 3:53 | 69–66 | 56.9% | 79 → 72 | 17 → 10 |
| 401909771120585539 | H2 1:00 | 75–71 | 67.9% | 83 → 75 | 18 → 10 |

These states have unknown possession and complete scoring evidence. All non-upset factors in the material rows are exactly unchanged. The larger reductions remove the old discrete leading-underdog awards; the +6 tie increase fills the old gap before 70% elapsed. The first-half −12 is the largest reduction, with no new negative or missing scoring factor. The game's peak declines 99 → 92; its credible late upset remains highly rated. Only two total deltas differ from their upset-point deltas, explained by the unchanged 99-point ceiling.

The separate adjacent-clock controls verify the 35%/70% boundaries without pretending that two one-second variants are archived observations. Wofford 16–15 at H1 6:01/6:00/5:59 remains 50/50/50, upset 3/3/3. The existing NCAAM/NBA clock and spread continuity tests pass.

## NBA late one-possession coverage

Brooklyn +13.5 has **55 rated states within three points and under four minutes in Q4**: four with confirmed Brooklyn possession, seven Boston, and 44 unknown. The archive includes all three possession categories while Brooklyn trails, as well as tied and leading states. Decimal-second clocks such as `30.0` are correctly counted; the audit selector was fixed and regression-tested after an earlier version counted only minute:second clocks and the final few seconds. This is a reporting correction, not a scoring change.

| Source play | Q4 clock | Brooklyn–Boston | Possession | Dog WP | Rating before → after | Upset before → after |
|---|---|---|---|---:|---|---|
| 401909877635 | 3:59 | 104–104 | unknown | 41.4% | 67 → 73 | 0 → 6 |
| 401909877640 | 3:21 | 107–104 | Boston | 59.4% | 64 → 70 | 0 → 6 |
| 401909877643 | 3:17 | 107–104 | Brooklyn | 67.9% | 62 → 68 | 0 → 6 |
| 401909877724 | 3.0 seconds | 114–117 | Boston | 2.3% | 42 → 42 | 0 → 0 |
| 401909877732 | 3.0 seconds | 114–117 | Brooklyn | 4.7% | 70 → 70 | 0 → 0 |
| 401909877736 | 2.7 seconds | 114–117 | unknown | 4.3% | 48 → 48 | 0 → 0 |

The largest increase is 61 → 68 at Q4 5:34, Brooklyn leading 102–99 with 53.3% WP and unknown possession. The new seven-point surprise component is discounted 1.2 points for correlated history; all other factors remain identical. The old production path supplied zero upset points at these NBA observations. Brooklyn's replay peak becomes 82 from 77, with no new 85/90 states. The final-seconds examples retain conservative comeback treatment despite a large spread and, in one case, confirmed underdog possession. Their differing existing tension/possession totals are preserved.

Detroit–Boston adds 30 late-Q4 close states but has no acceptable retained closing market. It is useful missing-market evidence, not proof of a quantified large-underdog expectation. No line from a separate article or hypothetical fixture is spliced into the provider archive.

## Validation and limits

`node --test test/release-basketball-validation.test.js test/basketball-upset.test.js`: **24 passed, zero failures/skips**. This includes exact archive hashes, actual completed-score/factor preservation for all eight games, real regular-season and possession coverage, controlled missing/stale market and missing-WP omissions, unconfirmed zero-clock withholding, period/overtime transitions, impossible seven-/fourteen-point two-second comebacks, and independent NBA maturity/overlap/possession controls. Controlled omissions and impossible-comeback cases are explicitly simulations, never claimed historical observations.

`node scripts/release-basketball-report.mjs` reruns every causal archived checkpoint through both Worker scoring facades. Opening ratings are unchanged in every row. All material rows preserve every non-upset scoring factor. Sixty-two reconstructed states carry partial scoring evidence (including all sixteen withheld states); they cannot justify alerts. Complete scoring evidence is not proof that every provider record was available or that the app observed a chronological threshold crossing. No notification is implied by this replay.

The extra archives close the requested historical regular-season and large-underdog late-NBA possession coverage gaps. They do not prove exact live market availability or exhaustive behavior across all basketball games. All raw source bytes, stored historical ratings and production scoring files remain unchanged by this supplemental audit.
