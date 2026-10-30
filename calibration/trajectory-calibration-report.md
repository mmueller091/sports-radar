# Phase 3 targeted trajectory calibration

Trajectory remains explicitly opt-in. No production scoring, Phase 1 telemetry, Phase 2 default, sport scoring or revival changes. No promotion, staging, commit, deployment or push. Existing NHL elapsed-clock correction is retained unchanged.

Evaluated 24562 states x 24 policies = 589488 actual candidate finalizations. 7896 independent complete policy calls agree; downstream mismatches: 0.

Authoritative chronological checkpoint candidate path; every explicit policy runs before final clamp/round. Shared Phase 2 base/live evaluation verified against independent complete calls. No finalized-rating patches. Phase 1 telemetry unchanged, including the prior NHL elapsed-clock correction. Checkpoint-weighted; states within games are correlated. Buckets overlap; neutral can hide missing situations.

## Policies and recommendation

The grid crosses gates .10-.65, .20-.70, .25-.75, .30-.80, .35-.85 and .45-.95 with fallback positive confidence .50, .65, .80 and 1.00. The additional .45-.95 ramp tests modest historical credit at the one-sided anchors (currentCloseness about .65); the five requested ramps remain relatively permissive there. All other structure is fixed: +10/-8 caps; genuine .75, false-close .75, dominance .80; revival maximum 3; evidence .25-.75.

Preferred for further validation: **gate-45-95-wp-65**. Provisional semantic preference: the .45-.95 gate reduces one-sided-current anchor credit to about three points while preserving strong uncertain states. A 65% fallback retains meaningful scoreboard recognition with a material distinction from sufficiently observed uncertainty; 50% is more restrictive and 80% retains most of the unsupported maximum. This is an interpretable compromise, not an optimum inferred from aggregate NHL ratings or an unlabelled archive.

The reference gate-10-65-wp-100 reproduces the previous slow-evidence configuration. The recommendation is report metadata only and does not enable a default.

Policy | Gate | Fallback confidence | Mean | Median | Mean delta | NHL mean delta
--- | --- | --- | --- | --- | --- | ---
gate-10-65-wp-50 | 0.1-0.65 | 0.5 | 53.1818 | 57 | 1.0926 | 1.2276
gate-10-65-wp-65 | 0.1-0.65 | 0.65 | 53.3154 | 57 | 1.2262 | 1.6389
gate-10-65-wp-80 | 0.1-0.65 | 0.8 | 53.4614 | 57 | 1.3722 | 2.0885
gate-10-65-wp-100 | 0.1-0.65 | 1 | 53.6388 | 57 | 1.5496 | 2.6309
gate-20-70-wp-50 | 0.2-0.7 | 0.5 | 53.1103 | 57 | 1.0211 | 1.1722
gate-20-70-wp-65 | 0.2-0.7 | 0.65 | 53.2389 | 57 | 1.1497 | 1.5688
gate-20-70-wp-80 | 0.2-0.7 | 0.8 | 53.3794 | 57 | 1.2902 | 2.0015
gate-20-70-wp-100 | 0.2-0.7 | 1 | 53.5444 | 57 | 1.4552 | 2.506
gate-25-75-wp-50 | 0.25-0.75 | 0.5 | 53.0488 | 57 | 0.9596 | 1.1192
gate-25-75-wp-65 | 0.25-0.75 | 0.65 | 53.1754 | 57 | 1.0861 | 1.509
gate-25-75-wp-80 | 0.25-0.75 | 0.8 | 53.3148 | 57 | 1.2256 | 1.9383
gate-25-75-wp-100 | 0.25-0.75 | 1 | 53.4797 | 57 | 1.3905 | 2.4427
gate-30-80-wp-50 | 0.3-0.8 | 0.5 | 52.9949 | 57 | 0.9057 | 1.1059
gate-30-80-wp-65 | 0.3-0.8 | 0.65 | 53.1139 | 57 | 1.0247 | 1.473
gate-30-80-wp-80 | 0.3-0.8 | 0.8 | 53.2477 | 57 | 1.1585 | 1.885
gate-30-80-wp-100 | 0.3-0.8 | 1 | 53.4051 | 57 | 1.3159 | 2.3665
gate-35-85-wp-50 | 0.35-0.85 | 0.5 | 52.9258 | 57 | 0.8366 | 1.0933
gate-35-85-wp-65 | 0.35-0.85 | 0.65 | 53.043 | 57 | 0.9538 | 1.4549
gate-35-85-wp-80 | 0.35-0.85 | 0.8 | 53.1742 | 57 | 1.085 | 1.859
gate-35-85-wp-100 | 0.35-0.85 | 1 | 53.3308 | 57 | 1.2416 | 2.338
gate-45-95-wp-50 | 0.45-0.95 | 0.5 | 52.742 | 57 | 0.6528 | 1.0598
gate-45-95-wp-65 | 0.45-0.95 | 0.65 | 52.8527 | 57 | 0.7635 | 1.4012
gate-45-95-wp-80 | 0.45-0.95 | 0.8 | 52.9834 | 57 | 0.8942 | 1.8039
gate-45-95-wp-100 | 0.45-0.95 | 1 | 53.1349 | 57 | 1.0457 | 2.2673

## Independently inspectable transformations

Existing sustained quality, coverage shrinkage, false-close, dominance and revival formulas remain intact. Raw sustained = 10 * smoothstep(.35,.95,sustainedQuality). Positive WP support = smoothstep(0,1,wpCoverageShare) * smoothstep(1,6,wpObservationCount) for positioned-WP telemetry, otherwise zero. Positive confidence = fallback + (1-fallback) * support. Adjusted sustained = raw sustained * positive confidence. Six positioned observations and full coverage reach full confidence; sparse observations or incomplete coverage transition smoothly. This count endpoint is a provisional adequacy guard, not a statistically fitted threshold.

Only sustained reward receives this confidence factor. Missing/singleton WP earns the fallback multiplier, never an independent negative missing-data term. Historical false-close and dominance discounts can still outweigh a smaller sustained reward. Revival is unchanged. No probability is extrapolated beyond observed coverage and no Phase 1 field is rewritten.

Raw trajectory = adjusted sustained + false-close + dominance + revival. Clamp to [-8,10], multiply by evidence smoothstep(.25,.75,end position), and multiply a positive net trajectory only by smoothstep(gateStart,gateEnd,existing Phase 2 currentCloseness). Negative net adjustments bypass the positive gate. Final candidate rating rounds/clamps base + live bonus + momentum + trajectory, preserving pre-clamp headroom.

Current closeness | gate-10-65-wp-100 | gate-20-70-wp-100 | gate-25-75-wp-100 | gate-30-80-wp-100 | gate-35-85-wp-100 | gate-45-95-wp-100
--- | --- | --- | --- | --- | --- | ---
0 | 0 | 0 | 0 | 0 | 0 | 0
0.3 | 0.3005 | 0.104 | 0.028 | 0 | 0 | 0
0.5 | 0.8174 | 0.648 | 0.5 | 0.352 | 0.216 | 0.028
0.65 | 1 | 0.972 | 0.896 | 0.784 | 0.648 | 0.352
0.75 | 1 | 1 | 1 | 0.972 | 0.896 | 0.648
0.85 | 1 | 1 | 1 | 1 | 1 | 0.896
0.95 | 1 | 1 | 1 | 1 | 1 | 1
1 | 1 | 1 | 1 | 1 | 1 | 1

## Phase 2 anchors: preferred versus reference

Anchor | Phase 2 | Reference Phase 3 | Preferred Phase 3 | Preferred delta
--- | --- | --- | --- | ---
blowout | 1 | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 59 | 0
requiredCFB | 50 | 58 | 53 | 3
closeCFB5050 | 86 | 92 | 92 | 6
nflLateUncertain | 74 | 83 | 83 | 9
strongEarly | 75 | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 62 | 3
decisiveNFLDrive | 90 | 95 | 93 | 3

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.3825 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 3.0865
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.3477 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 2.7466
decisiveNFLDrive | 0.6279 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 3.123

## Synthetic histories

History | Reference adjustment | Preferred adjustment | Change
--- | --- | --- | ---
sustained | 9.9783 | 9.9783 | 0
defensive | 9.9954 | 9.7155 | -0.2799
high-scoring | 10 | 9.72 | -0.28
false-close | -5.9605 | -5.9605 | 0
late-comeback | -5.0869 | -5.0869 | 0
late-chaos | -4.4126 | -4.4126 | 0
late-blowout | 0 | 0 | 0
blowout | -6.5761 | -6.5761 | 0
early | 0 | 0 | 0
missing-wp | 10 | 6.5222 | -3.4778
single-wp | 10 | 6.5222 | -3.4778
limited-wp | 9.1751 | 5.6926 | -3.4825
ordinary | 2.3348 | 0.8218 | -1.5129

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 0.972 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.7155
high-scoring | 0.972 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 9.72
false-close | 0.5 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.216 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 0.352 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 0.8218

These are trajectory adjustments, not full ratings. Severe late comeback and chaos remain net-negative: Current Tension carries current drama, while trajectory retains prolonged poor-history discounts. Early evidence is zero. Missing and singleton WP remain equal, but below fully supported sustained uncertainty. Late blowout has zero positive history. Defensive and high-scoring sustained games retain comparable recognition.

## NHL impact for every policy

NHL has 7962 states from 25 games and zero positioned WP states. Every NHL state therefore uses its policy's fallback positive confidence. This leaves some scoreboard-continuity recognition while acknowledging that genuine uncertainty and false closeness cannot be distinguished reliably. No NHL-specific constants were introduced.

Policy | Fallback | NHL baseline mean | NHL candidate mean | NHL mean delta | Change from reference mean
--- | --- | --- | --- | --- | ---
gate-10-65-wp-50 | 0.5 | 52.9145 | 54.142 | 1.2276 | -1.4033
gate-10-65-wp-65 | 0.65 | 52.9145 | 54.5534 | 1.6389 | -0.9919
gate-10-65-wp-80 | 0.8 | 52.9145 | 55.003 | 2.0885 | -0.5423
gate-10-65-wp-100 | 1 | 52.9145 | 55.5453 | 2.6309 | 0
gate-20-70-wp-50 | 0.5 | 52.9145 | 54.0867 | 1.1722 | -1.4586
gate-20-70-wp-65 | 0.65 | 52.9145 | 54.4833 | 1.5688 | -1.062
gate-20-70-wp-80 | 0.8 | 52.9145 | 54.916 | 2.0015 | -0.6293
gate-20-70-wp-100 | 1 | 52.9145 | 55.4205 | 2.506 | -0.1248
gate-25-75-wp-50 | 0.5 | 52.9145 | 54.0337 | 1.1192 | -1.5116
gate-25-75-wp-65 | 0.65 | 52.9145 | 54.4235 | 1.509 | -1.1218
gate-25-75-wp-80 | 0.8 | 52.9145 | 54.8528 | 1.9383 | -0.6925
gate-25-75-wp-100 | 1 | 52.9145 | 55.3572 | 2.4427 | -0.1881
gate-30-80-wp-50 | 0.5 | 52.9145 | 54.0203 | 1.1059 | -1.525
gate-30-80-wp-65 | 0.65 | 52.9145 | 54.3875 | 1.473 | -1.1578
gate-30-80-wp-80 | 0.8 | 52.9145 | 54.7994 | 1.885 | -0.7459
gate-30-80-wp-100 | 1 | 52.9145 | 55.281 | 2.3665 | -0.2643
gate-35-85-wp-50 | 0.5 | 52.9145 | 54.0078 | 1.0933 | -1.5375
gate-35-85-wp-65 | 0.65 | 52.9145 | 54.3694 | 1.4549 | -1.1759
gate-35-85-wp-80 | 0.8 | 52.9145 | 54.7734 | 1.859 | -0.7719
gate-35-85-wp-100 | 1 | 52.9145 | 55.2524 | 2.338 | -0.2929
gate-45-95-wp-50 | 0.5 | 52.9145 | 53.9743 | 1.0598 | -1.571
gate-45-95-wp-65 | 0.65 | 52.9145 | 54.3156 | 1.4012 | -1.2297
gate-45-95-wp-80 | 0.8 | 52.9145 | 54.7184 | 1.8039 | -0.8269
gate-45-95-wp-100 | 1 | 52.9145 | 55.1817 | 2.2673 | -0.3636

## Evidence comparisons

High genuine / strong WP: genuineContinuity >= .75, positioned source, coverage >= .75, count >= 6. High margin / no WP: marginContinuity >= .75 and count 0. High margin / limited WP: marginContinuity >= .75 with observations but fallback source, coverage < .75 or count < 6 (includes singleton). One-sided after genuine adds current max WP >= .85; strongly uncertain after genuine adds current max WP <= .60. These are overlapping descriptive cohorts, not labelled truth.

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 62.8451 | 60 | 2.2636
highMarginNoWp | 6432 | 27 | 59.3422 | 61.2259 | 62 | 1.8837
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8273 | 61 | 0.1271
oneSidedAfterGenuine | 674 | 40 | 52.957 | 53.8991 | 51 | 0.9421
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7124 | 62 | 2.3777

## Preferred replay distribution

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 52.8527 | 57 | 0.7635

