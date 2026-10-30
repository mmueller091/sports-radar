# Phase 3.1 ownership and live recommendation guardrails

Experimental only. Production/default Phase 2/completed scoring unchanged. Trajectory remains explicit opt-in. Existing Phase 3 policies and reports are retained byte-for-byte. No configuration is promoted or selected as an accuracy winner. No staging, commit, deployment or push.

Authoritative replay: 24562 states across 107 games; 122810 direct-path finalizations; 1645 independent complete checks. Frozen pre-task shadow oracle agrees at all 24562 trajectory-off states; raw sport/event/live-aggregation and batch mismatches are zero.

See [ownership audit](trajectory-history-ownership.md) for all sports, caps, retained event ownership and required pre-existing helper dependencies.

## Corrected calculation

Revised candidates remove only the live sustained factor BEFORE history caps. Discrete event factors retain their original order and formulas; reclaimed capacity can flow to later event evidence. Positive net trajectory enters the same history cap after event factors (shared 15; NHL 12 and its original regulation/OT/shootout headroom). The sport live bonus is recomputed by the existing direct path and stays unchanged; history aggregation intentionally changes. Never subtract a nominal factor from a capped score.

Both revised candidates use the retained +10/-8 structural family, .25-.75 maturity, and 65% margin-only positive confidence. Gates are .35-.85 and .45-.95. Separate revival award is zero, with late-movement/revival diagnostics retained. Positive effective gate is max(current-closeness gate, 0.5 * decisiveStrength). This modest support comes from validated sport leverage, not a second WP multiplier.

decisiveStrength = max(existing decisive-drive urgency, final-possession urgency, clamp(existing floor increment / 20)). The denominator is the existing ordinary competitive-situation cap. Negative trajectory multiplier = 1 - .75 * decisiveStrength, leaving 25% at full strength. Its remaining penalty cannot take a rating below base + the existing floor increment. A floor increment is not an absolute 85/90 target. Only trajectory penalties are constrained; this cannot create positive points or erase unrelated penalties.

## Gate behavior (before decisive support)

Closeness | gate-10-65-wp-100 | gate-45-95-wp-65 | live-owned-35-85 | live-owned-45-95
--- | --- | --- | --- | ---
0 | 0 | 0 | 0 | 0
0.1 | 0 | 0 | 0 | 0
0.4 | 0.568 | 0 | 0.028 | 0
0.65 | 1 | 0.352 | 0.648 | 0.352
0.75 | 1 | 0.648 | 0.896 | 0.648
0.9 | 1 | 0.972 | 1 | 0.972
1 | 1 | 1 | 1 | 1

## Same-present paired histories

Fixture | phase2 | gate-10-65-wp-100 | gate-45-95-wp-65 | live-owned-35-85 | live-owned-45-95
--- | --- | --- | --- | --- | ---
decisive: classic / competitive | 99 | 99 | 99 | 99 | 99
decisive: poor / false-close | 99 | 94 | 94 | 99 | 99
neutral: classic / competitive | 65 | 75 | 73 | 66 | 66
neutral: poor / false-close | 63 | 56 | 56 | 56 | 56
falseClose: classic / competitive | 65 | 75 | 73 | 66 | 66
falseClose: poor / false-close | 64 | 56 | 56 | 53 | 53
nowBlowout: classic / competitive | 16 | 16 | 16 | 16 | 16
nowBlowout: poor / false-close | 5 | 1 | 1 | 1 | 1

Within each pair, score, clock, possession, field position, current WP, current non-scoring event, teams and stakes are identical. Tests verify identical Current Tension, raw sport situations, pressure, milestones and event shocks. Earlier lead/comeback evidence is intentionally retained and can differ. These synthetic constraints test mechanics, not historical accuracy.

### Pair diagnostics: live-owned-35-85

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
decisive-0 | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 9.8843 | 4 | 0 / 0 | 3 | 99
decisive-1 | positioned-win-probability / 1 / 11 | 0 | 1 | 0 | -1.8747 | -5.3628 | 0 | 0 | 0 | -1.8094 / -1.8094 | 0 | 99
neutral-0 | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 9.8843 | 4 | 0 / 0 | 3 | 66
neutral-1 | positioned-win-probability / 1 / 11 | 0 | 1 | 0 | -1.8747 | -5.3628 | 0 | 0 | 0 | -7.2376 / -7.2376 | 0 | 56
falseClose-0 | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 9.8843 | 4 | 0 / 0 | 3 | 66
falseClose-1 | positioned-win-probability / 1 / 11 | 0.2359 | 1 | 0.2359 | -4.4801 | -5.7045 | 0 | 0 | 0 | -8 / -8 | 3 | 53
nowBlowout-0 | positioned-win-probability / 1 / 11 | 6.2122 | 1 | 6.2122 | -0.6659 | -2.0382 | 0 | 0 | 0 | 0 / 0 | 0 | 16
nowBlowout-1 | positioned-win-probability / 1 / 11 | 0 | 1 | 0 | -1.2793 | -6.3744 | 0 | 0 | 0 | -7.6537 / -7.6537 | 0 | 1

### Pair diagnostics: live-owned-45-95

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
decisive-0 | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 8.4008 | 4 | 0 / 0 | 3 | 99
decisive-1 | positioned-win-probability / 1 / 11 | 0 | 1 | 0 | -1.8747 | -5.3628 | 0 | 0 | 0 | -1.8094 / -1.8094 | 0 | 99
neutral-0 | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 8.4008 | 4 | 0 / 0 | 3 | 66
neutral-1 | positioned-win-probability / 1 / 11 | 0 | 1 | 0 | -1.8747 | -5.3628 | 0 | 0 | 0 | -7.2376 / -7.2376 | 0 | 56
falseClose-0 | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 8.4008 | 4 | 0 / 0 | 3 | 66
falseClose-1 | positioned-win-probability / 1 / 11 | 0.2359 | 1 | 0.2359 | -4.4801 | -5.7045 | 0 | 0 | 0 | -8 / -8 | 3 | 53
nowBlowout-0 | positioned-win-probability / 1 / 11 | 6.2122 | 1 | 6.2122 | -0.6659 | -2.0382 | 0 | 0 | 0 | 0 / 0 | 0 | 16
nowBlowout-1 | positioned-win-probability / 1 / 11 | 0 | 1 | 0 | -1.2793 | -6.3744 | 0 | 0 | 0 | -7.6537 / -7.6537 | 0 | 1

