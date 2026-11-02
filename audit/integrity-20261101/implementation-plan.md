# November 1 production integrity response: implementation plan

The authoritative audit is `C:/Users/mmuel/Documents/Codex/audit-20261101-sports-radar/audit.md`. Production and GitHub main were verified at `8ad7a0096307e0ab9038dbcba60f0e965e9bcfaa`; no subsequent production changes were found. The original working directory is at `ec2b87dc789fff3c5eca54e8377fe78dfe98319e`, with substantial user edits. Implementation uses the separate `sports-radar-integrity-20261101` checkout on `audit/20261101-integrity-response`; the original checkout is untouched.

Rollback source: `rollback/production-20261101-8ad7a00`, exactly the deployed commit. Active Worker rollback version: `8bb6ab4e-ff5b-43ca-bae4-493371b20d9e`, assigned 100% traffic, deployed 2026-11-02 02:27:19 UTC (November 1 21:27:19 EST). Executable byte provenance is unavailable; identity and routing were read from Wrangler. Public health reports `2026-11-01.production-integrity.2`.

The baseline build matches the published scorer SHA-256 `0b3a7e5cb8ea9391be3bf0652a35fc0a735683fb5655c10b36979974803ce885`; published app SHA-256 is `e4ddebb4e3621dd46d66c90fec613ca496df9e0182a397bf9bc8e25fe3b5aec5`. Raw baseline checks and test output are beside this document.

| Order | Scope | Modules and tests | Risk / dependency |
|---|---|---|---|
| 1 | F1/F2/F4/F5: correction, quality, event identity, observation boundary | snapshot-integrity, live-evidence, new provider-evidence, active adapter/runtime; captured and synthetic evidence regression tests | Shared pipeline: baseline comparison across all sports required; normalize before every scoring consumer |
| 1 | F3/F6: observed trajectory coverage and missing probability | shared trajectory, trajectory policy; header-only, truncated, complete, scoreless controls across eight models | Removes unsupported continuity credit; preserve observed events and genuine explicit probability zero |
| 2 | F9: delivery-time alert validation and atomic claim | Worker queue/delivery, SQLite mock delivery tests | No real notification tests; fail closed for unavailable/obsolete state or ambiguous send outcome |
| 3 | C1: live urgency versus retrospective quality | production runtime; legal kneel sequence and meaningful-drive/final controls | Model version bump; history remains immutable, finals remain separate |
| 4 | C2/F7/F8: MLB plate leverage, Soccer recent pressure, Tennis nested matches | MLB model, shared pressure, Tennis provider/collector/feed/details; targeted contrasting controls | No global recalibration; reliable provider facts only; Tennis unavailable point/history fields stay unknown |
| 4 | NHL / NBA / NCAAM investigation | penalty provenance and rule-aware conflict checks; historical chronology review | Do not override a provider from one example or treat revised historical PBP as original live arrivals |
| 5 | Full validation and reporting | full root/Worker suite, fixtures, calibration, complete-prefix replays, browser/Worker parity, dry run, UI inspections | Every unexplained regression blocks publication; report exact causes and limitations |
| 6 | Release if all applicable gates pass | commit, Worker first, confirm health/feed/details/cron, Pages via established main workflow, published asset hashes | Preserve rollback reference; stop before release if consistency cannot be established |

The browser bundle and Worker both import `scoring/live-runtime.cjs`; Pages checks the canonical feed model version. The established workflow builds `dist` and publishes GitHub Pages on main; the Worker is separately deployed with Wrangler. This project retains those workflows. No experiments, unrelated sport weights, billing settings, or delivery tests against real subscriptions are authorized by this implementation plan.