Band | Count | Percent
--- | --- | ---
<50 | 8422 | 34.2887
50-69 | 12464 | 50.7451
70-84 | 2330 | 9.4862
85+ | 1346 | 5.48

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16140 | 159 | 61
70 | 2899 | 3676 | 790 | 13
80 | 1454 | 1813 | 365 | 6
85 | 997 | 1346 | 356 | 7
90 | 734 | 1041 | 309 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.4818 | 52 | 0.1283
NFL | 4734 | 25 | 53.4956 | 54.421 | 55 | 0.9254
NBA | 1450 | 3 | 45.9917 | 46.4641 | 49 | 0.4724
NCAAB | 677 | 2 | 72.7267 | 74.8804 | 76 | 2.1536
MLB | 830 | 2 | 59.3349 | 59.2494 | 58 | -0.0855
NHL | 7962 | 25 | 52.9145 | 54.3156 | 61 | 1.4012
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.8927 | 55 | 0.6074
50-75% | 5725 | 107 | 47.3034 | 48.9432 | 53 | 1.6398
75-90% | 3484 | 107 | 48.4041 | 49.6033 | 53 | 1.1992
90%+ | 3028 | 107 | 49.5466 | 49.9204 | 46 | 0.3738
neutral | 20457 | 107 | 49.0418 | 49.4964 | 55 | 0.4545
specificLeverage | 3018 | 77 | 61.8168 | 63.0285 | 62 | 1.2117
decisive | 1869 | 57 | 84.2253 | 88.0449 | 90 | 3.8197
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.2431 | 62 | 1.9897
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.4218 | 57 | 0.6968
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.7499 | 61 | 1.9031
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2712 | 58 | 0.1078
marginFallback | 8050 | 40 | 53.2506 | 54.6364 | 61 | 1.3858
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

## Largest preferred changes

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401856830:401856830576 | CFB | 71 | 80 | 9 | 8.7729 | 1 | 0.9762 | 1
401856830:401856830594 | CFB | 69 | 78 | 9 | 8.7456 | 1 | 0.9913 | 1
401856830:401856830598 | CFB | 71 | 80 | 9 | 8.7526 | 1 | 1 | 1
401856830:401856830603 | CFB | 68 | 77 | 9 | 8.7562 | 1 | 0.9926 | 1
401856830:401856830607 | CFB | 69 | 78 | 9 | 8.7642 | 1 | 1 | 1
401856830:401856830611 | CFB | 69 | 78 | 9 | 8.7775 | 1 | 1 | 1
401856830:401856830615 | CFB | 70 | 79 | 9 | 8.7931 | 1 | 1 | 1
401856830:401856830620 | CFB | 69 | 78 | 9 | 8.7945 | 1 | 1 | 1
401856830:401856830624 | CFB | 69 | 78 | 9 | 8.8032 | 1 | 0.9972 | 1
401856830:401856830628 | CFB | 71 | 80 | 9 | 8.8332 | 1 | 0.9671 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

## Coverage and unresolved validation

Sport | Games | States | Full states | Positioned WP | WP coverage >= 50%
--- | --- | --- | --- | --- | ---
CFB | 50 | 8909 | 7856 | 8837 | 8835
NFL | 25 | 4734 | 4361 | 4706 | 4706
NBA | 3 | 1450 | 347 | 1447 | 1447
NCAAB | 2 | 677 | 154 | 675 | 675
MLB | 2 | 830 | 693 | 705 | 694
NHL | 25 | 7962 | 0 | 0 | 0
Soccer | 0 | 0 | 0 | 0 | 0
Tennis | 0 | 0 | 0 | 0 | 0

- Insufficient labelled revival, partial/sparse-WP and cross-sport coverage for final promotion.
- No positioned NHL WP states: scoreboard continuity cannot establish genuine uncertainty or false closeness.
- Severe late revivals remain net-negative by design; no revival retuning was performed.

The narrow limited-WP bucket (coverage > 0 and < .25) has 1 state(s); the broader high-margin sparse/partial-WP cohort has 834. Late revival has 28 states across 13 games.

The two observed structural concerns are addressed by the preferred experimental policy: one-sided-current history is modest and unsupported positive sustained history cannot automatically equal fully observed genuine uncertainty. This does not establish optimal thresholds or promotion readiness. Add independent labelled defensive/high-scoring classics, false-close histories, competitive-to-blowout transitions, severe real/fake revivals, sparse observations spanning long intervals, and partial WP coverage across sports. NHL lacks positioned WP; Soccer/Tennis are absent; basketball/baseball samples are small. Keep trajectory opt-in pending expanded labelled fixtures.

## Per-policy replay details

All candidates below include distribution, crossings, sport/progress/situation/trajectory views, explicit evidence cohorts, anchors, synthetic histories and largest changes. JSON also contains exact diagnostics and examples for each cohort.

### gate-10-65-wp-50

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.1818 | 57 | 1.0926

Band | Count | Percent
--- | --- | ---
<50 | 8148 | 33.1732
50-69 | 12675 | 51.6041
70-84 | 2386 | 9.7142
85+ | 1353 | 5.5085

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16414 | 433 | 61
70 | 2899 | 3739 | 853 | 13
80 | 1454 | 1853 | 405 | 6
85 | 997 | 1353 | 363 | 7
90 | 734 | 1006 | 274 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.9301 | 53 | 0.5766
NFL | 4734 | 25 | 53.4956 | 55.1029 | 56 | 1.6073
NBA | 1450 | 3 | 45.9917 | 47.349 | 51 | 1.3572
NCAAB | 677 | 2 | 72.7267 | 76.13 | 77 | 3.4032
MLB | 830 | 2 | 59.3349 | 59.3892 | 58 | 0.0542
NHL | 7962 | 25 | 52.9145 | 54.142 | 61 | 1.2276
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0592 | 56 | 0.7739
50-75% | 5725 | 107 | 47.3034 | 49.3794 | 55 | 2.076
75-90% | 3484 | 107 | 48.4041 | 50.3539 | 56 | 1.9498
90%+ | 3028 | 107 | 49.5466 | 50.5353 | 48 | 0.9888
neutral | 20457 | 107 | 49.0418 | 49.8406 | 55 | 0.7988
specificLeverage | 3018 | 77 | 61.8168 | 63.7366 | 63 | 1.9198
decisive | 1869 | 57 | 84.2253 | 87.7544 | 89 | 3.5292
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.5866 | 62 | 2.3331
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1365 | 32 | -2.9041
highLateMovement | 1484 | 107 | 53.7251 | 54.5499 | 57 | 0.8248
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.1461 | 61 | 2.2993
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2907 | 58 | 0.1273
marginFallback | 8050 | 40 | 53.2506 | 54.4647 | 61 | 1.2142
limitedWp | 1 | 1 | 91 | 93 | 93 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.7536 | 61 | 3.172
highMarginNoWp | 6432 | 27 | 59.3422 | 61.0129 | 62 | 1.6707
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.9101 | 61 | 0.2098
oneSidedAfterGenuine | 674 | 40 | 52.957 | 57.3591 | 56 | 4.4021
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7667 | 62 | 2.432

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9658 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.3807
highMarginNoWp | 0.9104 | 0.5 | 0.4132 | 9.8656 | 4.9328 | 0 | -0.0907 | 0.0299 | 4.872 | 4.872 | 1.6947
highMarginLimitedWp | 0.9247 | 0.6817 | 0.056 | 8.7575 | 5.887 | -0.7918 | -0.8131 | 0.1312 | 4.4132 | 4.4386 | 0.1909
oneSidedAfterGenuine | 0.7251 | 1 | 0.8763 | 8.9831 | 8.983 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.8509
uncertainAfterGenuine | 0.9991 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5671

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 1 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 8.0686
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 1 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.8993
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.9767 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.5 | 0 | 10 | 5 | 0 | -0.0015 | 0.0156 | 5.0141 | 5.0141 | 0
missing-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
single-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
limited-wp | 1 | 0.5016 | 1 | 9.982 | 5.0071 | -0.3536 | -0.4533 | 0 | 4.2001 | 4.2001 | 4.2001
ordinary | 1 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.3348

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0.0832 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0.0892 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0.0061 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0.0351 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0.034 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0.0335 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0.0321 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0.0291 | 1

### gate-10-65-wp-65

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.3154 | 57 | 1.2262

Band | Count | Percent
--- | --- | ---
<50 | 8136 | 33.1243
50-69 | 12633 | 51.4331
70-84 | 2421 | 9.8567
85+ | 1372 | 5.5859

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16426 | 445 | 61
70 | 2899 | 3793 | 907 | 13
80 | 1454 | 1874 | 426 | 6
85 | 997 | 1372 | 382 | 7
90 | 734 | 1081 | 349 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.9302 | 53 | 0.5767
NFL | 4734 | 25 | 53.4956 | 55.1029 | 56 | 1.6073
NBA | 1450 | 3 | 45.9917 | 47.349 | 51 | 1.3572
NCAAB | 677 | 2 | 72.7267 | 76.13 | 77 | 3.4032
MLB | 830 | 2 | 59.3349 | 59.394 | 58 | 0.059
NHL | 7962 | 25 | 52.9145 | 54.5534 | 61 | 1.6389
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.1263 | 56 | 0.841
50-75% | 5725 | 107 | 47.3034 | 49.626 | 55 | 2.3226
75-90% | 3484 | 107 | 48.4041 | 50.6154 | 56 | 2.2113
90%+ | 3028 | 107 | 49.5466 | 50.7034 | 48 | 1.1569
neutral | 20457 | 107 | 49.0418 | 49.9416 | 55 | 0.8997
specificLeverage | 3018 | 77 | 61.8168 | 63.7369 | 63 | 1.9201
decisive | 1869 | 57 | 84.2253 | 88.4045 | 91 | 4.1792
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.8083 | 62 | 2.5548
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.8403 | 57 | 1.1152
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.3462 | 62 | 2.4994
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3055 | 58 | 0.1421
marginFallback | 8050 | 40 | 53.2506 | 54.8716 | 61 | 1.621
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.7536 | 61 | 3.172
highMarginNoWp | 6432 | 27 | 59.3422 | 61.4821 | 62 | 2.1399
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.9161 | 61 | 0.2158
oneSidedAfterGenuine | 674 | 40 | 52.957 | 57.3591 | 56 | 4.4021
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7667 | 62 | 2.432

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9658 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.3807
highMarginNoWp | 0.9104 | 0.65 | 0.4132 | 9.8656 | 6.4126 | 0 | -0.0907 | 0.0299 | 6.3518 | 6.3518 | 2.2091
highMarginLimitedWp | 0.9247 | 0.7772 | 0.056 | 8.7575 | 6.7481 | -0.7918 | -0.8131 | 0.1312 | 5.2744 | 5.2995 | 0.2062
oneSidedAfterGenuine | 0.7251 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.8509
uncertainAfterGenuine | 0.9991 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5671

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 1 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 8.0686
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 1 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.8993
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.9767 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 1 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.3348

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0.0832 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0.0892 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0.0061 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0.0351 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0.034 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0.0335 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0.0321 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0.0291 | 1

### gate-10-65-wp-80

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.4614 | 57 | 1.3722

Band | Count | Percent
--- | --- | ---
<50 | 8117 | 33.047
50-69 | 12581 | 51.2214
70-84 | 2468 | 10.048
85+ | 1396 | 5.6836

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16445 | 464 | 61
70 | 2899 | 3864 | 978 | 13
80 | 1454 | 1915 | 467 | 6
85 | 997 | 1396 | 406 | 7
90 | 734 | 1125 | 393 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.9303 | 53 | 0.5768
NFL | 4734 | 25 | 53.4956 | 55.1029 | 56 | 1.6073
NBA | 1450 | 3 | 45.9917 | 47.349 | 51 | 1.3572
NCAAB | 677 | 2 | 72.7267 | 76.13 | 77 | 3.4032
MLB | 830 | 2 | 59.3349 | 59.4 | 58 | 0.0651
NHL | 7962 | 25 | 52.9145 | 55.003 | 61 | 2.0885
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.2099 | 56 | 0.9246
50-75% | 5725 | 107 | 47.3034 | 49.8957 | 55 | 2.5923
75-90% | 3484 | 107 | 48.4041 | 50.8975 | 56 | 2.4934
90%+ | 3028 | 107 | 49.5466 | 50.8689 | 48 | 1.3223
neutral | 20457 | 107 | 49.0418 | 50.0488 | 55 | 1.0069
specificLeverage | 3018 | 77 | 61.8168 | 63.7372 | 63 | 1.9205
decisive | 1869 | 57 | 84.2253 | 89.1498 | 92 | 4.9246
highGenuineContinuity | 13634 | 87 | 60.2535 | 63.0519 | 62 | 2.7984
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1372 | 32 | -2.9034
highLateMovement | 1484 | 107 | 53.7251 | 55.0809 | 57 | 1.3558
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.5661 | 62 | 2.7193
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3293 | 58 | 0.1659
marginFallback | 8050 | 40 | 53.2506 | 55.3163 | 61 | 2.0657
limitedWp | 1 | 1 | 91 | 95 | 95 | 4

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.7536 | 61 | 3.172
highMarginNoWp | 6432 | 27 | 59.3422 | 61.9983 | 62 | 2.6561
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.9185 | 61 | 0.2182
oneSidedAfterGenuine | 674 | 40 | 52.957 | 57.3591 | 56 | 4.4021
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7667 | 62 | 2.432

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9658 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.3807
highMarginNoWp | 0.9104 | 0.8 | 0.4132 | 9.8656 | 7.8925 | 0 | -0.0907 | 0.0299 | 7.8316 | 7.8316 | 2.7234
highMarginLimitedWp | 0.9247 | 0.8727 | 0.056 | 8.7575 | 7.6093 | -0.7918 | -0.8131 | 0.1312 | 6.1356 | 6.1605 | 0.2214
oneSidedAfterGenuine | 0.7251 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.8509
uncertainAfterGenuine | 0.9991 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5671

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 1 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 8.0686
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 1 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.8993
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.9767 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.8 | 0 | 10 | 8 | 0 | -0.0015 | 0.0156 | 8.0141 | 8.0141 | 0
missing-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
single-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
limited-wp | 1 | 0.8006 | 1 | 9.982 | 7.992 | -0.3536 | -0.4533 | 0 | 7.1851 | 7.1851 | 7.1851
ordinary | 1 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.3348

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0.0832 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0.0892 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0.0061 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0.0351 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0.034 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0.0335 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0.0321 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0.0291 | 1