## NHL regulation / OT / shootout

Fixture | phase2 | gate-10-65-wp-100 | gate-45-95-wp-65 | live-owned-35-85 | live-owned-45-95
--- | --- | --- | --- | --- | ---
regulation-quiet | 90 | 99 | 96 | 90 | 90
regulation-recent | 95 | 99 | 97 | 95 | 95
ot-start | 94 | 99 | 99 | 94 | 94
ot-middle | 94 | 99 | 99 | 94 | 94
ot-end | 94 | 99 | 99 | 94 | 94
shootout | 92 | 99 | 98 | 92 | 92
playoff-ot | 98 | 99 | 99 | 99 | 99

Quiet tied regulation at <=15 seconds has zero history headroom; fresh tying/go-ahead events permit up to five. Regular-season OT permits 94 minus its existing current target; shootout permits two. Revised trajectory uses these same budgets after preserved events. Playoff OT retains its existing separate behavior. Existing Phase 3 adds trajectory after these budgets and can bypass them.

### NHL diagnostics: live-owned-35-85

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
regulation-quiet | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0107 | 0 | 6.4893 | 0 | 0 / 0 | 0 | 90
regulation-recent | margin-fallback / 0 / 0 | 4.6823 | 0.65 | 3.0435 | 0 | -1.2813 | 0 | 1.7622 | 0 | 0 / 0 | 0 | 95
ot-start | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0085 | 0 | 6.4915 | 2 | 0 / 0 | 2 | 94
ot-middle | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0085 | 0 | 6.4915 | 1 | 0 / 0 | 1 | 94
ot-end | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.008 | 0 | 6.492 | 0 | 0 / 0 | 0 | 94
shootout | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0064 | 0 | 6.4936 | 2 | 0 / 0 | 2 | 92
playoff-ot | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0101 | 0 | 6.4899 | 6.4899 | 0 / 0 | 3 | 99

### NHL diagnostics: live-owned-45-95

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
regulation-quiet | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0107 | 0 | 6.4893 | 0 | 0 / 0 | 0 | 90
regulation-recent | margin-fallback / 0 / 0 | 4.6823 | 0.65 | 3.0435 | 0 | -1.2813 | 0 | 1.7622 | 0 | 0 / 0 | 0 | 95
ot-start | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0085 | 0 | 6.4915 | 2 | 0 / 0 | 2 | 94
ot-middle | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0085 | 0 | 6.4915 | 1 | 0 / 0 | 1 | 94
ot-end | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.008 | 0 | 6.492 | 0 | 0 / 0 | 0 | 94
shootout | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0064 | 0 | 6.4936 | 2 | 0 / 0 | 2 | 92
playoff-ot | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0101 | 0 | 6.4899 | 6.4899 | 0 / 0 | 3 | 99

## Evidence variants

Fixture | phase2 | gate-10-65-wp-100 | gate-45-95-wp-65 | live-owned-35-85 | live-owned-45-95
--- | --- | --- | --- | --- | ---
full | 65 | 75 | 73 | 66 | 66
missing | 67 | 77 | 73 | 70 | 70
singleton | 60 | 70 | 65 | 63 | 62
earlyOnly | 67 | 77 | 74 | 71 | 71
lateOnly | 65 | 75 | 71 | 66 | 66
sparse | 65 | 73 | 70 | 66 | 66
internalGap | 65 | 75 | 72 | 66 | 66

Full/missing/singleton/early-only/late-only/sparse variants reuse identical score history. Missing and stale early-only WP also change current-WP availability under the unchanged validator; the JSON reports currentCloseness and currentWp to keep that effect distinct from history confidence. No absent data is replaced with 50/50.

The current Phase 1 representation interpolates between positioned observations and has no discontinuous-gap metadata. The internalGap case removes intermediate observations but still reports full endpoint coverage; it is NOT proof of observed uncertainty inside the gap. Count confidence limits sparse cases, but does not resolve this representation limitation. No fake gap support or probability extrapolation was added.

### Evidence diagnostics: live-owned-35-85

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
full | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 9.8843 | 4 | 0 / 0 | 3 | 66
missing | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0188 | 0 | 6.4812 | 6.4812 | 0 / 0 | 3 | 70
singleton | margin-fallback / 0 / 1 | 10 | 0.65 | 6.5 | 0 | -0.0188 | 0 | 6.4342 | 6.4342 | 0 / 0 | 3 | 63
earlyOnly | positioned-win-probability / 0.3061 / 4 | 10 | 0.7007 | 7.0075 | 0 | 0 | 0 | 7.0075 | 7.0075 | 0 / 0 | 3 | 71
lateOnly | positioned-win-probability / 0.1837 / 3 | 10 | 0.6609 | 6.6094 | -0.025 | -0.0436 | 0 | 6.4934 | 4 | 0 / 0 | 3 | 66
sparse | positioned-win-probability / 1 / 2 | 9.5802 | 0.6864 | 6.5759 | -0.7121 | -0.5333 | 0 | 5.2918 | 4 | 0 / 0 | 3 | 66
internalGap | positioned-win-probability / 1 / 4 | 10 | 0.8768 | 8.768 | 0 | -0.0435 | 0 | 8.6612 | 4 | 0 / 0 | 3 | 66

### Evidence diagnostics: live-owned-45-95

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
full | positioned-win-probability / 1 / 11 | 10 | 1 | 10 | 0 | -0.0435 | 0 | 8.4008 | 4 | 0 / 0 | 3 | 66
missing | margin-fallback / 0 / 0 | 10 | 0.65 | 6.5 | 0 | -0.0188 | 0 | 6.4812 | 6.4812 | 0 / 0 | 3 | 70
singleton | margin-fallback / 0 / 1 | 10 | 0.65 | 6.5 | 0 | -0.0188 | 0 | 5.4685 | 5.4685 | 0 / 0 | 3 | 62
earlyOnly | positioned-win-probability / 0.3061 / 4 | 10 | 0.7007 | 7.0075 | 0 | 0 | 0 | 7.0075 | 7.0075 | 0 / 0 | 3 | 71
lateOnly | positioned-win-probability / 0.1837 / 3 | 10 | 0.6609 | 6.6094 | -0.025 | -0.0436 | 0 | 5.5188 | 4 | 0 / 0 | 3 | 66
sparse | positioned-win-probability / 1 / 2 | 9.5802 | 0.6864 | 6.5759 | -0.7121 | -0.5333 | 0 | 4.4976 | 4 | 0 / 0 | 3 | 66
internalGap | positioned-win-probability / 1 / 4 | 10 | 0.8768 | 8.768 | 0 | -0.0435 | 0 | 7.3613 | 4 | 0 / 0 | 3 | 66

