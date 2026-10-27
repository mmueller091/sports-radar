# Overtime Phase Label Fix Audit

## Purpose

This change fixes misleading live phase text such as `5th quarter`, `6th quarter`, and `3rd half` when the provider period represents overtime. Phase formatting is centralized so the game card and other consumers can use the same normalized value.

## Root cause

`game.live.phase` is built in the shared scoring state path:

1. Provider status supplies the period, clock, and status detail.
2. `liveSnapshot()` in `rating-core.js` calls shared `livePhase()`.
3. The result is assigned to `game.live.phase`.
4. Cards, rating explanations, accessibility labels, rating-history snapshots, and details consume that value.

Previously, `livePhase()` formatted overtime only for NFL/CFB. NBA and NCAAB period numbers beyond regulation were rendered as ordinal quarters or halves. NHL overtime was always labeled `OT`, including later overtimes. The game detail header also preferred raw provider status text rather than the normalized live phase.

## Changes in this fix

- `scoring/shared/time.js`: `livePhase(sport, status, format)` now derives overtime from regulation-period counts and uses `OT`, `2OT`, `3OT`, etc. The clock-first format (`2:00 · 2OT`) is retained. NCAAB uses provider `format.regulation.periods` when available, with two periods as the default. Break descriptions such as `End of 6th quarter` are normalized to `End of 2OT` when the period indicates overtime.
- `rating-core.js`: passes the competition's format metadata (with stored game metadata fallbacks) to the shared formatter.
- `app.js`: the live game detail header prefers `game.live.phase`, matching the card and other live consumers.
- `test/live-phase.test.js`: adds phase-matrix coverage and a synthetic NBA 2OT consumer-flow check.

## Expected phase outputs

| Sport | Regulation | Overtime examples |
|---|---|---|
| NBA | Period 4 → `4th quarter` | Periods 5/6/7/8 → `OT` / `2OT` / `3OT` / `4OT` |
| NCAAB, default format | Period 2 → `2nd half` | Periods 3/4 → `OT` / `2OT` |
| NFL | Period 4 → `4th quarter` | Periods 5/6 → `OT` / `2OT` |
| CFB | Regulation follows its existing quarter convention | Periods 5/6 → `OT` / `2OT` |
| NHL | Period 3 → `3rd period` | Periods 4/5 → `OT` / `2OT` |

NCAAB metadata specifying four regulation periods is also covered; periods 3/4 remain quarters and periods 5/6 become `OT`/`2OT`.

## Consumer verification

The synthetic NBA period-6 case confirms the corrected `2OT` phase appears in:

- Game card phase and accessibility label
- `explainRating()` output
- Rating-history phase snapshot
- Game detail header
- Timeline current marker

The consumer assertions reject `6th quarter`. The timeline's independent `timelinePeriodLabel()` defensive formatting remains in place for historical play descriptions containing bad provider labels.

## Scoring and timeline scope

This phase-label change does not modify scoring coefficients, ratings, upset logic, history calculations, timeline chronology, or overtime duration/geometry formulas. No deployment was performed.

The working tree already contained edits to `app.js`, `test-score.js`, and an untracked `test/timeline.test.js` before this phase-label work began. The timeline changes visible in `app.js` and `test/timeline.test.js` are from that earlier work and are not attributed to this fix. The earlier edits were preserved.

## Validation recorded for this change

- `node --test test/live-phase.test.js`: 19 passed
- `node --test test/timeline.test.js`: 16 passed
- `node --test test/*.test.js`: 277 passed
- `node test-score.js`: passed (score model, watchlist, and timeline fixtures)
- Worker tests (`npm.cmd test` from `alerts-worker`): 22 passed
- `git diff --check`: clean

The initial sandboxed full-suite run could not build the Worker bundle because esbuild was denied access to a parent directory. The same full suite passed when rerun with the required directory access.