### gate-10-65-wp-100

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.6388 | 57 | 1.5496

Band | Count | Percent
--- | --- | ---
<50 | 8085 | 32.9167
50-69 | 12478 | 50.8021
70-84 | 2527 | 10.2883
85+ | 1472 | 5.993

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16477 | 496 | 61
70 | 2899 | 3999 | 1113 | 13
80 | 1454 | 1969 | 521 | 6
85 | 997 | 1472 | 482 | 7
90 | 734 | 1230 | 498 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.9305 | 53 | 0.5771
NFL | 4734 | 25 | 53.4956 | 55.1029 | 56 | 1.6073
NBA | 1450 | 3 | 45.9917 | 47.349 | 51 | 1.3572
NCAAB | 677 | 2 | 72.7267 | 76.13 | 77 | 3.4032
MLB | 830 | 2 | 59.3349 | 59.4458 | 58 | 0.1108
NHL | 7962 | 25 | 52.9145 | 55.5453 | 61 | 2.6309
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.3064 | 56 | 1.0211
50-75% | 5725 | 107 | 47.3034 | 50.2405 | 55 | 2.9371
75-90% | 3484 | 107 | 48.4041 | 51.2425 | 56 | 2.8384
90%+ | 3028 | 107 | 49.5466 | 51.0466 | 48 | 1.5
neutral | 20457 | 107 | 49.0418 | 50.1871 | 55 | 1.1452
specificLeverage | 3018 | 77 | 61.8168 | 63.7379 | 63 | 1.9211
decisive | 1869 | 57 | 84.2253 | 89.9679 | 94 | 5.7426
highGenuineContinuity | 13634 | 87 | 60.2535 | 63.3455 | 62 | 3.092
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1378 | 32 | -2.9027
highLateMovement | 1484 | 107 | 53.7251 | 55.4124 | 57 | 1.6873
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.8312 | 62 | 2.9844
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.347 | 58 | 0.1836
marginFallback | 8050 | 40 | 53.2506 | 55.8527 | 61 | 2.6021
limitedWp | 1 | 1 | 91 | 97 | 97 | 6

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.7536 | 61 | 3.172
highMarginNoWp | 6432 | 27 | 59.3422 | 62.6155 | 62 | 3.2733
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.9616 | 61 | 0.2614
oneSidedAfterGenuine | 674 | 40 | 52.957 | 57.3591 | 56 | 4.4021
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7667 | 62 | 2.432

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9658 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2515 | 8.2515 | 3.3807
highMarginNoWp | 0.9104 | 1 | 0.4132 | 9.8656 | 9.8656 | 0 | -0.0907 | 0.0299 | 9.8047 | 9.8003 | 3.4077
highMarginLimitedWp | 0.9247 | 1 | 0.056 | 8.7575 | 8.7575 | -0.7918 | -0.8131 | 0.1312 | 7.2838 | 7.3086 | 0.2418
oneSidedAfterGenuine | 0.7251 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.8509
uncertainAfterGenuine | 0.9991 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5671

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 1 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 8.0686
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 1 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.8993
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.9767 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 1 | 0 | 10 | 10 | 0 | -0.0015 | 0.0156 | 10.0141 | 10 | 0
missing-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
single-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
limited-wp | 1 | 1 | 1 | 9.982 | 9.982 | -0.3536 | -0.4533 | 0 | 9.1751 | 9.1751 | 9.1751
ordinary | 1 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.3348

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0.0832 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0.0892 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0.0061 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0.0351 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0.034 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0.0335 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0.0321 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0.0291 | 1

### gate-20-70-wp-50

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.1103 | 57 | 1.0211

Band | Count | Percent
--- | --- | ---
<50 | 8199 | 33.3808
50-69 | 12628 | 51.4128
70-84 | 2385 | 9.7101
85+ | 1350 | 5.4963

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16363 | 382 | 61
70 | 2899 | 3735 | 849 | 13
80 | 1454 | 1849 | 401 | 6
85 | 997 | 1350 | 360 | 7
90 | 734 | 1006 | 274 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8838 | 53 | 0.5304
NFL | 4734 | 25 | 53.4956 | 55.0057 | 56 | 1.5101
NBA | 1450 | 3 | 45.9917 | 47.1966 | 50 | 1.2048
NCAAB | 677 | 2 | 72.7267 | 75.9335 | 77 | 3.2068
MLB | 830 | 2 | 59.3349 | 59.2819 | 58 | -0.053
NHL | 7962 | 25 | 52.9145 | 54.0867 | 61 | 1.1722
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0304 | 56 | 0.7451
50-75% | 5725 | 107 | 47.3034 | 49.2877 | 55 | 1.9843
75-90% | 3484 | 107 | 48.4041 | 50.2273 | 55 | 1.8232
90%+ | 3028 | 107 | 49.5466 | 50.3378 | 48 | 0.7913
neutral | 20457 | 107 | 49.0418 | 49.7646 | 55 | 0.7228
specificLeverage | 3018 | 77 | 61.8168 | 63.67 | 63 | 1.8532
decisive | 1869 | 57 | 84.2253 | 87.7325 | 89 | 3.5072
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.5159 | 62 | 2.2624
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1365 | 32 | -2.9041
highLateMovement | 1484 | 107 | 53.7251 | 54.4784 | 57 | 0.7534
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.071 | 61 | 2.2242
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2862 | 58 | 0.1228
marginFallback | 8050 | 40 | 53.2506 | 54.4099 | 61 | 1.1594
limitedWp | 1 | 1 | 91 | 93 | 93 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.6646 | 61 | 3.0831
highMarginNoWp | 6432 | 27 | 59.3422 | 60.963 | 62 | 1.6208
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8417 | 61 | 0.1415
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.6855 | 55 | 3.7285
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7645 | 62 | 2.4298

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9473 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.285
highMarginNoWp | 0.8884 | 0.5 | 0.4132 | 9.8656 | 4.9328 | 0 | -0.0907 | 0.0299 | 4.872 | 4.872 | 1.6329
highMarginLimitedWp | 0.8968 | 0.6817 | 0.056 | 8.7575 | 5.887 | -0.7918 | -0.8131 | 0.1312 | 4.4132 | 4.4386 | 0.1463
oneSidedAfterGenuine | 0.6093 | 1 | 0.8763 | 8.9831 | 8.983 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.1186
uncertainAfterGenuine | 0.9986 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5653

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9823 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.9256
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.9704 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.6653
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.896 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.5 | 0 | 10 | 5 | 0 | -0.0015 | 0.0156 | 5.0141 | 5.0141 | 0
missing-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
single-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
limited-wp | 1 | 0.5016 | 1 | 9.982 | 5.0071 | -0.3536 | -0.4533 | 0 | 4.2001 | 4.2001 | 4.2001
ordinary | 0.972 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.2694

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-20-70-wp-65

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.2389 | 57 | 1.1497

Band | Count | Percent
--- | --- | ---
<50 | 8198 | 33.3768
50-69 | 12575 | 51.197
70-84 | 2420 | 9.8526
85+ | 1369 | 5.5737

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16364 | 383 | 61
70 | 2899 | 3789 | 903 | 13
80 | 1454 | 1870 | 422 | 6
85 | 997 | 1369 | 379 | 7
90 | 734 | 1081 | 349 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8839 | 53 | 0.5305
NFL | 4734 | 25 | 53.4956 | 55.0057 | 56 | 1.5101
NBA | 1450 | 3 | 45.9917 | 47.1966 | 50 | 1.2048
NCAAB | 677 | 2 | 72.7267 | 75.9335 | 77 | 3.2068
MLB | 830 | 2 | 59.3349 | 59.2819 | 58 | -0.053
NHL | 7962 | 25 | 52.9145 | 54.4833 | 61 | 1.5688
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0999 | 56 | 0.8147
50-75% | 5725 | 107 | 47.3034 | 49.5216 | 55 | 2.2182
75-90% | 3484 | 107 | 48.4041 | 50.4782 | 55 | 2.0741
90%+ | 3028 | 107 | 49.5466 | 50.497 | 48 | 0.9505
neutral | 20457 | 107 | 49.0418 | 49.8597 | 55 | 0.8178
specificLeverage | 3018 | 77 | 61.8168 | 63.6703 | 63 | 1.8535
decisive | 1869 | 57 | 84.2253 | 88.3826 | 91 | 4.1573
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.7261 | 62 | 2.4726
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.7015 | 57 | 0.9764
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.2607 | 62 | 2.414
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.302 | 58 | 0.1386
marginFallback | 8050 | 40 | 53.2506 | 54.8022 | 61 | 1.5517
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.6646 | 61 | 3.0831
highMarginNoWp | 6432 | 27 | 59.3422 | 61.4086 | 62 | 2.0664
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8429 | 61 | 0.1427
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.6855 | 55 | 3.7285
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7645 | 62 | 2.4298

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9473 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.285
highMarginNoWp | 0.8884 | 0.65 | 0.4132 | 9.8656 | 6.4126 | 0 | -0.0907 | 0.0299 | 6.3518 | 6.3518 | 2.1278
highMarginLimitedWp | 0.8968 | 0.7772 | 0.056 | 8.7575 | 6.7481 | -0.7918 | -0.8131 | 0.1312 | 5.2744 | 5.2995 | 0.1596
oneSidedAfterGenuine | 0.6093 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.1186
uncertainAfterGenuine | 0.9986 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5653

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9823 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.9256
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.9704 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.6653
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.896 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 0.972 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.2694

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-20-70-wp-80

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.3794 | 57 | 1.2902

Band | Count | Percent
--- | --- | ---
<50 | 8183 | 33.3157
50-69 | 12519 | 50.969
70-84 | 2467 | 10.044
85+ | 1393 | 5.6714

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16379 | 398 | 61
70 | 2899 | 3860 | 974 | 13
80 | 1454 | 1911 | 463 | 6
85 | 997 | 1393 | 403 | 7
90 | 734 | 1125 | 393 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.884 | 53 | 0.5306
NFL | 4734 | 25 | 53.4956 | 55.0057 | 56 | 1.5101
NBA | 1450 | 3 | 45.9917 | 47.1966 | 50 | 1.2048
NCAAB | 677 | 2 | 72.7267 | 75.9335 | 77 | 3.2068
MLB | 830 | 2 | 59.3349 | 59.2867 | 58 | -0.0482
NHL | 7962 | 25 | 52.9145 | 54.916 | 61 | 2.0015
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.1731 | 56 | 0.8878
50-75% | 5725 | 107 | 47.3034 | 49.7831 | 55 | 2.4797
75-90% | 3484 | 107 | 48.4041 | 50.7555 | 55 | 2.3513
90%+ | 3028 | 107 | 49.5466 | 50.6618 | 48 | 1.1153
neutral | 20457 | 107 | 49.0418 | 49.9602 | 55 | 0.9184
specificLeverage | 3018 | 77 | 61.8168 | 63.6706 | 63 | 1.8539
decisive | 1869 | 57 | 84.2253 | 89.1279 | 92 | 4.9026
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.9594 | 62 | 2.706
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1372 | 32 | -2.9034
highLateMovement | 1484 | 107 | 53.7251 | 54.874 | 57 | 1.1489
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.4714 | 62 | 2.6246
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3272 | 58 | 0.1638
marginFallback | 8050 | 40 | 53.2506 | 55.2302 | 61 | 1.9796
limitedWp | 1 | 1 | 91 | 95 | 95 | 4

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.6646 | 61 | 3.0831
highMarginNoWp | 6432 | 27 | 59.3422 | 61.9031 | 62 | 2.5609
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8441 | 61 | 0.1439
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.6855 | 55 | 3.7285
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7645 | 62 | 2.4298

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9473 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.285
highMarginNoWp | 0.8884 | 0.8 | 0.4132 | 9.8656 | 7.8925 | 0 | -0.0907 | 0.0299 | 7.8316 | 7.8316 | 2.6228
highMarginLimitedWp | 0.8968 | 0.8727 | 0.056 | 8.7575 | 7.6093 | -0.7918 | -0.8131 | 0.1312 | 6.1356 | 6.1605 | 0.1729
oneSidedAfterGenuine | 0.6093 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.1186
uncertainAfterGenuine | 0.9986 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5653

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9823 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.9256
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.9704 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.6653
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.896 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.8 | 0 | 10 | 8 | 0 | -0.0015 | 0.0156 | 8.0141 | 8.0141 | 0
missing-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
single-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
limited-wp | 1 | 0.8006 | 1 | 9.982 | 7.992 | -0.3536 | -0.4533 | 0 | 7.1851 | 7.1851 | 7.1851
ordinary | 0.972 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.2694

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-20-70-wp-100

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.5444 | 57 | 1.4552

