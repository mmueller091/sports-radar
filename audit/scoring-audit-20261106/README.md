# November 6 scoring and audit corrections

Scoring model: `2026-11-06.scoring-audit.1`.
Audit and scoring-quality analysis: `2026-11-06.audit-quality.1`.
Supported-sport audit scope remains `2026-11-05.audit-scope.1`.

## Production baseline and scope

This release starts from public main `90c8e5d6a614599b3454dfe50170152fca4a9bde`.
Its rebuilt, minified scoring Worker matches the deployed baseline byte for byte:
501,375 bytes, SHA-256 `435bd639955fb37f8ff163259d697a7516d12f1202d0588ddf4d4e5985ae8869`.
The audit sources also incorporate the existing deployed supported-sport scope
safeguards that were newer than the public source tree. Those safeguards are not
new scoring changes.

Changes are limited to scoring-input integrity, a guarded CFB post-score transition,
a bounded NHL two-goal midgame curve, audit evidence interpretation and exports.
Public layout, team ordering, logos, possession indicators, records and game clock
presentation are unchanged. Research limits, notification thresholds, canonical
notification deduplication, polling schedules and bot post limits are unchanged.
The social bot's expected model changes with the scorer; its deployed posting
setting is preserved separately from the repository's disabled-by-default config.

## Scoring changes

- Basketball selects win probability by canonical play identity instead of numeric
  play-ID ordering. A synchronized, independently verified scoreboard can advance
  past a lower provider play ID. Stale clocks, ambiguous identity, rollbacks and
  unsupported probability carry-forward remain rejected.
- CFB uses a bounded conditional midpoint only after a verified leading-team
  touchdown, conversion or kickoff in Q4 when possession is temporarily absent.
  Known possession, ordinary missing data, onside/recovery evidence, defensive
  conversion returns, expired clocks and overtime retain the prior behavior.
- NHL retains more competitiveness for a two-goal game with meaningful midgame
  time remaining. The addition fades to zero by 13:48 remaining in period three.
  Ties, one-goal games, three-goal-plus margins, late two-goal states, overtime and
  final ratings are unchanged. Retained postseason stakes use the original curve.
- The previously deployed delayed-penalty goalie-pull classification is retained.

Retained-state component counterfactuals, not rewritten historical ratings:

| Situation | Previous sequence | Candidate sequence |
| --- | --- | --- |
| Boston midgame one-goal to two-goal lead | 65 to 37 | 65 to 48 |
| Anaheim midgame one-goal to two-goal lead | 69 to 37 | 69 to 50 |
| UTSA-FAU post-score possession transition | 52 to 21 to 30 | 52 to 32 to 30 |

The original raw provider response bodies are not available for every incident.
These counterfactuals reproduce retained component arithmetic, not an assertion
that every historical provider normalization step has been recovered.

## Audit corrections

- Unavailable ratings remain unavailable, never numeric zero. Original historical
  rows remain intact; identifiable old null-to-zero collection errors receive an
  additive reinterpretation and are separated from current integrity failures.
- Comebacks and underdog context no longer imply a universal 85-point target.
  An underrating investigation needs matched comparisons or corroborating event
  evidence. Missing win probability is not positive evidence of upset pressure.
- Full component arithmetic, team-mapped probability, market timestamp provenance,
  capped deficit recovery and separate margin swing improve attribution.
- Expected late decisive hockey drops remain visible without being mislabeled as
  calibration defects. Missing manpower evidence remains unknown. Shootout phase
  and provider play-metadata corrections do not imply scoreboard corruption.
- Usable ratings, complete score progression and complete contextual evidence use
  separate coverage measures. High-priority headings contain actual high/critical
  findings; medium investigations remain visible under their real priority.
- Both audit and scoring-snapshot streams use lightweight full-span projections
  before selective diagnostic reads. Row/byte sampling is explicit, with endpoints
  retained when they fit. Sampling is not misreported as missed collection.
- Unsupported deltas are withheld across omitted predecessors. Quality analysis
  splits continuity at retained-data gaps, so duration, comeback and event-response
  claims cannot cross those gaps. Diagnostic upgrades preserve these decisions.

## Validation

- Complete combined regression command: 2,249 passed; one known pre-existing
  test-file failure; zero skipped or cancelled tests.
- `node test-score.js`: scoring, watchlist and timeline fixtures passed.
- Scoring, audit and social Workers passed locked-dependency Wrangler dry runs.
- The broad comparison checks all 107 captured end states and 2,140 sampled live
  checkpoints. The only sampled numerical changes are 46 intended NHL midgame
  increases. Captured end states and opening ratings are unchanged. No new 85/90
  crossings were observed. This is a bounded sample, not every historical play.
- A separate NHL comparison evaluates 1,429 paired states across 33 games,
  including 25 ESPN and eight official NHL play-by-play histories. It found no
  decreases, protected-state changes, final-rating changes or new 85/90 crossings.
- An isolated local Worker/D1 export smoke handled 20 games, 1,000 audit rows and
  20,000 snapshots, returning a 28,981,342-byte ZIP. Local runtime success is not a
  certification of the hosted 128 MiB ceiling. Shared projected-input budget stays
  36 MiB; detailed reads count against the existing export limits.

The remaining test-file failure is `test/replay-input-comparison.test.js`. It
depends on unpublished commit `1bf1c66703a097c97fcde55b4c7af13055c3c593`, unavailable
from the remote, and was documented before this release. Its oracle and hash
assertions have not been changed or bypassed. Seven archived artifact hashes and
all 107 fixture identities were independently verified against the public
`88f5b40b3d90aeac7f0c266c77f49fa6519c41e7` reference; that does not replace the
unavailable two-source historical oracle.

Reproduce the current-vs-baseline comparison with:

```sh
node scripts/scoring-audit-release-check.mjs --baseline-dir ../slatemeter-baseline --out ../investigation/replay.json
```

No historical snapshot ratings, original findings, notification preferences or
subscription data are rewritten by this release. No test notifications or social
posts are sent for verification.
