# Upcoming football market hotfix

Model: 2026-11-01.football-market.2. Baseline: 6de87bd12d52dec20226c4d02c2b04206371382b.

## Root cause

The football-live 48-hour guard compared quote time with kickoff, which incorrectly excludes early markets from that context helper. It was not itself called by the upcoming rating calculation. The verified pregame mismatch had two connected causes: future provider updates omitted raw odds while the feed retained only their displayed line; and prepareFootballOpening rebuilt opening factors without copying the new upcoming baseline to the visible score/factors. Thus visible spreads and totals could disagree with pregame scoring.

## Isolated correction

Upcoming NFL/CFB select one eligible market for display, baseline and visible rating. Fresh provider odds take priority; valid retained raw markets survive omissions; older publications can migrate their exact displayed spread/total with explicit untimestamped provenance. First-observed time is retained, not renewed by another missing-data update. Quotes older than 48 hours are aged against supplied observation time, independently of days until kickoff. Missing quote timestamps use actual provider observation time; missing markets add nothing. Live/in-play, malformed/future timestamps and post-kickoff quotes cannot supply upcoming markets. Current source markets can refresh an untimestamped observation; absent updates cannot.

The live helper uses this eligibility rule only for upcoming states. Its existing live branch, weights and safeguards are unchanged. Recorded history, completed ratings and unrelated sports are not recalculated. Evaluation time is not a content fingerprint, preserving existing refresh reuse and request cadence.

## Captured production examples

Capture: 2026-11-01T19:45:46.534Z. Before ratings are the actual published feed. After ratings use the same teams, records, retained line, available summary and verified NFL context.

| Game | Spread / total | Before | After | Delta |
|---|---|---:|---:|---:|
| Chicago Bears at Seattle Seahawks | SEA -3 / 46.5 | 62 | 62 | 0 |
| Jacksonville Jaguars at Baltimore Ravens | BAL -3 / 48.5 | 52 | 60 | +8 |
| Cincinnati Bengals at Atlanta Falcons | CIN -3 / 49.5 | 44 | 53 | +9 |
| New York Jets at Kansas City Chiefs | KC -9.5 / 43.5 | 44 | 40 | -4 |

## Controlled missing-market comparisons

These are controlled inputs, not additional real-game claims. Every 1/4/7/14-day horizon produces the same rating for the same eligible market.

| Sport | Spread | Before | After | Delta |
|---|---:|---:|---:|---:|
| NFL | 3 | 55 | 67 | +12 |
| NFL | 9.5 | 55 | 53 | -2 |
| CFB | 3 | 40 | 44 | +4 |
| CFB | 35 | 40 | 30 | -10 |

Full factors and all horizon results are in output/pregame-market-hotfix-20261101.json. Differences are existing spread/total modifiers and the existing market-sensitive team-quality calculation; no weights changed. The already-correct Bears–Seahawks market should remain unchanged.

## Earlier production evidence

A retained 2026-11-01.basketball-state.1 feed from 2026-11-01T19:12:43.645Z, before football-live.1 was deployed, already showed the same four ratings and market omissions. The pregame mismatch therefore predates that release. Its compact evidence is retained with the regression capture.

## Validation

918 tests passed, zero failures. The full browser/Worker suite, exact live/final and unrelated-sport parity against the frozen deployed model, 295-game warm-cache reuse, real feed repair/expiry, 1/4/7/14-day market matrix, syntax checks, test-score.js, browser build and Wrangler dry run passed. No scoring weights, historical snapshots, recurring requests, subscriptions, database schema or other sports were changed.