## Revival and internal overlap ablations

Tiny late WP changes total 0.00002 probability movement and concentrate 1 of all movement late. Existing revival contribution: 0.5072; same trajectory with revival disabled: 0. Revised policies award zero separate revival, retaining discrete event credit.

Archetype | Ablation | Sustained after confidence | False-close | Dominance | Raw | Adjustment
--- | --- | --- | --- | --- | --- | ---
sustained | all | 10 | -0.0276 | -0.0085 | 9.9639 | 9.9639
sustained | noFalseClose | 10 | 0 | -0.0085 | 9.9915 | 9.9915
sustained | noDominance | 10 | -0.0276 | 0 | 9.9724 | 9.9724
sustained | noExplicitPenalties | 10 | 0 | 0 | 10 | 10
sustained | noQualityReduction | 10 | -0.0276 | -0.0085 | 9.9639 | 9.9639
false-close | all | 2.2242 | -3.5708 | -4.6138 | -5.9605 | -5.9605
false-close | noFalseClose | 2.2242 | 0 | -4.6138 | -2.3896 | -2.3896
false-close | noDominance | 2.2242 | -3.5708 | 0 | -1.3467 | -1.3467
false-close | noExplicitPenalties | 2.2242 | 0 | 0 | 2.2242 | 1.1121
false-close | noQualityReduction | 10 | -3.5708 | -4.6138 | 1.8154 | 0.9077
blowout | all | 0 | -0.926 | -5.6501 | -6.5761 | -6.5761
blowout | noFalseClose | 0 | 0 | -5.6501 | -5.6501 | -5.6501
blowout | noDominance | 0 | -0.926 | 0 | -0.926 | -0.926
blowout | noExplicitPenalties | 0 | 0 | 0 | 0 | 0
blowout | noQualityReduction | 0 | -0.926 | -5.6501 | -6.5761 | -6.5761
missing-wp | all | 6.5 | 0 | -0.0039 | 6.4961 | 6.4961
missing-wp | noFalseClose | 6.5 | 0 | -0.0039 | 6.4961 | 6.4961
missing-wp | noDominance | 6.5 | 0 | 0 | 6.5 | 6.5
missing-wp | noExplicitPenalties | 6.5 | 0 | 0 | 6.5 | 6.5
missing-wp | noQualityReduction | 6.5 | 0 | -0.0039 | 6.4961 | 6.4961
limited-wp | all | 6.4995 | -0.3536 | -0.4533 | 5.6926 | 5.6926
limited-wp | noFalseClose | 6.4995 | 0 | -0.4533 | 6.0462 | 6.0462
limited-wp | noDominance | 6.4995 | -0.3536 | 0 | 6.1459 | 6.1459
limited-wp | noExplicitPenalties | 6.4995 | 0 | 0 | 6.4995 | 6.4995
limited-wp | noQualityReduction | 6.5113 | -0.3536 | -0.4533 | 5.7043 | 5.7043

Quality reduction, false-close and dominance are correlated responses to one-sided WP, not three independent observations. The ablations expose their additive effect: removing a penalty is materially different from restoring quality. Their raw sum is bounded at -8 before evidence/urgency protection. This task retains those weights; the unlabelled archive cannot establish whether both penalties are needed. Treat this internal overlap as a remaining calibration limitation, not independent corroboration.

## Replay summary

View | States | Games | Checkpoint mean | Equal-game mean | Mean delta | Equal-game delta | Delta vs existing | 99 count
--- | --- | --- | --- | --- | --- | --- | --- | ---
phase2 | 24562 | 107 | 52.0892 | 51.4822 | 0 | 0 | -0.7635 | 251
gate-10-65-wp-100 | 24562 | 107 | 53.6388 | 52.8222 | 1.5496 | 1.34 | 0.7861 | 673
gate-45-95-wp-65 | 24562 | 107 | 52.8527 | 52.1205 | 0.7635 | 0.6382 | 0 | 470
live-owned-35-85 | 24562 | 107 | 51.5786 | 50.8614 | -0.5106 | -0.6208 | -1.2741 | 296
live-owned-45-95 | 24562 | 107 | 51.461 | 50.7366 | -0.6282 | -0.7456 | -1.3916 | 282

Checkpoint means weight long/dense games more. Equal-game means first average each game and then weight the 107 games equally. JSON includes equal-game threshold shares and exact-99 shares. This is sensitivity reporting, not a quality objective.

Anchor | phase2 | gate-10-65-wp-100 | gate-45-95-wp-65 | live-owned-35-85 | live-owned-45-95
--- | --- | --- | --- | --- | ---
blowout | 1 | 1 | 1 | 1 | 1
ordinaryCloseEarly | 59 | 59 | 59 | 59 | 59
requiredCFB | 50 | 58 | 53 | 52 | 50
closeCFB5050 | 86 | 92 | 92 | 88 | 88
nflLateUncertain | 74 | 83 | 83 | 74 | 74
strongEarly | 75 | 75 | 75 | 75 | 75
nflCloseOneSided | 59 | 67 | 62 | 59 | 59
decisiveNFLDrive | 90 | 95 | 93 | 94 | 93

Anchor scores are not pinned to Phase 2. For example, the .45-.95 CFB one-sided anchor replaces three old sustained points with about 3.04 recalculated trajectory points. The uncertain NFL anchor already has 15 retained event points, leaving no trajectory headroom; its unchanged 74 follows the existing budget. The uncertain CFB anchor has five points of remaining event-history capacity and reaches 88. These changes follow ownership and caps, not desired final scores.

