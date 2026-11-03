# Market and timeline release fixtures

Captured November 3, 2026 from the production SlateMeter canonical feed and
`/game/NBA/401909914` endpoint. Baseline: `75c39cc2329723b6d2a68648fd6a6067ffdc57c5`.
The source model is `2026-11-02.clock-integrity.2`.

- `production-games.json.gz`: normalized feed games, capture time, and model version.
  Includes Jets–Canadiens 401892634 and Oilers–Devils 401892636 with the reported prices.
- `pelicans-grizzlies.json.gz`: public Game Center response, including all 475 snapshots.
- `pelicans-stored-rows.json.gz`: read-only D1 excerpts for the last live 71 and final 97,
  retaining the stored normalized state and factor arithmetic.
- `pelicans-provenance.json.gz`: read-only D1 observation quality/reason excerpts.
- `synthetic-cases.mjs`: explicitly synthetic boundary scenarios for NFL, CFB, NBA,
  NHL, MLB, NCAAM (internal NCAAB), and Grand Slam tennis market handling.
  These are not asserted to be actual events or bookmaker quotes.

No production observations were modified. The replay server gives one archived
live row a local-only ID so the live Game Center can be inspected; its scores,
model version, evidence quality, and observations remain intact. It is excluded
from the canonical feed to avoid presenting an archived model as current.

Run `node scripts/audit-market-timeline.mjs` for reproducible before/after copy,
observation identity, and scoring/Worker/calibration/notification source parity.
Run `node scripts/serve-market-timeline.mjs` after the site build for visual QA.
All audit calculations and technical terms stay outside public narratives.
