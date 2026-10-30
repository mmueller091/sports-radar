# Shadow candidate replay fidelity review

Regenerated from the local provider fixture archive on 2026-10-30 after promoting the approved Current Tension policy to the implicit shadow default. Production/default Sports Radar scoring was not changed, deployed, or pushed.

The active implicit shadow policy is:

```js
{
  kind: 'margin-modifier',
  uncertaintyWeight: 0.35,
  currentTensionCeiling: 34
}
```

Valid WP uncertainty is capped by the sport model, then modifies margin closeness. Missing or invalid WP falls back to margin closeness. Generic Leverage remains capped at 8 with start 0.55 and span 0.40. Candidate WP points remain zero, trajectory telemetry remains scoring-neutral, and the old CFB generic live floor remains absent.

## Direct default equivalence

The implicit shadow default exactly matched explicitly supplying `modifier-65-35-c34` across all 24,562 high-fidelity replay states, with zero mismatches.

Compared components: effective uncertainty, current closeness, Current Tension, Generic Leverage, candidate base, sport situation, pressure, competitive floor, decisive floor, aggregation/live bonus, momentum, and final candidate rating.

The corrected evaluator reruns the real parameterized candidate path for each policy. It does not use the historical algebraic approximation.

## Aggregate distribution

| States | Mean | Median | <50 | 50-69 | 70-84 | 85+ |
| --- | --- | --- | --- | --- | --- | --- |
| 24,562 | 52.09 | 56 | 34.69% | 53.51% | 7.74% | 4.06% |

| Threshold | Count | Share |
| --- | --- | --- |
| >=50 | 16,042 | 65.31% |
| >=70 | 2,899 | 11.80% |
| >=80 | 1,454 | 5.92% |
| >=85 | 997 | 4.06% |
| >=90 | 734 | 2.99% |

The preserved historical approximate `modifier-65-35-c34` diagnostic was 52.52 / 56 with bands 34.68%, 53.19%, 6.29%, and 5.84%. It remains historical context only; the direct results above are authoritative.

## Replay comparisons

| Group | States | Legacy mean / median | Candidate mean / median | Delta mean / median |
| --- | --- | --- | --- | --- |
| primary | 24,562 | 50.32 / 50 | 52.09 / 56 | 1.77 / 1 |
| legacy scoring-only | 1,326 | 51.60 / 50 | 51.53 / 54 | -0.07 / 0 |
| full fidelity | 13,411 | 52.08 / 51 | 51.38 / 53 | -0.70 / 0 |
| partial fidelity | 11,151 | 48.21 / 48 | 52.94 / 58 | 4.74 / 4 |
| neutral states | 20,457 | 46.57 / 48 | 49.04 / 54 | 2.47 / 2 |
| specific leverage states | 3,018 | 64.15 / 62 | 61.82 / 60 | -2.33 / -2 |
| decisive states | 1,869 | 86.08 / 86 | 84.23 / 85 | -1.86 / 0 |

Specific-leverage and decisive groups overlap. Neutral means no observed positive situation contribution or decisive condition; a partial neutral state may still hide unavailable live information. Replay rows are checkpoint-weighted and correlated within games.

## Progress and sport views

| Progress | States | Candidate mean / median |
| --- | --- | --- |
| 0-25% | 5,651 | 59.16 / 59 |
| 25-50% | 6,674 | 53.29 / 55 |
| 50-75% | 5,725 | 47.30 / 52 |
| 75-90% | 3,484 | 48.40 / 52 |
| 90%+ | 3,028 | 49.55 / 46 |

| Sport | States | Candidate mean / median | Coverage warning |
| --- | --- | --- | --- |
| CFB | 8,909 | 49.35 / 52 | no minimum-count warning |
| MLB | 830 | 59.33 / 58 | only 2 games |
| NBA | 1,450 | 45.99 / 48 | only 3 games |
| NCAAB | 677 | 72.73 / 75 | only 2 games |
| NFL | 4,734 | 53.50 / 54 | no minimum-count warning |
| NHL | 7,962 | 52.91 / 59 | no full-fidelity historical on-ice states |
| Soccer | 0 | n/a | no archived games |
| Tennis | 0 | n/a | no archived games |

The warning heuristic requires at least 5 replayed games, 30 states, and 30 full-fidelity states. Passing it is not proof of statistical sufficiency.

## Semantic anchors

| Anchor | State | Candidate rating |
| --- | --- | --- |
| CFB 89% WP close state | `401858490:401858490648` | 50 |
| late genuinely uncertain CFB | `401858491:401858491644` | 86 |
| NFL close / one-sided | `401872996:4018729963997` | 59 |
| NFL late / uncertain | `401872983:4018729833851` | 74 |
| strong early | `401872992:401872992775` | 75 |
| ordinary close early | `401858490:401858490105` | 59 |
| decisive NFL drive | `401873002:4018730023915` | 90 |
| blowout | `401858261:401858261592` | 1 |

## Fidelity notes

The primary replay merges captured football drive/play and scoring streams, preserves chronological provider state, carries scores only after observation, positions WP causally, excludes future team statistics and unfinished-drive outcomes, and rejects mutation of replay inputs. Basketball possession is reconstructed only from explicit control events. MLB uses captured inning, count, outs, and runner state. NHL play strength is retained, but the final `onIce` snapshot is not leaked backward.

The machine-readable summaries are in [output/shadow-candidate-replay-summary.json](output/shadow-candidate-replay-summary.json) and [output/current-tension-calibration.json](output/current-tension-calibration.json). Run `node scripts/shadow-candidate-report.mjs --summary` for a fresh replay summary and `node scripts/current-tension-calibration.mjs` for the full direct calibration grid.