Band | Count | Percent
--- | --- | ---
<50 | 8168 | 33.2546
50-69 | 12399 | 50.4804
70-84 | 2526 | 10.2842
85+ | 1469 | 5.9808

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16394 | 413 | 61
70 | 2899 | 3995 | 1109 | 13
80 | 1454 | 1965 | 517 | 6
85 | 997 | 1469 | 479 | 7
90 | 734 | 1230 | 498 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8843 | 53 | 0.5308
NFL | 4734 | 25 | 53.4956 | 55.0057 | 56 | 1.5101
NBA | 1450 | 3 | 45.9917 | 47.1966 | 50 | 1.2048
NCAAB | 677 | 2 | 72.7267 | 75.9335 | 77 | 3.2068
MLB | 830 | 2 | 59.3349 | 59.3277 | 58 | -0.0072
NHL | 7962 | 25 | 52.9145 | 55.4205 | 61 | 2.506
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.2603 | 56 | 0.975
50-75% | 5725 | 107 | 47.3034 | 50.1034 | 55 | 2.8
75-90% | 3484 | 107 | 48.4041 | 51.0821 | 55 | 2.678
90%+ | 3028 | 107 | 49.5466 | 50.8266 | 48 | 1.2801
neutral | 20457 | 107 | 49.0418 | 50.0836 | 55 | 1.0417
specificLeverage | 3018 | 77 | 61.8168 | 63.6713 | 63 | 1.8545
decisive | 1869 | 57 | 84.2253 | 89.946 | 94 | 5.7207
highGenuineContinuity | 13634 | 87 | 60.2535 | 63.2372 | 62 | 2.9837
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1378 | 32 | -2.9027
highLateMovement | 1484 | 107 | 53.7251 | 55.1327 | 57 | 1.4077
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.7221 | 62 | 2.8753
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3434 | 58 | 0.18
marginFallback | 8050 | 40 | 53.2506 | 55.7292 | 61 | 2.4786
limitedWp | 1 | 1 | 91 | 97 | 97 | 6

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.6646 | 61 | 3.0831
highMarginNoWp | 6432 | 27 | 59.3422 | 62.4866 | 62 | 3.1444
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8873 | 61 | 0.1871
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.6855 | 55 | 3.7285
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7645 | 62 | 2.4298

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9473 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2515 | 8.2515 | 3.285
highMarginNoWp | 0.8884 | 1 | 0.4132 | 9.8656 | 9.8656 | 0 | -0.0907 | 0.0299 | 9.8047 | 9.8003 | 3.2813
highMarginLimitedWp | 0.8968 | 1 | 0.056 | 8.7575 | 8.7575 | -0.7918 | -0.8131 | 0.1312 | 7.2838 | 7.3086 | 0.1907
oneSidedAfterGenuine | 0.6093 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 4.1186
uncertainAfterGenuine | 0.9986 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5653

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 58 | 8
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 67 | 8
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9823 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.9256
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.9704 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.6653
decisiveNFLDrive | 1 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9734

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 1 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.896 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 1 | 0 | 10 | 10 | 0 | -0.0015 | 0.0156 | 10.0141 | 10 | 0
missing-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
single-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
limited-wp | 1 | 1 | 1 | 9.982 | 9.982 | -0.3536 | -0.4533 | 0 | 9.1751 | 9.1751 | 9.1751
ordinary | 0.972 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.2694

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-25-75-wp-50

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.0488 | 57 | 0.9596

Band | Count | Percent
--- | --- | ---
<50 | 8229 | 33.503
50-69 | 12601 | 51.3028
70-84 | 2385 | 9.7101
85+ | 1347 | 5.4841

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16333 | 352 | 61
70 | 2899 | 3732 | 846 | 13
80 | 1454 | 1837 | 389 | 6
85 | 997 | 1347 | 357 | 7
90 | 734 | 1005 | 273 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8412 | 53 | 0.4877
NFL | 4734 | 25 | 53.4956 | 54.921 | 56 | 1.4254
NBA | 1450 | 3 | 45.9917 | 47.0697 | 50 | 1.0779
NCAAB | 677 | 2 | 72.7267 | 75.7755 | 77 | 3.0487
MLB | 830 | 2 | 59.3349 | 59.2602 | 58 | -0.0747
NHL | 7962 | 25 | 52.9145 | 54.0337 | 61 | 1.1192
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.9951 | 56 | 0.7098
50-75% | 5725 | 107 | 47.3034 | 49.208 | 55 | 1.9046
75-90% | 3484 | 107 | 48.4041 | 50.099 | 55 | 1.6949
90%+ | 3028 | 107 | 49.5466 | 50.2147 | 47 | 0.6681
neutral | 20457 | 107 | 49.0418 | 49.7013 | 55 | 0.6594
specificLeverage | 3018 | 77 | 61.8168 | 63.5984 | 62 | 1.7816
decisive | 1869 | 57 | 84.2253 | 87.7036 | 89 | 3.4783
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.442 | 62 | 2.1885
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1365 | 32 | -2.9041
highLateMovement | 1484 | 107 | 53.7251 | 54.316 | 57 | 0.591
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.994 | 61 | 2.1473
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2838 | 58 | 0.1204
marginFallback | 8050 | 40 | 53.2506 | 54.3575 | 61 | 1.107
limitedWp | 1 | 1 | 91 | 93 | 93 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.5741 | 61 | 2.9926
highMarginNoWp | 6432 | 27 | 59.3422 | 60.9007 | 62 | 1.5585
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8285 | 61 | 0.1283
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.0846 | 55 | 3.1276
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.764 | 62 | 2.4293

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9279 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.1882
highMarginNoWp | 0.875 | 0.5 | 0.4132 | 9.8656 | 4.9328 | 0 | -0.0907 | 0.0299 | 4.872 | 4.872 | 1.5965
highMarginLimitedWp | 0.8769 | 0.6817 | 0.056 | 8.7575 | 5.887 | -0.7918 | -0.8131 | 0.1312 | 4.4132 | 4.4386 | 0.1313
oneSidedAfterGenuine | 0.5147 | 1 | 0.8763 | 8.9831 | 8.983 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 3.5015
uncertainAfterGenuine | 0.9976 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5643

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 66 | 7
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9154 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.3858
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.8931 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.0551
decisiveNFLDrive | 0.9994 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9705

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.972 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.784 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.5 | 0 | 10 | 5 | 0 | -0.0015 | 0.0156 | 5.0141 | 5.0141 | 0
missing-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
single-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
limited-wp | 1 | 0.5016 | 1 | 9.982 | 5.0071 | -0.3536 | -0.4533 | 0 | 4.2001 | 4.2001 | 4.2001
ordinary | 0.896 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.0919

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-25-75-wp-65

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.1754 | 57 | 1.0861

Band | Count | Percent
--- | --- | ---
<50 | 8229 | 33.503
50-69 | 12547 | 51.083
70-84 | 2420 | 9.8526
85+ | 1366 | 5.5614

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16333 | 352 | 61
70 | 2899 | 3786 | 900 | 13
80 | 1454 | 1858 | 410 | 6
85 | 997 | 1366 | 376 | 7
90 | 734 | 1080 | 348 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8413 | 53 | 0.4878
NFL | 4734 | 25 | 53.4956 | 54.921 | 56 | 1.4254
NBA | 1450 | 3 | 45.9917 | 47.0697 | 50 | 1.0779
NCAAB | 677 | 2 | 72.7267 | 75.7755 | 77 | 3.0487
MLB | 830 | 2 | 59.3349 | 59.2651 | 58 | -0.0699
NHL | 7962 | 25 | 52.9145 | 54.4235 | 61 | 1.509
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0694 | 56 | 0.7841
50-75% | 5725 | 107 | 47.3034 | 49.4292 | 55 | 2.1258
75-90% | 3484 | 107 | 48.4041 | 50.3462 | 55 | 1.942
90%+ | 3028 | 107 | 49.5466 | 50.3752 | 47 | 0.8286
neutral | 20457 | 107 | 49.0418 | 49.7939 | 55 | 0.752
specificLeverage | 3018 | 77 | 61.8168 | 63.5987 | 62 | 1.782
decisive | 1869 | 57 | 84.2253 | 88.3537 | 91 | 4.1284
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.6508 | 62 | 2.3973
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.5728 | 57 | 0.8477
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.1825 | 61 | 2.3358
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2966 | 58 | 0.1332
marginFallback | 8050 | 40 | 53.2506 | 54.7431 | 61 | 1.4925
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.5741 | 61 | 2.9926
highMarginNoWp | 6432 | 27 | 59.3422 | 61.3427 | 62 | 2.0005
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8345 | 61 | 0.1343
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.0846 | 55 | 3.1276
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.764 | 62 | 2.4293

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9279 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.1882
highMarginNoWp | 0.875 | 0.65 | 0.4132 | 9.8656 | 6.4126 | 0 | -0.0907 | 0.0299 | 6.3518 | 6.3518 | 2.08
highMarginLimitedWp | 0.8769 | 0.7772 | 0.056 | 8.7575 | 6.7481 | -0.7918 | -0.8131 | 0.1312 | 5.2744 | 5.2995 | 0.1439
oneSidedAfterGenuine | 0.5147 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 3.5015
uncertainAfterGenuine | 0.9976 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5643

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 66 | 7
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9154 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.3858
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.8931 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.0551
decisiveNFLDrive | 0.9994 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9705

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.972 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.784 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 0.896 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.0919

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-25-75-wp-80

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.3148 | 57 | 1.2256

Band | Count | Percent
--- | --- | ---
<50 | 8228 | 33.4989
50-69 | 12477 | 50.798
70-84 | 2467 | 10.044
85+ | 1390 | 5.6591

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16334 | 353 | 61
70 | 2899 | 3857 | 971 | 13
80 | 1454 | 1899 | 451 | 6
85 | 997 | 1390 | 400 | 7
90 | 734 | 1124 | 392 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8414 | 53 | 0.4879
NFL | 4734 | 25 | 53.4956 | 54.921 | 56 | 1.4254
NBA | 1450 | 3 | 45.9917 | 47.0697 | 50 | 1.0779
NCAAB | 677 | 2 | 72.7267 | 75.7755 | 77 | 3.0487
MLB | 830 | 2 | 59.3349 | 59.2723 | 58 | -0.0627
NHL | 7962 | 25 | 52.9145 | 54.8528 | 61 | 1.9383
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.151 | 56 | 0.8657
50-75% | 5725 | 107 | 47.3034 | 49.6859 | 55 | 2.3825
75-90% | 3484 | 107 | 48.4041 | 50.6117 | 55 | 2.2075
90%+ | 3028 | 107 | 49.5466 | 50.5353 | 47 | 0.9888
neutral | 20457 | 107 | 49.0418 | 49.8932 | 55 | 0.8513
specificLeverage | 3018 | 77 | 61.8168 | 63.5991 | 62 | 1.7823
decisive | 1869 | 57 | 84.2253 | 89.099 | 92 | 4.8737
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.8861 | 62 | 2.6326
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1372 | 32 | -2.9034
highLateMovement | 1484 | 107 | 53.7251 | 54.7864 | 57 | 1.0613
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.395 | 62 | 2.5482
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3216 | 58 | 0.1582
marginFallback | 8050 | 40 | 53.2506 | 55.1677 | 61 | 1.9171
limitedWp | 1 | 1 | 91 | 95 | 95 | 4

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.5741 | 61 | 2.9926
highMarginNoWp | 6432 | 27 | 59.3422 | 61.8411 | 62 | 2.4989
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8381 | 61 | 0.1379
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.0846 | 55 | 3.1276
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.764 | 62 | 2.4293

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9279 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.1882
highMarginNoWp | 0.875 | 0.8 | 0.4132 | 9.8656 | 7.8925 | 0 | -0.0907 | 0.0299 | 7.8316 | 7.8316 | 2.5636
highMarginLimitedWp | 0.8769 | 0.8727 | 0.056 | 8.7575 | 7.6093 | -0.7918 | -0.8131 | 0.1312 | 6.1356 | 6.1605 | 0.1564
oneSidedAfterGenuine | 0.5147 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 3.5015
uncertainAfterGenuine | 0.9976 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5643

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 66 | 7
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9154 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.3858
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.8931 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.0551
decisiveNFLDrive | 0.9994 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9705

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.972 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.784 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.8 | 0 | 10 | 8 | 0 | -0.0015 | 0.0156 | 8.0141 | 8.0141 | 0
missing-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
single-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
limited-wp | 1 | 0.8006 | 1 | 9.982 | 7.992 | -0.3536 | -0.4533 | 0 | 7.1851 | 7.1851 | 7.1851
ordinary | 0.896 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.0919

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-25-75-wp-100

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.4797 | 57 | 1.3905

