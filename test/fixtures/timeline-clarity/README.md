# Timeline clarity fixtures

Captured from production running `a0ebd2fb27931e4b3bd0303fd2d0222913d9b107`, before edits, on November 2, 2026 at approximately 01:27 UTC (November 1 in New York).

- `NFL-401873033.json.gz`: public Worker `/game/NFL/401873033`, Chiefs–Broncos.
- `NCAAB-401920982.json.gz`: `/game/NCAAB/401920982`, Notre Dame–Villanova.
- `NBA-401909903.json.gz`: `/game/NBA/401909903`, Celtics–Magic.
- `final-rows.json.gz`: read-only D1 query of all completed `sports_snapshots` rows for those three game keys, including stored `normalized_state`. No historical rows were changed.

Each detail capture contains `capturedAt` and `detail`. The helper adds the new read-time evidence annotations from the raw rows, leaving captured values untouched. The original payloads remain available for baseline comparison.

Chiefs has six incomplete 38s and six supported 75s. The 38s contain baseline/margin factors without completed-summary evidence. Notre Dame's earlier 61 used a 74–70 result; the six subsequent 65s used 74–72. Celtics has five supported 67s, including a provider final-clock reset from `0.0` to `12:00`. Model/refresh changes also produced duplicate completed observations.

These captures are retained for regression tests independently of production's existing 30-day history retention. Missing raw provider responses are not reconstructed or treated as verified evidence.