### Anchor ownership: live-owned-35-85

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | positioned-win-probability / 0.9978 / 125 | 0 | 1 | 0 | -2.6732 | -6.295 | 0 | 0 | 0 | -8 / -8 | 0 | 1
ordinaryCloseEarly | positioned-win-probability / 1 / 23 | 10 | 1 | 10 | -0.2263 | -0.0498 | 0 | 0 | 0 | 0 / 0 | 0 | 59
requiredCFB | positioned-win-probability / 1 / 136 | 9.5334 | 1 | 9.5334 | -0.8072 | -0.7779 | 0 | 5.3889 | 5.3889 | 0 / 0 | 3 | 52
closeCFB5050 | positioned-win-probability / 1 / 33 | 8.7335 | 1 | 8.7335 | -1.3345 | -1.2435 | 0 | 6.1554 | 5 | 0 / 0 | 3 | 88
nflLateUncertain | positioned-win-probability / 1 / 137 | 9.6371 | 1 | 9.6371 | -0.749 | -0.4761 | 0 | 8.412 | 0 | 0 / 0 | 0 | 74
strongEarly | positioned-win-probability / 1 / 26 | 9.4507 | 1 | 9.4507 | -0.7163 | -0.5274 | 0 | 0 | 0 | 0 / 0 | 0 | 75
nflCloseOneSided | positioned-win-probability / 1 / 131 | 9.1348 | 1 | 9.1348 | -0.6482 | -0.6865 | 0 | 5.0207 | 3 | 0 / 0 | 3 | 59
decisiveNFLDrive | positioned-win-probability / 1 / 140 | 6.992 | 1 | 6.992 | -0.8093 | -1.4214 | 0 | 4.2013 | 4.2013 | 0 / 0 | 0 | 94

### Anchor ownership: live-owned-45-95

Case | Source / coverage / count | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Revival | Requested positive | Positive after caps | Negative after taper / floor | History removed (net) | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | positioned-win-probability / 0.9978 / 125 | 0 | 1 | 0 | -2.6732 | -6.295 | 0 | 0 | 0 | -8 / -8 | 0 | 1
ordinaryCloseEarly | positioned-win-probability / 1 / 23 | 10 | 1 | 10 | -0.2263 | -0.0498 | 0 | 0 | 0 | 0 / 0 | 0 | 59
requiredCFB | positioned-win-probability / 1 / 136 | 9.5334 | 1 | 9.5334 | -0.8072 | -0.7779 | 0 | 3.0405 | 3.0405 | 0 / 0 | 3 | 50
closeCFB5050 | positioned-win-probability / 1 / 33 | 8.7335 | 1 | 8.7335 | -1.3345 | -1.2435 | 0 | 6.1554 | 5 | 0 / 0 | 3 | 88
nflLateUncertain | positioned-win-probability / 1 / 137 | 9.6371 | 1 | 9.6371 | -0.749 | -0.4761 | 0 | 8.412 | 0 | 0 / 0 | 0 | 74
strongEarly | positioned-win-probability / 1 / 26 | 9.4507 | 1 | 9.4507 | -0.7163 | -0.5274 | 0 | 0 | 0 | 0 / 0 | 0 | 75
nflCloseOneSided | positioned-win-probability / 1 / 131 | 9.1348 | 1 | 9.1348 | -0.6482 | -0.6865 | 0 | 2.712 | 2.712 | 0 / 0 | 3 | 59
decisiveNFLDrive | positioned-win-probability / 1 / 140 | 6.992 | 1 | 6.992 | -0.8093 | -1.4214 | 0 | 2.9899 | 2.9899 | 0 / 0 | 0 | 93

The replay decisive group includes ANY positive sport floor increment, including weak increments of only two to six points; it is broader than the fully urgent synthetic possession. Its largest decreases include removal of three overlapping sustained points plus a partially tapered penalty. The JSON exposes floor increments and taper strength for those states. Fully supported urgent states retain at most 25% of the trajectory penalty and preserve their sport floor. Both decisive paired finals saturate at 99; their raw components, including the -1.81 poor-history adjustment, are reported to avoid treating saturation as proof of protection.

## phase2

View | States | Games | Checkpoint mean | Equal-game mean | Mean delta | Equal-game delta | Delta vs existing | 99 count
--- | --- | --- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 51.4822 | 0 | 0 | -0.7635 | 251
CFB | 8909 | 50 | 49.3535 | 49.1667 | 0 | 0 | -0.1283 | 145
MLB | 830 | 2 | 59.3349 | 59.3326 | 0 | 0 | 0.0855 | 0
NBA | 1450 | 3 | 45.9917 | 45.9858 | 0 | 0 | -0.4724 | 0
NCAAB | 677 | 2 | 72.7267 | 72.779 | 0 | 0 | -2.1536 | 0
NFL | 4734 | 25 | 53.4956 | 53.4102 | 0 | 0 | -0.9254 | 83
NHL | 7962 | 25 | 52.9145 | 52.513 | 0 | 0 | -1.4012 | 23
decisive | 1868 | 57 | 84.2313 | 83.8052 | 0 | 0 | -3.818 | 251
neutral | 20265 | 107 | 48.9336 | 49.1482 | 0 | 0 | -0.4344 | 0
specific | 2429 | 81 | 53.6978 | 51.0966 | 0 | 0 | -1.1593 | 0
0-25% | 5651 | 107 | 59.1594 | 58.001 | 0 | 0 | 0 | 0
25-50% | 6674 | 107 | 53.2853 | 52.9585 | 0 | 0 | -0.6074 | 0
50-75% | 5725 | 107 | 47.3034 | 47.6333 | 0 | 0 | -1.6398 | 0
75-90% | 3484 | 107 | 48.4041 | 47.6553 | 0 | 0 | -1.1992 | 11
90%+ | 3028 | 107 | 49.5466 | 43.2014 | 0 | 0 | -0.3738 | 240

Threshold | Baseline | Candidate | Up | Down | Equal-game baseline share | Equal-game candidate share
--- | --- | --- | --- | --- | --- | ---
70 | 2899 | 2899 | 0 | 0 | 0.1037 | 0.1037
85 | 997 | 997 | 0 | 0 | 0.0387 | 0.0387
90 | 734 | 734 | 0 | 0 | 0.0299 | 0.0299
95 | 398 | 398 | 0 | 0 | 0.019 | 0.019

Ownership/guardrails: {"statesWithReallocatedHistory":0,"meanReplaced":0,"statesPositiveCapped":0,"statesNegativeTapered":0,"statesFloorProtected":0}.