Band | Count | Percent
--- | --- | ---
<50 | 8207 | 33.4134
50-69 | 12363 | 50.3338
70-84 | 2526 | 10.2842
85+ | 1466 | 5.9686

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16355 | 374 | 61
70 | 2899 | 3992 | 1106 | 13
80 | 1454 | 1953 | 505 | 6
85 | 997 | 1466 | 476 | 7
90 | 734 | 1229 | 497 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.8416 | 53 | 0.4882
NFL | 4734 | 25 | 53.4956 | 54.921 | 56 | 1.4254
NBA | 1450 | 3 | 45.9917 | 47.0697 | 50 | 1.0779
NCAAB | 677 | 2 | 72.7267 | 75.7755 | 77 | 3.0487
MLB | 830 | 2 | 59.3349 | 59.3108 | 58 | -0.0241
NHL | 7962 | 25 | 52.9145 | 55.3572 | 61 | 2.4427
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.243 | 56 | 0.9577
50-75% | 5725 | 107 | 47.3034 | 50.0052 | 55 | 2.7018
75-90% | 3484 | 107 | 48.4041 | 50.9325 | 55 | 2.5284
90%+ | 3028 | 107 | 49.5466 | 50.6972 | 47 | 1.1506
neutral | 20457 | 107 | 49.0418 | 50.0164 | 55 | 0.9746
specificLeverage | 3018 | 77 | 61.8168 | 63.5997 | 62 | 1.783
decisive | 1869 | 57 | 84.2253 | 89.9171 | 94 | 5.6918
highGenuineContinuity | 13634 | 87 | 60.2535 | 63.1631 | 62 | 2.9096
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1378 | 32 | -2.9027
highLateMovement | 1484 | 107 | 53.7251 | 55.031 | 57 | 1.3059
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.645 | 62 | 2.7983
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3401 | 58 | 0.1768
marginFallback | 8050 | 40 | 53.2506 | 55.6666 | 61 | 2.416
limitedWp | 1 | 1 | 91 | 97 | 97 | 6

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.5741 | 61 | 2.9926
highMarginNoWp | 6432 | 27 | 59.3422 | 62.4234 | 62 | 3.0812
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8789 | 61 | 0.1787
oneSidedAfterGenuine | 674 | 40 | 52.957 | 56.0846 | 55 | 3.1276
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.764 | 62 | 2.4293

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9279 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2515 | 8.2515 | 3.1882
highMarginNoWp | 0.875 | 1 | 0.4132 | 9.8656 | 9.8656 | 0 | -0.0907 | 0.0299 | 9.8047 | 9.8003 | 3.207
highMarginLimitedWp | 0.8769 | 1 | 0.056 | 8.7575 | 8.7575 | -0.7918 | -0.8131 | 0.1312 | 7.2838 | 7.3086 | 0.1731
oneSidedAfterGenuine | 0.5147 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 3.5015
uncertainAfterGenuine | 0.9976 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5643

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 66 | 7
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.9154 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 7.3858
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.8931 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 7.0551
decisiveNFLDrive | 0.9994 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.9705

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.972 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.784 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 1 | 0 | 10 | 10 | 0 | -0.0015 | 0.0156 | 10.0141 | 10 | 0
missing-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
single-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
limited-wp | 1 | 1 | 1 | 9.982 | 9.982 | -0.3536 | -0.4533 | 0 | 9.1751 | 9.1751 | 9.1751
ordinary | 0.896 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 2.0919

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-30-80-wp-50

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 52.9949 | 57 | 0.9057

Band | Count | Percent
--- | --- | ---
<50 | 8283 | 33.7228
50-69 | 12555 | 51.1155
70-84 | 2378 | 9.6816
85+ | 1346 | 5.48

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16279 | 298 | 61
70 | 2899 | 3724 | 838 | 13
80 | 1454 | 1831 | 383 | 6
85 | 997 | 1346 | 356 | 7
90 | 734 | 1003 | 271 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7889 | 53 | 0.4354
NFL | 4734 | 25 | 53.4956 | 54.8285 | 56 | 1.3329
NBA | 1450 | 3 | 45.9917 | 46.9379 | 50 | 0.9462
NCAAB | 677 | 2 | 72.7267 | 75.6012 | 77 | 2.8744
MLB | 830 | 2 | 59.3349 | 59.2542 | 58 | -0.0807
NHL | 7962 | 25 | 52.9145 | 54.0203 | 61 | 1.1059
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.973 | 56 | 0.6877
50-75% | 5725 | 107 | 47.3034 | 49.1422 | 55 | 1.8388
75-90% | 3484 | 107 | 48.4041 | 49.9739 | 54 | 1.5697
90%+ | 3028 | 107 | 49.5466 | 50.0945 | 47 | 0.5479
neutral | 20457 | 107 | 49.0418 | 49.65 | 55 | 0.6082
specificLeverage | 3018 | 77 | 61.8168 | 63.5076 | 62 | 1.6909
decisive | 1869 | 57 | 84.2253 | 87.6635 | 89 | 3.4382
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.3794 | 62 | 2.1259
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1365 | 32 | -2.9041
highLateMovement | 1484 | 107 | 53.7251 | 54.3026 | 57 | 0.5775
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.9258 | 61 | 2.079
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2804 | 58 | 0.117
marginFallback | 8050 | 40 | 53.2506 | 54.3443 | 61 | 1.0938
limitedWp | 1 | 1 | 91 | 93 | 93 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.4598 | 61 | 2.8782
highMarginNoWp | 6432 | 27 | 59.3422 | 60.8851 | 62 | 1.5429
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8285 | 61 | 0.1283
oneSidedAfterGenuine | 674 | 40 | 52.957 | 55.4926 | 54 | 2.5356
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7631 | 62 | 2.4284

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9013 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.0598
highMarginNoWp | 0.864 | 0.5 | 0.4132 | 9.8656 | 4.9328 | 0 | -0.0907 | 0.0299 | 4.872 | 4.872 | 1.5675
highMarginLimitedWp | 0.8545 | 0.6817 | 0.056 | 8.7575 | 5.887 | -0.7918 | -0.8131 | 0.1312 | 4.4132 | 4.4386 | 0.1261
oneSidedAfterGenuine | 0.4151 | 1 | 0.8763 | 8.9831 | 8.983 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.841
uncertainAfterGenuine | 0.9957 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5618

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 65 | 6
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.81 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 6.5351
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.7802 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 6.1633
decisiveNFLDrive | 0.9641 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.7946

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.896 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.648 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.5 | 0 | 10 | 5 | 0 | -0.0015 | 0.0156 | 5.0141 | 5.0141 | 0
missing-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
single-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
limited-wp | 1 | 0.5016 | 1 | 9.982 | 5.0071 | -0.3536 | -0.4533 | 0 | 4.2001 | 4.2001 | 4.2001
ordinary | 0.784 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.8305

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-30-80-wp-65

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.1139 | 57 | 1.0247

Band | Count | Percent
--- | --- | ---
<50 | 8283 | 33.7228
50-69 | 12501 | 50.8957
70-84 | 2413 | 9.8241
85+ | 1365 | 5.5574

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16279 | 298 | 61
70 | 2899 | 3778 | 892 | 13
80 | 1454 | 1852 | 404 | 6
85 | 997 | 1365 | 375 | 7
90 | 734 | 1078 | 346 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.789 | 53 | 0.4355
NFL | 4734 | 25 | 53.4956 | 54.8285 | 56 | 1.3329
NBA | 1450 | 3 | 45.9917 | 46.9379 | 50 | 0.9462
NCAAB | 677 | 2 | 72.7267 | 75.6012 | 77 | 2.8744
MLB | 830 | 2 | 59.3349 | 59.2542 | 58 | -0.0807
NHL | 7962 | 25 | 52.9145 | 54.3875 | 61 | 1.473
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0349 | 56 | 0.7496
50-75% | 5725 | 107 | 47.3034 | 49.3572 | 55 | 2.0538
75-90% | 3484 | 107 | 48.4041 | 50.2044 | 54 | 1.8002
90%+ | 3028 | 107 | 49.5466 | 50.252 | 47 | 0.7054
neutral | 20457 | 107 | 49.0418 | 49.7335 | 55 | 0.6917
specificLeverage | 3018 | 77 | 61.8168 | 63.508 | 62 | 1.6912
decisive | 1869 | 57 | 84.2253 | 88.3135 | 91 | 4.0883
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.5772 | 62 | 2.3237
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.4892 | 57 | 0.7642
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.1043 | 61 | 2.2575
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2932 | 58 | 0.1299
marginFallback | 8050 | 40 | 53.2506 | 54.7075 | 61 | 1.4569
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.4598 | 61 | 2.8782
highMarginNoWp | 6432 | 27 | 59.3422 | 61.3043 | 62 | 1.9621
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8297 | 61 | 0.1295
oneSidedAfterGenuine | 674 | 40 | 52.957 | 55.4926 | 54 | 2.5356
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7631 | 62 | 2.4284

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9013 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.0598
highMarginNoWp | 0.864 | 0.65 | 0.4132 | 9.8656 | 6.4126 | 0 | -0.0907 | 0.0299 | 6.3518 | 6.3518 | 2.042
highMarginLimitedWp | 0.8545 | 0.7772 | 0.056 | 8.7575 | 6.7481 | -0.7918 | -0.8131 | 0.1312 | 5.2744 | 5.2995 | 0.1382
oneSidedAfterGenuine | 0.4151 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.841
uncertainAfterGenuine | 0.9957 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5618

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 65 | 6
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.81 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 6.5351
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.7802 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 6.1633
decisiveNFLDrive | 0.9641 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.7946

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.896 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.648 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 0.784 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.8305

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-30-80-wp-80

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.2477 | 57 | 1.1585

Band | Count | Percent
--- | --- | ---
<50 | 8283 | 33.7228
50-69 | 12430 | 50.6066
70-84 | 2460 | 10.0155
85+ | 1389 | 5.6551

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16279 | 298 | 61
70 | 2899 | 3849 | 963 | 13
80 | 1454 | 1893 | 445 | 6
85 | 997 | 1389 | 399 | 7
90 | 734 | 1122 | 390 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7891 | 53 | 0.4356
NFL | 4734 | 25 | 53.4956 | 54.8285 | 56 | 1.3329
NBA | 1450 | 3 | 45.9917 | 46.9379 | 50 | 0.9462
NCAAB | 677 | 2 | 72.7267 | 75.6012 | 77 | 2.8744
MLB | 830 | 2 | 59.3349 | 59.259 | 58 | -0.0759
NHL | 7962 | 25 | 52.9145 | 54.7994 | 61 | 1.885
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.1055 | 56 | 0.8202
50-75% | 5725 | 107 | 47.3034 | 49.6061 | 55 | 2.3027
75-90% | 3484 | 107 | 48.4041 | 50.4644 | 54 | 2.0603
90%+ | 3028 | 107 | 49.5466 | 50.4115 | 47 | 0.8649
neutral | 20457 | 107 | 49.0418 | 49.826 | 55 | 0.7842
specificLeverage | 3018 | 77 | 61.8168 | 63.5083 | 62 | 1.6915
decisive | 1869 | 57 | 84.2253 | 89.0589 | 92 | 4.8336
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.8013 | 62 | 2.5478
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1372 | 32 | -2.9034
highLateMovement | 1484 | 107 | 53.7251 | 54.6429 | 57 | 0.9178
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.3066 | 62 | 2.4598
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3166 | 58 | 0.1533
marginFallback | 8050 | 40 | 53.2506 | 55.1149 | 61 | 1.8643
limitedWp | 1 | 1 | 91 | 95 | 95 | 4

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.4598 | 61 | 2.8782
highMarginNoWp | 6432 | 27 | 59.3422 | 61.7794 | 62 | 2.4372
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8309 | 61 | 0.1307
oneSidedAfterGenuine | 674 | 40 | 52.957 | 55.4926 | 54 | 2.5356
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7631 | 62 | 2.4284

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9013 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 3.0598
highMarginNoWp | 0.864 | 0.8 | 0.4132 | 9.8656 | 7.8925 | 0 | -0.0907 | 0.0299 | 7.8316 | 7.8316 | 2.5165
highMarginLimitedWp | 0.8545 | 0.8727 | 0.056 | 8.7575 | 7.6093 | -0.7918 | -0.8131 | 0.1312 | 6.1356 | 6.1605 | 0.1504
oneSidedAfterGenuine | 0.4151 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.841
uncertainAfterGenuine | 0.9957 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5618

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 65 | 6
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.81 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 6.5351
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.7802 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 6.1633
decisiveNFLDrive | 0.9641 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.7946

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.896 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.648 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.8 | 0 | 10 | 8 | 0 | -0.0015 | 0.0156 | 8.0141 | 8.0141 | 0
missing-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
single-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
limited-wp | 1 | 0.8006 | 1 | 9.982 | 7.992 | -0.3536 | -0.4533 | 0 | 7.1851 | 7.1851 | 7.1851
ordinary | 0.784 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.8305

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-30-80-wp-100

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.4051 | 57 | 1.3159

Band | Count | Percent
--- | --- | ---
<50 | 8282 | 33.7188
50-69 | 12296 | 50.0611
70-84 | 2519 | 10.2557
85+ | 1465 | 5.9645

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16280 | 299 | 61
70 | 2899 | 3984 | 1098 | 13
80 | 1454 | 1947 | 499 | 6
85 | 997 | 1465 | 475 | 7
90 | 734 | 1227 | 495 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7893 | 53 | 0.4359
NFL | 4734 | 25 | 53.4956 | 54.8285 | 56 | 1.3329
NBA | 1450 | 3 | 45.9917 | 46.9379 | 50 | 0.9462
NCAAB | 677 | 2 | 72.7267 | 75.6012 | 77 | 2.8744
MLB | 830 | 2 | 59.3349 | 59.2976 | 58 | -0.0373
NHL | 7962 | 25 | 52.9145 | 55.281 | 61 | 2.3665
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.1912 | 56 | 0.9059
50-75% | 5725 | 107 | 47.3034 | 49.9132 | 55 | 2.6098
75-90% | 3484 | 107 | 48.4041 | 50.7655 | 54 | 2.3614
90%+ | 3028 | 107 | 49.5466 | 50.573 | 47 | 1.0264
neutral | 20457 | 107 | 49.0418 | 49.9404 | 55 | 0.8985
specificLeverage | 3018 | 77 | 61.8168 | 63.5089 | 62 | 1.6922
decisive | 1869 | 57 | 84.2253 | 89.8769 | 93 | 5.6517
highGenuineContinuity | 13634 | 87 | 60.2535 | 63.0679 | 62 | 2.8144
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1378 | 32 | -2.9027
highLateMovement | 1484 | 107 | 53.7251 | 54.8699 | 57 | 1.1449
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.5473 | 62 | 2.7005
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.332 | 58 | 0.1687
marginFallback | 8050 | 40 | 53.2506 | 55.5912 | 61 | 2.3406
limitedWp | 1 | 1 | 91 | 97 | 97 | 6

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.4598 | 61 | 2.8782
highMarginNoWp | 6432 | 27 | 59.3422 | 62.3396 | 62 | 2.9974
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8717 | 61 | 0.1715
oneSidedAfterGenuine | 674 | 40 | 52.957 | 55.4926 | 54 | 2.5356
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7631 | 62 | 2.4284

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.9013 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2515 | 8.2515 | 3.0598
highMarginNoWp | 0.864 | 1 | 0.4132 | 9.8656 | 9.8656 | 0 | -0.0907 | 0.0299 | 9.8047 | 9.8003 | 3.148
highMarginLimitedWp | 0.8545 | 1 | 0.056 | 8.7575 | 8.7575 | -0.7918 | -0.8131 | 0.1312 | 7.2838 | 7.3086 | 0.1666
oneSidedAfterGenuine | 0.4151 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.841
uncertainAfterGenuine | 0.9957 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5618

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 57 | 7
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 65 | 6
decisiveNFLDrive | 90 | 95 | 5

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.81 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 6.5351
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.7802 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 6.1633
decisiveNFLDrive | 0.9641 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.7946

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.896 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.648 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 1 | 0 | 10 | 10 | 0 | -0.0015 | 0.0156 | 10.0141 | 10 | 0
missing-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
single-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
limited-wp | 1 | 1 | 1 | 9.982 | 9.982 | -0.3536 | -0.4533 | 0 | 9.1751 | 9.1751 | 9.1751
ordinary | 0.784 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.8305

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-35-85-wp-50

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 52.9258 | 57 | 0.8366

