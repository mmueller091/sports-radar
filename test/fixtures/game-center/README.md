# Game Center acceptance capture

Captured read-only from the production `/game/NFL/401873024` endpoint on November 2, 2026, before this release. The compressed fixture preserves the full public payload, including all 726 observations, evidence classifications, model identities, and original observation timestamps. No observation is replayed to generate the displayed curve.

- Source: https://sports-radar-alerts.mmueller918.workers.dev/game/NFL/401873024
- Production source baseline: `d4ef42e08dc8af18c6744ffd6551019e20b31f16`
- Uncompressed SHA-256: `e0f3be7718f706dc936eaa848d3a00fb6006cbe2132e871bd07cc20d08bb596e`
- Final rating: 95; last verified live rating: 95 at OT 2:58; decisive field goal: OT 2:53.

The original ten factor contributions sum exactly to 95. New metadata is tested separately against current engine operations; absent historical normalization metadata is never reconstructed.