Extreme | State | Sport | Phase 2 | Existing Phase 3 | Candidate | Delta
--- | --- | --- | --- | --- | --- | ---
increase | 401856719:4018567193 | CFB | 53 | 53 | 53 | 0
increase | 401856719:40185671912 | CFB | 53 | 53 | 53 | 0
increase | 401856719:40185671916 | CFB | 53 | 53 | 53 | 0
increase | 401856719:40185671923 | CFB | 53 | 53 | 53 | 0
increase | 401856719:40185671928 | CFB | 53 | 53 | 53 | 0
increase | 401856719:40185671933 | CFB | 51 | 51 | 51 | 0
increase | 401856719:40185671940 | CFB | 51 | 51 | 51 | 0
increase | 401856719:40185671943 | CFB | 51 | 51 | 51 | 0
increase | 401856719:40185671946 | CFB | 51 | 51 | 51 | 0
increase | 401856719:40185671949 | CFB | 51 | 51 | 51 | 0
decrease | 401856719:4018567193 | CFB | 53 | 53 | 53 | 0
decrease | 401856719:40185671912 | CFB | 53 | 53 | 53 | 0
decrease | 401856719:40185671916 | CFB | 53 | 53 | 53 | 0
decrease | 401856719:40185671923 | CFB | 53 | 53 | 53 | 0
decrease | 401856719:40185671928 | CFB | 53 | 53 | 53 | 0
decrease | 401856719:40185671933 | CFB | 51 | 51 | 51 | 0
decrease | 401856719:40185671940 | CFB | 51 | 51 | 51 | 0
decrease | 401856719:40185671943 | CFB | 51 | 51 | 51 | 0
decrease | 401856719:40185671946 | CFB | 51 | 51 | 51 | 0
decrease | 401856719:40185671949 | CFB | 51 | 51 | 51 | 0
decisive decrease | 401856719:401856719668 | CFB | 70 | 71 | 70 | 0
decisive decrease | 401856719:401856719672 | CFB | 71 | 72 | 71 | 0
decisive decrease | 401856719:401856719677 | CFB | 70 | 71 | 70 | 0
decisive decrease | 401856719:401856719680 | CFB | 73 | 74 | 73 | 0
decisive decrease | 401856719:401856719685 | CFB | 75 | 76 | 75 | 0
decisive decrease | 401856719:401856719688 | CFB | 77 | 78 | 77 | 0
decisive decrease | 401856719:401856719693 | CFB | 79 | 80 | 79 | 0
decisive decrease | 401856719:401856719698 | CFB | 81 | 82 | 81 | 0
decisive decrease | 401856719:401856719701 | CFB | 83 | 84 | 83 | 0
decisive decrease | 401856719:401856719706 | CFB | 86 | 87 | 86 | 0

## gate-10-65-wp-100

View | States | Games | Checkpoint mean | Equal-game mean | Mean delta | Equal-game delta | Delta vs existing | 99 count
--- | --- | --- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 53.6388 | 52.8222 | 1.5496 | 1.34 | 0.7861 | 673
CFB | 8909 | 50 | 49.9305 | 49.7283 | 0.5771 | 0.5616 | 0.4488 | 248
MLB | 830 | 2 | 59.4458 | 59.453 | 0.1108 | 0.1205 | 0.1964 | 0
NBA | 1450 | 3 | 47.349 | 47.3367 | 1.3572 | 1.3509 | 0.8848 | 0
NCAAB | 677 | 2 | 76.13 | 76.1895 | 3.4032 | 3.4105 | 1.2496 | 1
NFL | 4734 | 25 | 55.1029 | 54.99 | 1.6073 | 1.5798 | 0.6819 | 118
NHL | 7962 | 25 | 55.5453 | 55.1006 | 2.6309 | 2.5876 | 1.2297 | 306
decisive | 1868 | 57 | 89.9727 | 87.4138 | 5.7414 | 3.6086 | 1.9234 | 672
neutral | 20265 | 107 | 50.0388 | 50.1927 | 1.1053 | 1.0445 | 0.6708 | 0
specific | 2429 | 81 | 55.7308 | 52.2486 | 2.0329 | 1.152 | 0.8736 | 1
0-25% | 5651 | 107 | 59.1594 | 58.001 | 0 | 0 | 0 | 0
25-50% | 6674 | 107 | 54.3064 | 53.8932 | 1.0211 | 0.9347 | 0.4137 | 0
50-75% | 5725 | 107 | 50.2405 | 50.1998 | 2.9371 | 2.5665 | 1.2973 | 0
75-90% | 3484 | 107 | 51.2425 | 50.1745 | 2.8384 | 2.5192 | 1.6392 | 95
90%+ | 3028 | 107 | 51.0466 | 44.2299 | 1.5 | 1.0285 | 1.1262 | 578

Threshold | Baseline | Candidate | Up | Down | Equal-game baseline share | Equal-game candidate share
--- | --- | --- | --- | --- | --- | ---
70 | 2899 | 3999 | 1113 | 13 | 0.1037 | 0.1506
85 | 997 | 1472 | 482 | 7 | 0.0387 | 0.0532
90 | 734 | 1230 | 498 | 2 | 0.0299 | 0.0452
95 | 398 | 901 | 506 | 3 | 0.019 | 0.0346

Ownership/guardrails: {"statesWithReallocatedHistory":0,"meanReplaced":0,"statesPositiveCapped":0,"statesNegativeTapered":0,"statesFloorProtected":0}.

Extreme | State | Sport | Phase 2 | Existing Phase 3 | Candidate | Delta
--- | --- | --- | --- | --- | --- | ---
increase | 401864524:401864524468 | CFB | 64 | 73 | 74 | 10
increase | 401864524:401864524478 | CFB | 64 | 73 | 74 | 10
increase | 401864524:401864524476 | CFB | 64 | 73 | 74 | 10
increase | 401864524:401864524480 | CFB | 66 | 75 | 76 | 10
increase | 401864524:401864524484 | CFB | 66 | 75 | 76 | 10
increase | 401864524:401864524488 | CFB | 66 | 75 | 76 | 10
increase | 401864524:401864524495 | CFB | 67 | 76 | 77 | 10
increase | 401864524:401864524499 | CFB | 67 | 76 | 77 | 10
increase | 401864524:401864524510 | CFB | 67 | 76 | 77 | 10
increase | 401864524:401864524508 | CFB | 67 | 76 | 77 | 10
decrease | 401856725:401856725487 | CFB | 13 | 5 | 5 | -8
decrease | 401856725:401856725493 | CFB | 13 | 5 | 5 | -8
decrease | 401856828:401856828615 | CFB | 25 | 17 | 17 | -8
decrease | 401856828:401856828622 | CFB | 25 | 17 | 17 | -8
decrease | 401856828:401856828626 | CFB | 16 | 8 | 8 | -8
decrease | 401856828:401856828631 | CFB | 24 | 16 | 16 | -8
decrease | 401856828:401856828636 | CFB | 22 | 14 | 14 | -8
decrease | 401856828:401856828641 | CFB | 22 | 14 | 14 | -8
decrease | 401856828:401856828646 | CFB | 22 | 14 | 14 | -8
decrease | 401856828:401856828651 | CFB | 22 | 14 | 14 | -8
decisive decrease | 401866443:401866443698 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443707 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443708 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443705 | CFB | 87 | 80 | 80 | -7
decisive decrease | 401866443:401866443714 | CFB | 89 | 82 | 82 | -7
decisive decrease | 401866443:401866443719 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443723 | CFB | 65 | 58 | 58 | -7
decisive decrease | 401866443:401866443728 | CFB | 48 | 41 | 41 | -7
decisive decrease | 401866443:401866443733 | CFB | 40 | 33 | 33 | -7
decisive decrease | 401866443:401866443731 | CFB | 37 | 30 | 30 | -7