Band | Count | Percent
--- | --- | ---
<50 | 8334 | 33.9305
50-69 | 12516 | 50.9568
70-84 | 2368 | 9.6409
85+ | 1344 | 5.4719

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16228 | 247 | 61
70 | 2899 | 3712 | 826 | 13
80 | 1454 | 1827 | 379 | 6
85 | 997 | 1344 | 354 | 7
90 | 734 | 1001 | 269 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7087 | 53 | 0.3553
NFL | 4734 | 25 | 53.4956 | 54.7161 | 55 | 1.2205
NBA | 1450 | 3 | 45.9917 | 46.7841 | 50 | 0.7924
NCAAB | 677 | 2 | 72.7267 | 75.4151 | 76 | 2.6883
MLB | 830 | 2 | 59.3349 | 59.2518 | 58 | -0.0831
NHL | 7962 | 25 | 52.9145 | 54.0078 | 61 | 1.0933
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.9393 | 56 | 0.654
50-75% | 5725 | 107 | 47.3034 | 49.0452 | 54 | 1.7418
75-90% | 3484 | 107 | 48.4041 | 49.8057 | 54 | 1.4015
90%+ | 3028 | 107 | 49.5466 | 49.9851 | 46 | 0.4386
neutral | 20457 | 107 | 49.0418 | 49.5855 | 55 | 0.5437
specificLeverage | 3018 | 77 | 61.8168 | 63.3827 | 62 | 1.5659
decisive | 1869 | 57 | 84.2253 | 87.611 | 89 | 3.3858
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.296 | 62 | 2.0425
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1365 | 32 | -2.9041
highLateMovement | 1484 | 107 | 53.7251 | 54.2965 | 57 | 0.5714
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.8347 | 61 | 1.9879
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2767 | 58 | 0.1133
marginFallback | 8050 | 40 | 53.2506 | 54.3319 | 61 | 1.0814
limitedWp | 1 | 1 | 91 | 93 | 93 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.3005 | 61 | 2.7189
highMarginNoWp | 6432 | 27 | 59.3422 | 60.8713 | 62 | 1.5291
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8285 | 61 | 0.1283
oneSidedAfterGenuine | 674 | 40 | 52.957 | 54.8887 | 53 | 1.9318
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7595 | 62 | 2.4249

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.8649 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 2.8906
highMarginNoWp | 0.856 | 0.5 | 0.4132 | 9.8656 | 4.9328 | 0 | -0.0907 | 0.0299 | 4.872 | 4.872 | 1.5469
highMarginLimitedWp | 0.8253 | 0.6817 | 0.056 | 8.7575 | 5.887 | -0.7918 | -0.8131 | 0.1312 | 4.4132 | 4.4386 | 0.124
oneSidedAfterGenuine | 0.3178 | 1 | 0.8763 | 8.9831 | 8.983 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.1854
uncertainAfterGenuine | 0.9916 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5553

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 55 | 5
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 64 | 5
decisiveNFLDrive | 90 | 94 | 4

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.678 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 5.4705
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.6437 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 5.0847
decisiveNFLDrive | 0.8824 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.3883

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.784 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.5 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.5 | 0 | 10 | 5 | 0 | -0.0015 | 0.0156 | 5.0141 | 5.0141 | 0
missing-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
single-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
limited-wp | 1 | 0.5016 | 1 | 9.982 | 5.0071 | -0.3536 | -0.4533 | 0 | 4.2001 | 4.2001 | 4.2001
ordinary | 0.648 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.5129

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-35-85-wp-65

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.043 | 57 | 0.9538

Band | Count | Percent
--- | --- | ---
<50 | 8334 | 33.9305
50-69 | 12462 | 50.7369
70-84 | 2403 | 9.7834
85+ | 1363 | 5.5492

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16228 | 247 | 61
70 | 2899 | 3766 | 880 | 13
80 | 1454 | 1848 | 400 | 6
85 | 997 | 1363 | 373 | 7
90 | 734 | 1076 | 344 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7088 | 53 | 0.3554
NFL | 4734 | 25 | 53.4956 | 54.7161 | 55 | 1.2205
NBA | 1450 | 3 | 45.9917 | 46.7841 | 50 | 0.7924
NCAAB | 677 | 2 | 72.7267 | 75.4151 | 76 | 2.6883
MLB | 830 | 2 | 59.3349 | 59.2518 | 58 | -0.0831
NHL | 7962 | 25 | 52.9145 | 54.3694 | 61 | 1.4549
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0012 | 56 | 0.7159
50-75% | 5725 | 107 | 47.3034 | 49.2575 | 54 | 1.9541
75-90% | 3484 | 107 | 48.4041 | 50.0281 | 54 | 1.624
90%+ | 3028 | 107 | 49.5466 | 50.1427 | 46 | 0.5961
neutral | 20457 | 107 | 49.0418 | 49.6669 | 55 | 0.6251
specificLeverage | 3018 | 77 | 61.8168 | 63.383 | 62 | 1.5663
decisive | 1869 | 57 | 84.2253 | 88.2611 | 90 | 4.0358
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.4909 | 62 | 2.2374
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.4784 | 57 | 0.7534
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.0107 | 61 | 2.1639
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2896 | 58 | 0.1262
marginFallback | 8050 | 40 | 53.2506 | 54.6896 | 61 | 1.439
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.3005 | 61 | 2.7189
highMarginNoWp | 6432 | 27 | 59.3422 | 61.2845 | 62 | 1.9423
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8297 | 61 | 0.1295
oneSidedAfterGenuine | 674 | 40 | 52.957 | 54.8887 | 53 | 1.9318
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7595 | 62 | 2.4249

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.8649 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 2.8906
highMarginNoWp | 0.856 | 0.65 | 0.4132 | 9.8656 | 6.4126 | 0 | -0.0907 | 0.0299 | 6.3518 | 6.3518 | 2.0151
highMarginLimitedWp | 0.8253 | 0.7772 | 0.056 | 8.7575 | 6.7481 | -0.7918 | -0.8131 | 0.1312 | 5.2744 | 5.2995 | 0.136
oneSidedAfterGenuine | 0.3178 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.1854
uncertainAfterGenuine | 0.9916 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5553

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 55 | 5
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 64 | 5
decisiveNFLDrive | 90 | 94 | 4

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.678 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 5.4705
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.6437 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 5.0847
decisiveNFLDrive | 0.8824 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.3883

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.784 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.5 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 0.648 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.5129

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-35-85-wp-80

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.1742 | 57 | 1.085

Band | Count | Percent
--- | --- | ---
<50 | 8334 | 33.9305
50-69 | 12391 | 50.4478
70-84 | 2450 | 9.9748
85+ | 1387 | 5.6469

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16228 | 247 | 61
70 | 2899 | 3837 | 951 | 13
80 | 1454 | 1889 | 441 | 6
85 | 997 | 1387 | 397 | 7
90 | 734 | 1120 | 388 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7089 | 53 | 0.3555
NFL | 4734 | 25 | 53.4956 | 54.7161 | 55 | 1.2205
NBA | 1450 | 3 | 45.9917 | 46.7841 | 50 | 0.7924
NCAAB | 677 | 2 | 72.7267 | 75.4151 | 76 | 2.6883
MLB | 830 | 2 | 59.3349 | 59.2566 | 58 | -0.0783
NHL | 7962 | 25 | 52.9145 | 54.7734 | 61 | 1.859
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0718 | 56 | 0.7865
50-75% | 5725 | 107 | 47.3034 | 49.5039 | 54 | 2.2005
75-90% | 3484 | 107 | 48.4041 | 50.2741 | 54 | 1.87
90%+ | 3028 | 107 | 49.5466 | 50.3022 | 46 | 0.7556
neutral | 20457 | 107 | 49.0418 | 49.7563 | 55 | 0.7145
specificLeverage | 3018 | 77 | 61.8168 | 63.3834 | 62 | 1.5666
decisive | 1869 | 57 | 84.2253 | 89.0064 | 92 | 4.7812
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.7127 | 62 | 2.4592
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1372 | 32 | -2.9034
highLateMovement | 1484 | 107 | 53.7251 | 54.628 | 57 | 0.903
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.211 | 61 | 2.3642
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.313 | 58 | 0.1496
marginFallback | 8050 | 40 | 53.2506 | 55.0892 | 61 | 1.8386
limitedWp | 1 | 1 | 91 | 95 | 95 | 4

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.3005 | 61 | 2.7189
highMarginNoWp | 6432 | 27 | 59.3422 | 61.7547 | 62 | 2.4125
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8309 | 61 | 0.1307
oneSidedAfterGenuine | 674 | 40 | 52.957 | 54.8887 | 53 | 1.9318
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7595 | 62 | 2.4249

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.8649 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 2.8906
highMarginNoWp | 0.856 | 0.8 | 0.4132 | 9.8656 | 7.8925 | 0 | -0.0907 | 0.0299 | 7.8316 | 7.8316 | 2.4833
highMarginLimitedWp | 0.8253 | 0.8727 | 0.056 | 8.7575 | 7.6093 | -0.7918 | -0.8131 | 0.1312 | 6.1356 | 6.1605 | 0.1479
oneSidedAfterGenuine | 0.3178 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.1854
uncertainAfterGenuine | 0.9916 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5553

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 55 | 5
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 64 | 5
decisiveNFLDrive | 90 | 94 | 4

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.678 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 5.4705
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.6437 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 5.0847
decisiveNFLDrive | 0.8824 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.3883

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.784 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.5 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.8 | 0 | 10 | 8 | 0 | -0.0015 | 0.0156 | 8.0141 | 8.0141 | 0
missing-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
single-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
limited-wp | 1 | 0.8006 | 1 | 9.982 | 7.992 | -0.3536 | -0.4533 | 0 | 7.1851 | 7.1851 | 7.1851
ordinary | 0.648 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.5129

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-35-85-wp-100

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.3308 | 57 | 1.2416

Band | Count | Percent
--- | --- | ---
<50 | 8334 | 33.9305
50-69 | 12256 | 49.8982
70-84 | 2509 | 10.215
85+ | 1463 | 5.9564

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16228 | 247 | 61
70 | 2899 | 3972 | 1086 | 13
80 | 1454 | 1943 | 495 | 6
85 | 997 | 1463 | 473 | 7
90 | 734 | 1225 | 493 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.7092 | 53 | 0.3557
NFL | 4734 | 25 | 53.4956 | 54.7161 | 55 | 1.2205
NBA | 1450 | 3 | 45.9917 | 46.7841 | 50 | 0.7924
NCAAB | 677 | 2 | 72.7267 | 75.4151 | 76 | 2.6883
MLB | 830 | 2 | 59.3349 | 59.2928 | 58 | -0.0422
NHL | 7962 | 25 | 52.9145 | 55.2524 | 61 | 2.338
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.1572 | 56 | 0.8719
50-75% | 5725 | 107 | 47.3034 | 49.8093 | 54 | 2.5059
75-90% | 3484 | 107 | 48.4041 | 50.5723 | 54 | 2.1682
90%+ | 3028 | 107 | 49.5466 | 50.4637 | 46 | 0.9171
neutral | 20457 | 107 | 49.0418 | 49.8696 | 55 | 0.8277
specificLeverage | 3018 | 77 | 61.8168 | 63.384 | 62 | 1.5673
decisive | 1869 | 57 | 84.2253 | 89.8245 | 93 | 5.5993
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.9776 | 62 | 2.7241
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1378 | 32 | -2.9027
highLateMovement | 1484 | 107 | 53.7251 | 54.8531 | 57 | 1.128
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.45 | 62 | 2.6033
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3283 | 58 | 0.165
marginFallback | 8050 | 40 | 53.2506 | 55.563 | 61 | 2.3124
limitedWp | 1 | 1 | 91 | 97 | 97 | 6

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 63.3005 | 61 | 2.7189
highMarginNoWp | 6432 | 27 | 59.3422 | 62.3114 | 62 | 2.9692
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8693 | 61 | 0.1691
oneSidedAfterGenuine | 674 | 40 | 52.957 | 54.8887 | 53 | 1.9318
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7595 | 62 | 2.4249

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.8649 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2515 | 8.2515 | 2.8906
highMarginNoWp | 0.856 | 1 | 0.4132 | 9.8656 | 9.8656 | 0 | -0.0907 | 0.0299 | 9.8047 | 9.8003 | 3.1063
highMarginLimitedWp | 0.8253 | 1 | 0.056 | 8.7575 | 8.7575 | -0.7918 | -0.8131 | 0.1312 | 7.2838 | 7.3086 | 0.1639
oneSidedAfterGenuine | 0.3178 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 2.1854
uncertainAfterGenuine | 0.9916 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5553

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 55 | 5
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 64 | 5
decisiveNFLDrive | 90 | 94 | 4

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.678 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 5.4705
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.6437 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 5.0847
decisiveNFLDrive | 0.8824 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 4.3883

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 1 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.9954
high-scoring | 1 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 10
false-close | 0.784 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.5 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 1 | 0 | 10 | 10 | 0 | -0.0015 | 0.0156 | 10.0141 | 10 | 0
missing-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
single-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
limited-wp | 1 | 1 | 1 | 9.982 | 9.982 | -0.3536 | -0.4533 | 0 | 9.1751 | 9.1751 | 9.1751
ordinary | 0.648 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 1.5129

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401864524:401864524468 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524478 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524476 | CFB | 64 | 74 | 10 | 9.5993 | 0.9909 | 1 | 1
401864524:401864524480 | CFB | 66 | 76 | 10 | 9.5975 | 0.9919 | 1 | 1
401864524:401864524484 | CFB | 66 | 76 | 10 | 9.5941 | 0.9962 | 1 | 1
401864524:401864524488 | CFB | 66 | 76 | 10 | 9.5851 | 0.9993 | 1 | 1
401864524:401864524495 | CFB | 67 | 77 | 10 | 9.5851 | 1 | 1 | 1
401864524:401864524499 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524510 | CFB | 67 | 77 | 10 | 9.5874 | 1 | 1 | 1
401864524:401864524508 | CFB | 67 | 77 | 10 | 9.5875 | 1 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-45-95-wp-50

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 52.742 | 57 | 0.6528

