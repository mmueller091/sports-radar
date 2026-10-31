# NHL public play-by-play replay sources

Each numbered JSON file is an unmodified-content, formatted snapshot of the NHL public `/v1/gamecenter/{id}/play-by-play` response. Its `.source.json` sidecar records the URL, capture time and exact formatted-byte SHA-256. Git attributes preserve LF endings for those hashes.

| NHL ID | Date | Matchup | Coverage |
| --- | --- | --- | --- |
| 2023030417 | 2024-06-24 | Edmonton at Florida | Final Game 7, late one-goal pressure, goalie pulled |
| 2024020009 | 2024-10-09 | Calgary at Vancouver | Regular-season 3-on-3 OT, comeback |
| 2024020022 | 2024-10-11 | Philadelphia at Vancouver | Tie, regular-season OT, shootout exclusions |
| 2024030411 | 2025-06-04 | Florida at Edmonton | Ties, PP, playoff OT |
| 2024030412 | 2025-06-06 | Florida at Edmonton | Late tie, playoff double OT |
| 2024030413 | 2025-06-09 | Edmonton at Florida | Blowout, PP |
| 2024030414 | 2025-06-12 | Edmonton at Florida | Comeback, late pressure, playoff OT |
| 2024030416 | 2025-06-17 | Edmonton at Florida | Wide margin, empty net |

These are final corrected event ledgers, not a capture of successive live revisions. Historical checkpoints use prefixes of these ledgers. Delayed/corrected delivery tests inject explicitly labeled perturbations. Replays do not claim recorded historical excitement scores or historical roster/market context.

Do not overwrite these captures silently. Re-capture intentionally with `scripts/capture-nhl-pbp.mjs`, review upstream corrections and sidecar hash changes, regenerate the comparison and run replay tests.