## gate-45-95-wp-65

View | States | Games | Checkpoint mean | Equal-game mean | Mean delta | Equal-game delta | Delta vs existing | 99 count
--- | --- | --- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.8527 | 52.1205 | 0.7635 | 0.6382 | 0 | 470
CFB | 8909 | 50 | 49.4818 | 49.2832 | 0.1283 | 0.1164 | 0 | 226
MLB | 830 | 2 | 59.2494 | 59.2531 | -0.0855 | -0.0794 | 0 | 0
NBA | 1450 | 3 | 46.4641 | 46.4523 | 0.4724 | 0.4664 | 0 | 0
NCAAB | 677 | 2 | 74.8804 | 74.9424 | 2.1536 | 2.1634 | 0 | 0
NFL | 4734 | 25 | 54.421 | 54.3163 | 0.9254 | 0.9061 | 0 | 113
NHL | 7962 | 25 | 54.3156 | 53.883 | 1.4012 | 1.37 | 0 | 131
decisive | 1868 | 57 | 88.0493 | 86.0233 | 3.818 | 2.2181 | 0 | 470
neutral | 20265 | 107 | 49.368 | 49.5827 | 0.4344 | 0.4345 | 0 | 0
specific | 2429 | 81 | 54.8571 | 51.5929 | 1.1593 | 0.4963 | 0 | 0
0-25% | 5651 | 107 | 59.1594 | 58.001 | 0 | 0 | 0 | 0
25-50% | 6674 | 107 | 53.8927 | 53.5269 | 0.6074 | 0.5684 | 0 | 0
50-75% | 5725 | 107 | 48.9432 | 49.0789 | 1.6398 | 1.4456 | 0 | 0
75-90% | 3484 | 107 | 49.6033 | 48.7334 | 1.1992 | 1.0781 | 0 | 49
90%+ | 3028 | 107 | 49.9204 | 43.227 | 0.3738 | 0.0257 | 0 | 421

Threshold | Baseline | Candidate | Up | Down | Equal-game baseline share | Equal-game candidate share
--- | --- | --- | --- | --- | --- | ---
70 | 2899 | 3676 | 790 | 13 | 0.1037 | 0.1391
85 | 997 | 1346 | 356 | 7 | 0.0387 | 0.0493
90 | 734 | 1041 | 309 | 2 | 0.0299 | 0.0394
95 | 398 | 762 | 367 | 3 | 0.019 | 0.0303

Ownership/guardrails: {"statesWithReallocatedHistory":0,"meanReplaced":0,"statesPositiveCapped":0,"statesNegativeTapered":0,"statesFloorProtected":0}.

Extreme | State | Sport | Phase 2 | Existing Phase 3 | Candidate | Delta
--- | --- | --- | --- | --- | --- | ---
increase | 401856830:401856830576 | CFB | 71 | 80 | 80 | 9
increase | 401856830:401856830594 | CFB | 69 | 78 | 78 | 9
increase | 401856830:401856830598 | CFB | 71 | 80 | 80 | 9
increase | 401856830:401856830603 | CFB | 68 | 77 | 77 | 9
increase | 401856830:401856830607 | CFB | 69 | 78 | 78 | 9
increase | 401856830:401856830611 | CFB | 69 | 78 | 78 | 9
increase | 401856830:401856830615 | CFB | 70 | 79 | 79 | 9
increase | 401856830:401856830620 | CFB | 69 | 78 | 78 | 9
increase | 401856830:401856830624 | CFB | 69 | 78 | 78 | 9
increase | 401856830:401856830628 | CFB | 71 | 80 | 80 | 9
decrease | 401856725:401856725487 | CFB | 13 | 5 | 5 | -8
decrease | 401856725:401856725493 | CFB | 13 | 5 | 5 | -8
decrease | 401856828:401856828615 | CFB | 25 | 17 | 17 | -8
decrease | 401856828:401856828622 | CFB | 25 | 17 | 17 | -8
decrease | 401856828:401856828626 | CFB | 16 | 8 | 8 | -8
decrease | 401856828:401856828631 | CFB | 24 | 16 | 16 | -8
decrease | 401856828:401856828636 | CFB | 22 | 14 | 14 | -8
decrease | 401856828:401856828641 | CFB | 22 | 14 | 14 | -8
decrease | 401856828:401856828646 | CFB | 22 | 14 | 14 | -8
decrease | 401856828:401856828651 | CFB | 22 | 14 | 14 | -8
decisive decrease | 401866443:401866443698 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443707 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443708 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443705 | CFB | 87 | 80 | 80 | -7
decisive decrease | 401866443:401866443714 | CFB | 89 | 82 | 82 | -7
decisive decrease | 401866443:401866443719 | CFB | 86 | 79 | 79 | -7
decisive decrease | 401866443:401866443723 | CFB | 65 | 58 | 58 | -7
decisive decrease | 401866443:401866443728 | CFB | 48 | 41 | 41 | -7
decisive decrease | 401866443:401866443733 | CFB | 40 | 33 | 33 | -7
decisive decrease | 401866443:401866443731 | CFB | 37 | 30 | 30 | -7

## live-owned-35-85

