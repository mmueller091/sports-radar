# Corrected replay input comparison v2

All 107 retained fixtures scanned. 24562 historical checkpoints; 23767 corrected checkpoints. Stable event/play identity: 23767 matched, 0 added, 2 removed, 793 excluded.

Frozen Phase 2 (65/35, ceiling 34; Generic Leverage 8 / .55 / .40), Phase 3 and Phase 3.1 definitions are unchanged. Trajectory stays opt-in. No policy selected or promoted. The old staging manifest validates only its historical checkpoint.

## Input effects, matched identities

Policy | Before mean | After mean | Mean delta | Equal-game delta | Exact 99 before/after
--- | --- | --- | --- | --- | ---
Phase 2 | 51.9541 | 51.5665 | -0.3876 | -0.4877 | 204/142
original slow-evidence / gate-10-65-wp-100 | 53.5121 | 53.1371 | -0.3749 | -0.4723 | 620/525
intermediate gate-45-95-wp-65 | 52.7178 | 52.3319 | -0.3859 | -0.4839 | 417/329
live-owned-35-85 | 51.4557 | 51.0624 | -0.3933 | -0.4826 | 245/179
live-owned-45-95 | 51.341 | 50.9441 | -0.3969 | -0.4882 | 233/168

## Policy differences on identical corrected inputs

Policy | Mean | Delta vs Phase 2 | Equal-game delta | Exact 99
--- | --- | --- | --- | ---
Phase 2 | 51.5665 | 0 | 0 | 142
original slow-evidence / gate-10-65-wp-100 | 53.1371 | 1.5706 | 1.3439 | 525
intermediate gate-45-95-wp-65 | 52.3319 | 0.7654 | 0.6321 | 329
live-owned-35-85 | 51.0624 | -0.5041 | -0.6106 | 179
live-owned-45-95 | 50.9441 | -0.6224 | -0.7383 | 168

## Named anchors

Case | Suitability | Phase 2 before/after | Live-owned-45-95 before/after | Floor before/after
--- | --- | --- | --- | ---
R05 | excluded: current football situation unresolved | 99/66 | 99/66 | 35/0
R10 | excluded from confident judgment: incomplete earlier history | 87/87 | 87/87 | 0/0
R21 | excluded: current football situation unresolved | 84/51 | 82/45 | 32/0

## Scope

Ordering, transition categories, unresolved exclusions, exact affected game/checkpoint IDs, and score/situation/WP/history changes are in [the scope report](output/replay-input-scope.v2.json).

{
  "before": 24562,
  "after": 23767,
  "ordering": {
    "score-snapshot-resynchronization-history-still-incomplete": {
      "games": 27,
      "records": 35
    },
    "clock-corroborated-source-reorder": {
      "games": 11,
      "records": 187
    },
    "sequence-conflicts-with-clock-and-source": {
      "games": 8,
      "records": 641
    }
  },
  "situation": {
    "possession-transition-needs-new-scrimmage": {
      "games": 75,
      "records": 1514
    },
    "scoring-record-is-not-current-scrimmage": {
      "games": 75,
      "records": 632
    },
    "timeout-endpoint-conflicts-with-continuity": {
      "games": 75,
      "records": 614
    },
    "period-boundary": {
      "games": 75,
      "records": 225
    },
    "timeout-without-continuing-possession": {
      "games": 53,
      "records": 476
    },
    "missing-or-invalid-scrimmage-endpoint": {
      "games": 17,
      "records": 25
    },
    "endpoint-team-not-supported-possession": {
      "games": 63,
      "records": 124
    }
  },
  "unresolved": {
    "unresolved-clock-source-conflict": {
      "games": 39,
      "records": 344
    },
    "unresolved-score-rollback": {
      "games": 30,
      "records": 302
    },
    "depends-on-unresolved-score-rollback": {
      "games": 15,
      "records": 128
    },
    "unpositioned-event": {
      "games": 2,
      "records": 34
    }
  },
  "gamesWithOrderingRepairs": 34,
  "gamesWithSituationRepairs": 75,
  "gamesWithExclusions": 61,
  "added": 0,
  "removed": 2,
  "excludedCheckpoints": 793
}

## Validation and boundaries

Identical-input batches: 40163; trajectory-off frozen scorer parity: 40163; byte-identical input batches reused: 8166. Oracle comparisons establish scorer parity on supplied inputs; reuse avoids redundant scoring of identical checkpoints. Neither implies equality between faulty and repaired inputs.

- Retrospective captures establish event ordering support, not original publication time, live availability, or revision history.
- Ambiguous score intervals and chronology records are excluded, not fixed by monotonic score clamping. Later complete consistent scoring snapshots restart evaluation with explicit incomplete-history flags.
- Time-only WP waits until a strictly later game clock. Linked WP for excluded or future plays is never admitted.
- All 107 retained fixtures scanned; only six sports have replay records. These are diagnostic comparisons, not accuracy labels.
- No production input validator was enabled. Existing shared football scoring still trusts callers with malformed possession/field-position inputs.

Remaining production exposure: shared footballSituationImpact and NFL/CFB possession paths can still accept caller-supplied team/field position without a valid current scrimmage/explicit try. A separate proposed change is a shared validated-current-situation contract for those callers, allowing explicit tries and supported timeout continuity. That production behavior change is outside this repair and is not enabled.

Threshold crossings (70/80/85/90/99), equal-game shares, per-sport summaries, decisive/floor changes, all anchor outputs and provenance are in [comparison JSON](output/replay-input-comparison.v2.json). Every old/new compact policy result and input hash is retained in `output/replay-input-states.v2.json.gz`.

Reviewer cards: [replay v2 pack](trajectory-reviewer-pack.replay-v2.md). Full anchor diagnostics: [replay v2 key](trajectory-diagnostic-key.replay-v2.json). Frozen evidence and the earlier presentation correction are preserved.