Band | Count | Percent
--- | --- | ---
<50 | 8422 | 34.2887
50-69 | 12518 | 50.9649
70-84 | 2298 | 9.3559
85+ | 1324 | 5.3904

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16140 | 159 | 61
70 | 2899 | 3622 | 736 | 13
80 | 1454 | 1792 | 344 | 6
85 | 997 | 1324 | 334 | 7
90 | 734 | 978 | 246 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.4816 | 52 | 0.1282
NFL | 4734 | 25 | 53.4956 | 54.421 | 55 | 0.9254
NBA | 1450 | 3 | 45.9917 | 46.4641 | 49 | 0.4724
NCAAB | 677 | 2 | 72.7267 | 74.8804 | 76 | 2.1536
MLB | 830 | 2 | 59.3349 | 59.2494 | 58 | -0.0855
NHL | 7962 | 25 | 52.9145 | 53.9743 | 61 | 1.0598
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.8313 | 55 | 0.546
50-75% | 5725 | 107 | 47.3034 | 48.73 | 53 | 1.4266
75-90% | 3484 | 107 | 48.4041 | 49.4102 | 53 | 1.006
90%+ | 3028 | 107 | 49.5466 | 49.7834 | 46 | 0.2368
neutral | 20457 | 107 | 49.0418 | 49.4178 | 55 | 0.3759
specificLeverage | 3018 | 77 | 61.8168 | 63.0282 | 62 | 1.2114
decisive | 1869 | 57 | 84.2253 | 87.4505 | 89 | 3.2253
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.0581 | 61 | 1.8046
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1365 | 32 | -2.9041
highLateMovement | 1484 | 107 | 53.7251 | 54.277 | 57 | 0.5519
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.5829 | 61 | 1.7361
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2586 | 58 | 0.0952
marginFallback | 8050 | 40 | 53.2506 | 54.2988 | 61 | 1.0482
limitedWp | 1 | 1 | 91 | 93 | 93 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 62.8451 | 60 | 2.2636
highMarginNoWp | 6432 | 27 | 59.3422 | 60.8336 | 62 | 1.4914
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8261 | 61 | 0.1259
oneSidedAfterGenuine | 674 | 40 | 52.957 | 53.8991 | 51 | 0.9421
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7124 | 62 | 2.3777

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.7484 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 2.403
highMarginNoWp | 0.8371 | 0.5 | 0.4132 | 9.8656 | 4.9328 | 0 | -0.0907 | 0.0299 | 4.872 | 4.872 | 1.5019
highMarginLimitedWp | 0.7326 | 0.6817 | 0.056 | 8.7575 | 5.887 | -0.7918 | -0.8131 | 0.1312 | 4.4132 | 4.4386 | 0.1213
oneSidedAfterGenuine | 0.1504 | 1 | 0.8763 | 8.9831 | 8.983 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 1.0381
uncertainAfterGenuine | 0.9642 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5066

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 53 | 3
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 62 | 3
decisiveNFLDrive | 90 | 93 | 3

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.3825 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 3.0865
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.3477 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 2.7466
decisiveNFLDrive | 0.6279 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 3.123

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 0.972 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.7155
high-scoring | 0.972 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 9.72
false-close | 0.5 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.216 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.5 | 0 | 10 | 5 | 0 | -0.0015 | 0.0156 | 5.0141 | 5.0141 | 0
missing-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
single-wp | 1 | 0.5 | 1 | 10 | 5 | 0 | -0.0039 | 0.0261 | 5.0222 | 5.0222 | 5.0222
limited-wp | 1 | 0.5016 | 1 | 9.982 | 5.0071 | -0.3536 | -0.4533 | 0 | 4.2001 | 4.2001 | 4.2001
ordinary | 0.352 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 0.8218

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401856830:401856830576 | CFB | 71 | 80 | 9 | 8.7729 | 1 | 0.9762 | 1
401856830:401856830594 | CFB | 69 | 78 | 9 | 8.7456 | 1 | 0.9913 | 1
401856830:401856830598 | CFB | 71 | 80 | 9 | 8.7526 | 1 | 1 | 1
401856830:401856830603 | CFB | 68 | 77 | 9 | 8.7562 | 1 | 0.9926 | 1
401856830:401856830607 | CFB | 69 | 78 | 9 | 8.7642 | 1 | 1 | 1
401856830:401856830611 | CFB | 69 | 78 | 9 | 8.7775 | 1 | 1 | 1
401856830:401856830615 | CFB | 70 | 79 | 9 | 8.7931 | 1 | 1 | 1
401856830:401856830620 | CFB | 69 | 78 | 9 | 8.7945 | 1 | 1 | 1
401856830:401856830624 | CFB | 69 | 78 | 9 | 8.8032 | 1 | 0.9972 | 1
401856830:401856830628 | CFB | 71 | 80 | 9 | 8.8332 | 1 | 0.9671 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-45-95-wp-65

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 52.8527 | 57 | 0.7635

Band | Count | Percent
--- | --- | ---
<50 | 8422 | 34.2887
50-69 | 12464 | 50.7451
70-84 | 2330 | 9.4862
85+ | 1346 | 5.48

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16140 | 159 | 61
70 | 2899 | 3676 | 790 | 13
80 | 1454 | 1813 | 365 | 6
85 | 997 | 1346 | 356 | 7
90 | 734 | 1041 | 309 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.4818 | 52 | 0.1283
NFL | 4734 | 25 | 53.4956 | 54.421 | 55 | 0.9254
NBA | 1450 | 3 | 45.9917 | 46.4641 | 49 | 0.4724
NCAAB | 677 | 2 | 72.7267 | 74.8804 | 76 | 2.1536
MLB | 830 | 2 | 59.3349 | 59.2494 | 58 | -0.0855
NHL | 7962 | 25 | 52.9145 | 54.3156 | 61 | 1.4012
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.8927 | 55 | 0.6074
50-75% | 5725 | 107 | 47.3034 | 48.9432 | 53 | 1.6398
75-90% | 3484 | 107 | 48.4041 | 49.6033 | 53 | 1.1992
90%+ | 3028 | 107 | 49.5466 | 49.9204 | 46 | 0.3738
neutral | 20457 | 107 | 49.0418 | 49.4964 | 55 | 0.4545
specificLeverage | 3018 | 77 | 61.8168 | 63.0285 | 62 | 1.2117
decisive | 1869 | 57 | 84.2253 | 88.0449 | 90 | 3.8197
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.2431 | 62 | 1.9897
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1368 | 32 | -2.9037
highLateMovement | 1484 | 107 | 53.7251 | 54.4218 | 57 | 0.6968
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.7499 | 61 | 1.9031
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2712 | 58 | 0.1078
marginFallback | 8050 | 40 | 53.2506 | 54.6364 | 61 | 1.3858
limitedWp | 1 | 1 | 91 | 94 | 94 | 3

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 62.8451 | 60 | 2.2636
highMarginNoWp | 6432 | 27 | 59.3422 | 61.2259 | 62 | 1.8837
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8273 | 61 | 0.1271
oneSidedAfterGenuine | 674 | 40 | 52.957 | 53.8991 | 51 | 0.9421
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7124 | 62 | 2.3777

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.7484 | 1 | 0.454 | 9.351 | 9.3509 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 2.403
highMarginNoWp | 0.8371 | 0.65 | 0.4132 | 9.8656 | 6.4126 | 0 | -0.0907 | 0.0299 | 6.3518 | 6.3518 | 1.9564
highMarginLimitedWp | 0.7326 | 0.7772 | 0.056 | 8.7575 | 6.7481 | -0.7918 | -0.8131 | 0.1312 | 5.2744 | 5.2995 | 0.1331
oneSidedAfterGenuine | 0.1504 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 1.0381
uncertainAfterGenuine | 0.9642 | 1 | 0.3161 | 9.5796 | 9.5795 | -0.4815 | -0.3705 | 0.0804 | 8.8079 | 8.8079 | 2.5066

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 53 | 3
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 62 | 3
decisiveNFLDrive | 90 | 93 | 3

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.3825 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 3.0865
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.3477 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 2.7466
decisiveNFLDrive | 0.6279 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 3.123

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 0.972 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.7155
high-scoring | 0.972 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 9.72
false-close | 0.5 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.216 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.65 | 0 | 10 | 6.5 | 0 | -0.0015 | 0.0156 | 6.5141 | 6.5141 | 0
missing-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
single-wp | 1 | 0.65 | 1 | 10 | 6.5 | 0 | -0.0039 | 0.0261 | 6.5222 | 6.5222 | 6.5222
limited-wp | 1 | 0.6511 | 1 | 9.982 | 6.4995 | -0.3536 | -0.4533 | 0 | 5.6926 | 5.6926 | 5.6926
ordinary | 0.352 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 0.8218

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401856830:401856830576 | CFB | 71 | 80 | 9 | 8.7729 | 1 | 0.9762 | 1
401856830:401856830594 | CFB | 69 | 78 | 9 | 8.7456 | 1 | 0.9913 | 1
401856830:401856830598 | CFB | 71 | 80 | 9 | 8.7526 | 1 | 1 | 1
401856830:401856830603 | CFB | 68 | 77 | 9 | 8.7562 | 1 | 0.9926 | 1
401856830:401856830607 | CFB | 69 | 78 | 9 | 8.7642 | 1 | 1 | 1
401856830:401856830611 | CFB | 69 | 78 | 9 | 8.7775 | 1 | 1 | 1
401856830:401856830615 | CFB | 70 | 79 | 9 | 8.7931 | 1 | 1 | 1
401856830:401856830620 | CFB | 69 | 78 | 9 | 8.7945 | 1 | 1 | 1
401856830:401856830624 | CFB | 69 | 78 | 9 | 8.8032 | 1 | 0.9972 | 1
401856830:401856830628 | CFB | 71 | 80 | 9 | 8.8332 | 1 | 0.9671 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-45-95-wp-80

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 52.9834 | 57 | 0.8942