View | States | Games | Checkpoint mean | Equal-game mean | Mean delta | Equal-game delta | Delta vs existing | 99 count
--- | --- | --- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 51.5786 | 50.8614 | -0.5106 | -0.6208 | -1.2741 | 296
CFB | 8909 | 50 | 48.3119 | 48.1146 | -1.0415 | -1.0522 | -1.1698 | 180
MLB | 830 | 2 | 58.1337 | 58.147 | -1.2012 | -1.1856 | -1.1157 | 0
NBA | 1450 | 3 | 45.3952 | 45.3816 | -0.5966 | -0.6042 | -1.069 | 0
NCAAB | 677 | 2 | 73.096 | 73.1496 | 0.3693 | 0.3706 | -1.7843 | 0
NFL | 4734 | 25 | 53.079 | 52.9665 | -0.4166 | -0.4436 | -1.342 | 92
NHL | 7962 | 25 | 52.9548 | 52.5417 | 0.0403 | 0.0287 | -1.3608 | 24
decisive | 1868 | 57 | 85.3426 | 84.1303 | 1.1113 | 0.3251 | -2.7066 | 296
neutral | 20265 | 107 | 48.2769 | 48.4586 | -0.6567 | -0.6896 | -1.0911 | 0
specific | 2429 | 81 | 53.1585 | 50.2008 | -0.5393 | -0.8958 | -1.6986 | 0
0-25% | 5651 | 107 | 59.1594 | 58.001 | 0 | 0 | 0 | 0
25-50% | 6674 | 107 | 53.004 | 52.6489 | -0.2812 | -0.3096 | -0.8887 | 0
50-75% | 5725 | 107 | 46.7123 | 46.8073 | -0.5911 | -0.8259 | -2.2309 | 0
75-90% | 3484 | 107 | 47.3743 | 46.5164 | -1.0299 | -1.1389 | -2.229 | 12
90%+ | 3028 | 107 | 48.3269 | 41.7432 | -1.2196 | -1.4582 | -1.5935 | 284

Threshold | Baseline | Candidate | Up | Down | Equal-game baseline share | Equal-game candidate share
--- | --- | --- | --- | --- | --- | ---
70 | 2899 | 3007 | 131 | 23 | 0.1037 | 0.108
85 | 997 | 1159 | 170 | 8 | 0.0387 | 0.0433
90 | 734 | 775 | 45 | 4 | 0.0299 | 0.0311
95 | 398 | 401 | 6 | 3 | 0.019 | 0.0191

Ownership/guardrails: {"statesWithReallocatedHistory":10177,"meanReplaced":1.0659,"statesPositiveCapped":3065,"statesNegativeTapered":95,"statesFloorProtected":10}.

Extreme | State | Sport | Phase 2 | Existing Phase 3 | Candidate | Delta
--- | --- | --- | --- | --- | --- | ---
increase | 401858490:401858490465 | CFB | 56 | 63 | 65 | 9
increase | 401858490:401858490457 | CFB | 54 | 61 | 62 | 8
increase | 401858490:401858490461 | CFB | 52 | 59 | 60 | 8
increase | 401858490:401858490469 | CFB | 52 | 58 | 60 | 8
increase | 401858490:401858490488 | CFB | 51 | 56 | 59 | 8
increase | 401858490:401858490494 | CFB | 51 | 56 | 59 | 8
increase | 401858490:401858490412 | CFB | 58 | 64 | 65 | 7
increase | 401858490:401858490417 | CFB | 57 | 63 | 64 | 7
increase | 401858490:401858490421 | CFB | 58 | 65 | 65 | 7
increase | 401858490:401858490426 | CFB | 58 | 65 | 65 | 7
decrease | 401858262:401858262610 | CFB | 20 | 12 | 9 | -11
decrease | 401858262:401858262615 | CFB | 18 | 10 | 7 | -11
decrease | 401858262:401858262619 | CFB | 16 | 8 | 5 | -11
decrease | 401858262:401858262622 | CFB | 14 | 6 | 3 | -11
decrease | 401858262:401858262627 | CFB | 12 | 4 | 1 | -11
decrease | 401858262:401858262641 | CFB | 22 | 14 | 11 | -11
decrease | 401858262:401858262657 | CFB | 15 | 7 | 4 | -11
decrease | 401858262:401858262660 | CFB | 20 | 12 | 9 | -11
decrease | 401858262:401858262664 | CFB | 29 | 21 | 18 | -11
decrease | 401858262:401858262670 | CFB | 29 | 21 | 18 | -11
decisive decrease | 401856833:401856833802 | CFB | 42 | 39 | 36 | -6
decisive decrease | 401856833:401856833808 | CFB | 45 | 42 | 39 | -6
decisive decrease | 401858263:401858263632 | CFB | 64 | 62 | 58 | -6
decisive decrease | 401858263:401858263641 | CFB | 64 | 62 | 58 | -6
decisive decrease | 401858263:401858263639 | CFB | 64 | 62 | 58 | -6
decisive decrease | 401856833:401856833804 | CFB | 47 | 44 | 42 | -5
decisive decrease | 401858263:401858263643 | CFB | 66 | 64 | 61 | -5
decisive decrease | 401858263:401858263648 | CFB | 64 | 62 | 59 | -5
decisive decrease | 401858263:401858263655 | CFB | 66 | 64 | 61 | -5
decisive decrease | 401858263:401858263659 | CFB | 71 | 69 | 66 | -5

## live-owned-45-95

View | States | Games | Checkpoint mean | Equal-game mean | Mean delta | Equal-game delta | Delta vs existing | 99 count
--- | --- | --- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 51.461 | 50.7366 | -0.6282 | -0.7456 | -1.3916 | 282
CFB | 8909 | 50 | 48.174 | 47.979 | -1.1795 | -1.1877 | -1.3078 | 168
MLB | 830 | 2 | 58.1313 | 58.1445 | -1.2036 | -1.1881 | -1.1181 | 0
NBA | 1450 | 3 | 45.1841 | 45.1717 | -0.8076 | -0.8142 | -1.28 | 0
NCAAB | 677 | 2 | 72.7651 | 72.8226 | 0.0384 | 0.0436 | -2.1152 | 0
NFL | 4734 | 25 | 52.9001 | 52.7897 | -0.5955 | -0.6205 | -1.5209 | 90
NHL | 7962 | 25 | 52.9197 | 52.5068 | 0.0053 | -0.0062 | -1.3959 | 24
decisive | 1868 | 57 | 85.2827 | 84.0256 | 1.0514 | 0.2204 | -2.7666 | 282
neutral | 20265 | 107 | 48.164 | 48.3365 | -0.7696 | -0.8117 | -1.204 | 0
specific | 2429 | 81 | 52.9576 | 50.0303 | -0.7402 | -1.0663 | -1.8995 | 0
0-25% | 5651 | 107 | 59.1594 | 58.001 | 0 | 0 | 0 | 0
25-50% | 6674 | 107 | 52.9095 | 52.5485 | -0.3758 | -0.41 | -0.9832 | 0
50-75% | 5725 | 107 | 46.5079 | 46.5923 | -0.7955 | -1.041 | -2.4353 | 0
75-90% | 3484 | 107 | 47.1352 | 46.2627 | -1.2689 | -1.3926 | -2.4681 | 12
90%+ | 3028 | 107 | 48.2434 | 41.6618 | -1.3032 | -1.5396 | -1.677 | 270

