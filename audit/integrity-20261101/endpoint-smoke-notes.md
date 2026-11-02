# Candidate Worker endpoint smoke

Executed the actual candidate's exported `fetch` handler, with the repository's real schema in in-memory SQLite, stored fixture-derived canonical games and fresh summary-cache resources. All network calls and background tasks were blocked. The scheduled handler and notification routes were never invoked. This is the existing direct-handler/D1-mock approach used by the Worker tests; no Wrangler process or production binding was opened.

Working directory: `C:\Users\mmuel\Documents\Codex\sports-radar-integrity-20261101`.

Exact successful command (exit 0):

```powershell
node --no-warnings audit/integrity-20261101/endpoint-smoke.mjs > audit/integrity-20261101/endpoint-smoke.log
```

`--no-warnings` suppresses Node 22's experimental SQLite warning; assertions/errors still fail the command. Results and candidate source SHA-256 values are recorded in `endpoint-smoke-results.json`.

| Request | Result | Checked |
| --- | --- | --- |
| GET `/health` | 200 | `ok:true`; model/policy; notification version and active delivery safeguards |
| GET `/feed` | 200 | Six fixture-derived games; fresh canonical feed; every game's model matches health |
| GET `/game/NFL/401873035` | 200 | Captured live correction clock 1:38; canonical score/teams; model; serialized local history row; fresh detail |
| GET `/game/NFL/401872988` | 200 | Completed fixture detail agrees with canonical score/teams/model |
| GET `/game/Tennis/185198` | 200 | Captured live singles detail; canonical model/rating; explicit scoreboard-only coverage and unavailable point-by-point history |
| GET `/config` | 200 | Mock public-key marker and existing 60-second polling contract; this endpoint does not carry a scoring-model field |
| GET `/game/NFL/unknown` | 404 | Unknown IDs do not trigger upstream requests |
| GET `/feed` with unauthorized Origin | 403 | CORS rejection |

All successful normal-origin responses also verified JSON content type, `Cache-Control:no-store` and the allowed Pages-origin CORS header. **Eight requests met their expected statuses and assertions.** Network attempts: **0**. Background tasks: **0**. Notifications: **0**. Production database writes: **0**. The database had no subscription or alert rows.

Compatible model: **`2026-11-01.audit-integrity.3`**. Scoring policy: `live-owned-45-95-relevant-history-cfb-competition-opening-transition`. `/health.notificationVersion` (the API field for alert delivery version): **`2026-11-01.canonical-revalidation.1`**. Safeguards reported: canonical revalidation, atomic claim, 120,000 ms maximum queue age, and no retry after ambiguous delivery.

Fixtures are the preserved November 1 NFL correction, the repository's archived completed NFL game, and the October 28 Tennis provider fragment. The sole history row is explicitly synthetic local storage of the candidate's normalized fixture result, used only to verify serialization; it is not historical production evidence.

Limitations: this verifies candidate route logic and SQLite-backed data flow, not a Cloudflare isolate, live ESPN availability, deployed Worker binary identity, production D1 latency, actual cron traffic, Web Push delivery, or desktop/mobile rendering. No UI tools were used. Production publication and smoke verification remain gated separately by the main task.