Band | Count | Percent
--- | --- | ---
<50 | 8422 | 34.2887
50-69 | 12400 | 50.4845
70-84 | 2370 | 9.6491
85+ | 1370 | 5.5777

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16140 | 159 | 61
70 | 2899 | 3740 | 854 | 13
80 | 1454 | 1854 | 406 | 6
85 | 997 | 1370 | 380 | 7
90 | 734 | 1097 | 365 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.4819 | 52 | 0.1284
NFL | 4734 | 25 | 53.4956 | 54.421 | 55 | 0.9254
NBA | 1450 | 3 | 45.9917 | 46.4641 | 49 | 0.4724
NCAAB | 677 | 2 | 72.7267 | 74.8804 | 76 | 2.1536
MLB | 830 | 2 | 59.3349 | 59.2542 | 58 | -0.0807
NHL | 7962 | 25 | 52.9145 | 54.7184 | 61 | 1.8039
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 53.9624 | 56 | 0.6771
50-75% | 5725 | 107 | 47.3034 | 49.1759 | 53 | 1.8725
75-90% | 3484 | 107 | 48.4041 | 49.8539 | 53 | 1.4498
90%+ | 3028 | 107 | 49.5466 | 50.0994 | 46 | 0.5528
neutral | 20457 | 107 | 49.0418 | 49.5809 | 55 | 0.5391
specificLeverage | 3018 | 77 | 61.8168 | 63.0288 | 62 | 1.2121
decisive | 1869 | 57 | 84.2253 | 88.8379 | 92 | 4.6126
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.4652 | 62 | 2.2117
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1372 | 32 | -2.9034
highLateMovement | 1484 | 107 | 53.7251 | 54.5977 | 57 | 0.8726
strongSustainedQuality | 15103 | 97 | 59.8468 | 61.9503 | 61 | 2.1036
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.2942 | 58 | 0.1308
marginFallback | 8050 | 40 | 53.2506 | 55.0348 | 61 | 1.7842
limitedWp | 1 | 1 | 91 | 95 | 95 | 4

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 62.8451 | 60 | 2.2636
highMarginNoWp | 6432 | 27 | 59.3422 | 61.6965 | 62 | 2.3543
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8285 | 61 | 0.1283
oneSidedAfterGenuine | 674 | 40 | 52.957 | 53.8991 | 51 | 0.9421
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7124 | 62 | 2.3777

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.7484 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2514 | 8.2514 | 2.403
highMarginNoWp | 0.8371 | 0.8 | 0.4132 | 9.8656 | 7.8925 | 0 | -0.0907 | 0.0299 | 7.8316 | 7.8316 | 2.4108
highMarginLimitedWp | 0.7326 | 0.8727 | 0.056 | 8.7575 | 7.6093 | -0.7918 | -0.8131 | 0.1312 | 6.1356 | 6.1605 | 0.1448
oneSidedAfterGenuine | 0.1504 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 1.0381
uncertainAfterGenuine | 0.9642 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5066

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 53 | 3
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 62 | 3
decisiveNFLDrive | 90 | 93 | 3

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.3825 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 3.0865
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.3477 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 2.7466
decisiveNFLDrive | 0.6279 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 3.123

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 0.972 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.7155
high-scoring | 0.972 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 9.72
false-close | 0.5 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.216 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 0.8 | 0 | 10 | 8 | 0 | -0.0015 | 0.0156 | 8.0141 | 8.0141 | 0
missing-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
single-wp | 1 | 0.8 | 1 | 10 | 8 | 0 | -0.0039 | 0.0261 | 8.0222 | 8.0222 | 8.0222
limited-wp | 1 | 0.8006 | 1 | 9.982 | 7.992 | -0.3536 | -0.4533 | 0 | 7.1851 | 7.1851 | 7.1851
ordinary | 0.352 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 0.8218

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401856830:401856830576 | CFB | 71 | 80 | 9 | 8.7729 | 1 | 0.9762 | 1
401856830:401856830594 | CFB | 69 | 78 | 9 | 8.7456 | 1 | 0.9913 | 1
401856830:401856830598 | CFB | 71 | 80 | 9 | 8.7526 | 1 | 1 | 1
401856830:401856830603 | CFB | 68 | 77 | 9 | 8.7562 | 1 | 0.9926 | 1
401856830:401856830607 | CFB | 69 | 78 | 9 | 8.7642 | 1 | 1 | 1
401856830:401856830611 | CFB | 69 | 78 | 9 | 8.7775 | 1 | 1 | 1
401856830:401856830615 | CFB | 70 | 79 | 9 | 8.7931 | 1 | 1 | 1
401856830:401856830620 | CFB | 69 | 78 | 9 | 8.7945 | 1 | 1 | 1
401856830:401856830624 | CFB | 69 | 78 | 9 | 8.8032 | 1 | 0.9972 | 1
401856830:401856830628 | CFB | 71 | 80 | 9 | 8.8332 | 1 | 0.9671 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

### gate-45-95-wp-100

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
overall | 24562 | 107 | 52.0892 | 53.1349 | 57 | 1.0457

Band | Count | Percent
--- | --- | ---
<50 | 8422 | 34.2887
50-69 | 12272 | 49.9634
70-84 | 2431 | 9.8974
85+ | 1437 | 5.8505

Threshold | Before | After | Up | Down
--- | --- | --- | --- | ---
50 | 16042 | 16140 | 159 | 61
70 | 2899 | 3868 | 982 | 13
80 | 1454 | 1908 | 460 | 6
85 | 997 | 1437 | 447 | 7
90 | 734 | 1202 | 470 | 2

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
CFB | 8909 | 50 | 49.3535 | 49.4821 | 52 | 0.1286
NFL | 4734 | 25 | 53.4956 | 54.421 | 55 | 0.9254
NBA | 1450 | 3 | 45.9917 | 46.4641 | 49 | 0.4724
NCAAB | 677 | 2 | 72.7267 | 74.8804 | 76 | 2.1536
MLB | 830 | 2 | 59.3349 | 59.2904 | 58 | -0.0446
NHL | 7962 | 25 | 52.9145 | 55.1817 | 61 | 2.2673
Soccer | 0 | 0 |  |  |  | 
Tennis | 0 | 0 |  |  |  | 

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
0-25% | 5651 | 107 | 59.1594 | 59.1594 | 59 | 0
25-50% | 6674 | 107 | 53.2853 | 54.0451 | 56 | 0.7598
50-75% | 5725 | 107 | 47.3034 | 49.4748 | 53 | 2.1714
75-90% | 3484 | 107 | 48.4041 | 50.1335 | 53 | 1.7293
90%+ | 3028 | 107 | 49.5466 | 50.2592 | 46 | 0.7127
neutral | 20457 | 107 | 49.0418 | 49.6884 | 55 | 0.6465
specificLeverage | 3018 | 77 | 61.8168 | 63.0295 | 62 | 1.2127
decisive | 1869 | 57 | 84.2253 | 89.6528 | 93 | 5.4275
highGenuineContinuity | 13634 | 87 | 60.2535 | 62.7233 | 62 | 2.4698
falseClose | 2781 | 34 | 41.2682 | 38.895 | 42 | -2.3732
highDominance | 2909 | 31 | 32.0406 | 29.1378 | 32 | -2.9027
highLateMovement | 1484 | 107 | 53.7251 | 54.8194 | 57 | 1.0943
strongSustainedQuality | 15103 | 97 | 59.8468 | 62.1833 | 61 | 2.3366
lateRevival | 28 | 13 | 56.6071 | 55.8929 | 56 | -0.7143
lowEvidenceMaturity | 9487 | 107 | 57.1634 | 57.3096 | 58 | 0.1462
marginFallback | 8050 | 40 | 53.2506 | 55.493 | 61 | 2.2425
limitedWp | 1 | 1 | 91 | 97 | 97 | 6

View | States | Games | Baseline mean | Candidate mean | Median | Mean delta
--- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 6586 | 51 | 60.5815 | 62.8451 | 60 | 2.2636
highMarginNoWp | 6432 | 27 | 59.3422 | 62.239 | 62 | 2.8968
highMarginLimitedWp | 834 | 82 | 63.7002 | 63.8669 | 61 | 0.1667
oneSidedAfterGenuine | 674 | 40 | 52.957 | 53.8991 | 51 | 0.9421
uncertainAfterGenuine | 2229 | 44 | 63.3347 | 65.7124 | 62 | 2.3777

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
highGenuineStrongWp | 0.7484 | 1 | 0.454 | 9.351 | 9.351 | -0.6414 | -0.5536 | 0.0955 | 8.2515 | 8.2515 | 2.403
highMarginNoWp | 0.8371 | 1 | 0.4132 | 9.8656 | 9.8656 | 0 | -0.0907 | 0.0299 | 9.8047 | 9.8003 | 3.0156
highMarginLimitedWp | 0.7326 | 1 | 0.056 | 8.7575 | 8.7575 | -0.7918 | -0.8131 | 0.1312 | 7.2838 | 7.3086 | 0.1604
oneSidedAfterGenuine | 0.1504 | 1 | 0.8763 | 8.9831 | 8.9831 | -0.8092 | -0.8715 | 0.1099 | 7.4122 | 7.4122 | 1.0381
uncertainAfterGenuine | 0.9642 | 1 | 0.3161 | 9.5796 | 9.5796 | -0.4815 | -0.3705 | 0.0804 | 8.808 | 8.808 | 2.5066

Anchor | Phase 2 | Candidate | Delta
--- | --- | --- | ---
blowout | 1 | 1 | 0
ordinaryCloseEarly | 59 | 59 | 0
requiredCFB | 50 | 53 | 3
closeCFB5050 | 86 | 92 | 6
nflLateUncertain | 74 | 83 | 9
strongEarly | 75 | 75 | 0
nflCloseOneSided | 59 | 62 | 3
decisiveNFLDrive | 90 | 93 | 3

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
blowout | 0 | 1 | 1 | 0 | 0 | -2.6732 | -6.295 | 0 | -8.9682 | -8 | -8
ordinaryCloseEarly | 1 | 1 | 0 | 10 | 10 | -0.2263 | -0.0498 | 0.0367 | 9.7606 | 9.7606 | 0
requiredCFB | 0.3825 | 1 | 1 | 9.5334 | 9.5334 | -0.8072 | -0.7779 | 0.1203 | 8.0686 | 8.0686 | 3.0865
closeCFB5050 | 1 | 1 | 1 | 8.7335 | 8.7335 | -1.3345 | -1.2435 | 0.3041 | 6.4595 | 6.4595 | 6.4595
nflLateUncertain | 1 | 1 | 1 | 9.6371 | 9.6371 | -0.749 | -0.4761 | 0.1057 | 8.5177 | 8.5177 | 8.5177
strongEarly | 1 | 1 | 0 | 9.4507 | 9.4507 | -0.7163 | -0.5274 | 0.0894 | 8.2964 | 8.2964 | 0
nflCloseOneSided | 0.3477 | 1 | 1 | 9.1348 | 9.1348 | -0.6482 | -0.6865 | 0.0995 | 7.8995 | 7.8995 | 2.7466
decisiveNFLDrive | 0.6279 | 1 | 1 | 6.992 | 6.992 | -0.8093 | -1.4214 | 0.2119 | 4.9734 | 4.9734 | 3.123

State/history | Gate | WP confidence | Evidence | Raw sustained | Adjusted sustained | False-close | Dominance | Revival | Raw trajectory | Bounded | Adjustment
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
sustained | 1 | 1 | 1 | 10 | 10 | -0.0276 | -0.0085 | 0.0144 | 9.9783 | 9.9783 | 9.9783
defensive | 0.972 | 1 | 1 | 10 | 10 | -0.0043 | -0.0085 | 0.0081 | 9.9954 | 9.9954 | 9.7155
high-scoring | 0.972 | 1 | 1 | 10 | 10 | 0 | -0.0085 | 0.0133 | 10.0047 | 10 | 9.72
false-close | 0.5 | 1 | 1 | 2.2242 | 2.2242 | -3.5708 | -4.6138 | 0 | -5.9605 | -5.9605 | -5.9605
late-comeback | 0.216 | 1 | 1 | 0 | 0 | -0.9691 | -5.3457 | 1.2279 | -5.0869 | -5.0869 | -5.0869
late-chaos | 1 | 1 | 1 | 0 | 0 | -0.9097 | -4.8237 | 1.3207 | -4.4126 | -4.4126 | -4.4126
late-blowout | 0 | 1 | 1 | 7.3278 | 7.3278 | -0.2675 | -1.4887 | 0 | 5.5716 | 5.5716 | 0
blowout | 0 | 1 | 1 | 0 | 0 | -0.926 | -5.6501 | 0 | -6.5761 | -6.5761 | -6.5761
early | 1 | 1 | 0 | 10 | 10 | 0 | -0.0015 | 0.0156 | 10.0141 | 10 | 0
missing-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
single-wp | 1 | 1 | 1 | 10 | 10 | 0 | -0.0039 | 0.0261 | 10.0222 | 10 | 10
limited-wp | 1 | 1 | 1 | 9.982 | 9.982 | -0.3536 | -0.4533 | 0 | 9.1751 | 9.1751 | 9.1751
ordinary | 0.352 | 1 | 1 | 4.8775 | 4.8775 | -0.9849 | -1.7676 | 0.2098 | 2.3348 | 2.3348 | 0.8218

State | Sport | Before | After | Delta | Raw trajectory | Evidence | Gate | WP confidence
--- | --- | --- | --- | --- | --- | --- | --- | ---
401892520:401892520000007630 | NHL | 65 | 75 | 10 | 10.0029 | 0.9518 | 1 | 1
401892520:401892520000007640 | NHL | 65 | 75 | 10 | 10.0028 | 0.9533 | 1 | 1
401892520:401892520000010190 | NHL | 65 | 75 | 10 | 10.0028 | 0.9556 | 1 | 1
401892520:401892520000007710 | NHL | 69 | 79 | 10 | 10.0028 | 0.9677 | 1 | 1
401892520:401892520000007860 | NHL | 69 | 79 | 10 | 10.0027 | 0.9696 | 1 | 1
401892520:401892520000001580 | NHL | 69 | 79 | 10 | 10.0026 | 0.9755 | 1 | 1
401892520:401892520000007890 | NHL | 69 | 79 | 10 | 10.0027 | 0.9785 | 1 | 1
401892520:401892520000008020 | NHL | 70 | 80 | 10 | 10.0026 | 0.9855 | 1 | 1
401892520:401892520000008060 | NHL | 70 | 80 | 10 | 10.0026 | 0.9883 | 1 | 1
401892520:401892520000000400 | NHL | 71 | 81 | 10 | 10.0026 | 0.9887 | 1 | 1
401856725:401856725487 | CFB | 13 | 5 | -8 | -9.5088 | 0.9997 | 0 | 1
401856725:401856725493 | CFB | 13 | 5 | -8 | -9.4899 | 1 | 0 | 1
401856828:401856828615 | CFB | 25 | 17 | -8 | -8.596 | 0.9996 | 0 | 1
401856828:401856828622 | CFB | 25 | 17 | -8 | -8.5791 | 1 | 0 | 1
401856828:401856828626 | CFB | 16 | 8 | -8 | -8.5795 | 1 | 0 | 1
401856828:401856828631 | CFB | 24 | 16 | -8 | -8.5822 | 1 | 0 | 1
401856828:401856828636 | CFB | 22 | 14 | -8 | -8.5666 | 1 | 0 | 1
401856828:401856828641 | CFB | 22 | 14 | -8 | -8.5714 | 1 | 0 | 1
401856828:401856828646 | CFB | 22 | 14 | -8 | -8.557 | 1 | 0 | 1
401856828:401856828651 | CFB | 22 | 14 | -8 | -8.5326 | 1 | 0 | 1

Machine-readable results: [output/trajectory-calibration.json](output/trajectory-calibration.json).