Threshold | Baseline | Candidate | Up | Down | Equal-game baseline share | Equal-game candidate share
--- | --- | --- | --- | --- | --- | ---
70 | 2899 | 2978 | 119 | 40 | 0.1037 | 0.1071
85 | 997 | 1155 | 166 | 8 | 0.0387 | 0.0431
90 | 734 | 775 | 45 | 4 | 0.0299 | 0.0311
95 | 398 | 401 | 6 | 3 | 0.019 | 0.0191

Ownership/guardrails: {"statesWithReallocatedHistory":10177,"meanReplaced":1.0659,"statesPositiveCapped":2802,"statesNegativeTapered":95,"statesFloorProtected":10}.

Extreme | State | Sport | Phase 2 | Existing Phase 3 | Candidate | Delta
--- | --- | --- | --- | --- | --- | ---
increase | 401858490:401858490421 | CFB | 58 | 65 | 65 | 7
increase | 401858490:401858490426 | CFB | 58 | 65 | 65 | 7
increase | 401858490:401858490429 | CFB | 58 | 65 | 65 | 7
increase | 401858490:401858490434 | CFB | 59 | 66 | 66 | 7
increase | 401858490:401858490439 | CFB | 58 | 65 | 65 | 7
increase | 401858490:401858490443 | CFB | 59 | 66 | 66 | 7
increase | 401858490:401858490448 | CFB | 57 | 64 | 64 | 7
increase | 401858490:401858490465 | CFB | 56 | 63 | 63 | 7
increase | 401858490:401858490371 | CFB | 54 | 60 | 60 | 6
increase | 401858490:401858490376 | CFB | 51 | 57 | 57 | 6
decrease | 401858262:401858262610 | CFB | 20 | 12 | 9 | -11
decrease | 401858262:401858262615 | CFB | 18 | 10 | 7 | -11
decrease | 401858262:401858262619 | CFB | 16 | 8 | 5 | -11
decrease | 401858262:401858262622 | CFB | 14 | 6 | 3 | -11
decrease | 401858262:401858262627 | CFB | 12 | 4 | 1 | -11
decrease | 401858262:401858262641 | CFB | 22 | 14 | 11 | -11
decrease | 401858262:401858262657 | CFB | 15 | 7 | 4 | -11
decrease | 401858262:401858262660 | CFB | 20 | 12 | 9 | -11
decrease | 401858262:401858262664 | CFB | 29 | 21 | 18 | -11
decrease | 401858262:401858262670 | CFB | 29 | 21 | 18 | -11
decisive decrease | 401856833:401856833802 | CFB | 42 | 39 | 36 | -6
decisive decrease | 401856833:401856833808 | CFB | 45 | 42 | 39 | -6
decisive decrease | 401858263:401858263632 | CFB | 64 | 62 | 58 | -6
decisive decrease | 401858263:401858263641 | CFB | 64 | 62 | 58 | -6
decisive decrease | 401858263:401858263639 | CFB | 64 | 62 | 58 | -6
decisive decrease | 401856833:401856833804 | CFB | 47 | 44 | 42 | -5
decisive decrease | 401858263:401858263643 | CFB | 66 | 64 | 61 | -5
decisive decrease | 401858263:401858263648 | CFB | 64 | 62 | 59 | -5
decisive decrease | 401858263:401858263655 | CFB | 66 | 64 | 61 | -5
decisive decrease | 401858263:401858263659 | CFB | 71 | 69 | 66 | -5

## Limitations and checkpoint dependencies

No accuracy winner is selected. Both revised gates pass targeted semantics, but the archive lacks labelled history quality and robust revival/partial-WP cases. NHL has no positioned WP; Soccer/Tennis have no archived replay; NBA/NCAAB/MLB samples remain small. Synthetic examples establish invariants only. Historical stagnation and discrete-event awards remain owned by existing sport/event logic; this task does not redesign Peak Drama or fit penalty weights.

Any checkpoint must include the preserved shared aggregateLiveBonus extraction (pressure.js plus rating-core.js caller), basketball candidatePoints separation, NHL elapsed-clock telemetry corrections in probability.js/trajectory.js, the shadow replay helpers and Phase 3 policy/telemetry baseline. These are required dependencies, not unrelated changes merely because they predate this task. See the ownership audit for precise roles.

## Validation record

505 distinct repository tests passed across the full suite and targeted additions/reruns; Worker bundling passed after the sandbox directory-access restriction was removed for that test. Scoring/watchlist/timeline fixtures, syntax checks and git diff --check passed. Existing Phase 3 baselines and all pre-existing files outside the three intentional edits matched their initial SHA256 hashes.

Phase 3.1 change | File
--- | ---
Modified | calibration/shadow-candidate.cjs
Modified | scoring/shared/history.js
Modified | scoring/sports/nhl.js
Added | calibration/trajectory-live-policy.cjs
Added | calibration/trajectory-live-fixtures.mjs
Added | calibration/trajectory-history-ownership.md
Added | scripts/trajectory-live-calibration.mjs
Added | calibration/output/trajectory-live-calibration.json
Added | calibration/trajectory-live-calibration-report.md
Added | test/fixtures/phase31-shadow-before.cjs.gz
Added | test/helpers/phase31-oracle.cjs
Added | test/trajectory-live.test.js
Added | test/trajectory-live-calibration.test.js

Machine-readable results: [output/trajectory-live-calibration.json](output/trajectory-live-calibration.json).
