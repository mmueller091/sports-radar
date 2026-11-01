# NFL pregame competitiveness correction

Model: `2026-11-01.nfl-pregame.3`. Baseline: `2026-11-01.nfl-pregame.2`, commit `773701d`.

The audit freezes the production feed, current ESPN scoreboard records/markets, validated near-kickoff standings/results, and accepted news contexts. All 25 frozen inputs reproduced their actual production ratings before edits. Dates below use America/New_York, including the Sunday night games that start after midnight UTC. Future records describe what is known on November 1; they do not predict November 1 results.

## Confirmed cause

The latest smoothing change in `773701d` introduced this record award:

```
S(x) = smoothstep(clamp(x, 0, 1))
single = min(2, max(0, (max(p1,p2) - .5) * 12)) * min(1, max(games1,games2)/4)
oldQuality = single + (14 - single) * S(((p1+p2)/2 - .5)/.2)
retention = .5 + .5 * clamp((21 - abs(spread))/14, 0, 1)
```

Records normalize correctly as `(wins + ties/2)/(wins + losses + ties)`. There is no special SF/KC weight or standings parsing error. SF 6–1 and LV 3–4 average .642857: `single=2`, the blend adds 9.62, and the 10-point market retains .892857 of the rounded 11.62 record points, producing **10.37**. KC 5–1 and NYJ 2–5 average .559524: the same blend yields 4.56 before .910714 retention, producing **4.15**. The stronger Las Vegas opponent warrants some distinction, but allowing one elite team to approach a two-strong-team bonus amplifies that distinction excessively.

Separately, the previous NFL spread anchors awarded +3 at seven, +0.5 at 9.5 and zero at ten. That curve allowed the inflated quality bonus to survive almost intact in likely mismatches. Both problems are in the shared calculation used by the Worker and browser, rather than Game Center wording.

The losing-record deduction itself is not the cause: its severity, severe-team floor and point-differential relief remain unchanged. The defect was the positive-quality blend added alongside that smoothing.

## Formula correction

```
mutual = S((min(p1,p2) - .5)/.07)
quality = single + (14 - single) * mutual * S(((p1+p2)/2 - .5)/.2)
```

The weaker team must contribute winning quality before the matchup receives more than the single-team allowance. The transition takes seven percentage points above .500, with continuous value and slope. One team at or below .500 limits the record award to two before the existing market retention; established strong pairings can still earn fourteen. Missing records add no record award. This uses the same percentages, rather than adding another strength signal from the spread.

NFL spread anchors are now:

| Absolute spread | 0 | 3 | 3.5 | 6 | 7 | 8 | 10 | 14 | 17 | 21+ |
|---|---|---|---|---|---|---|---|---|---|---|
| Adjustment | +7 | +6 | +5.625 | +2 | 0 | −2 | −4 | −6 | −8 | −10 |

A monotone cubic Hermite curve interpolates the anchors without overshoot, threshold jumps or derivative discontinuities at the internal knots. A 9.5-point favorite now receives −3.62. Seven is neutral; every larger spread is negative. CFB retains its previous separate linear curve. The old record-evenness and presumed division-race fallbacks are omitted from calibrated NFL scoring when odds are missing: the same records cannot supply quality, competitiveness and assumed stakes. Actual division membership still earns four, and verified standings/first-place/tiebreaker factors remain intact.

The close-spread/high-total interaction, five-point total cap, graduated poor-record deductions, unbeaten prestige, sourced return tiers and news/rivalry budgets remain intact. Point differential remains split between losing-record relief and its complementary quality contribution; season margin and recent form retain their small separate budgets. Existing market-aware absence handling avoids charging an injury already reflected in a listed line. No team names, game IDs, dates or target ratings appear in the scoring rules.

## Context and future games

The existing context cache only enriches upcoming NFL games within 42 hours of kickoff, using already cached summaries/team news and a six-hour refresh window. November 8 therefore currently lacks verified differential, recent-form and division-race factors. Missing evidence contributes zero rather than invented stakes, assumed results or an automatic future-date deduction. The same inputs produce the same score today or seven days ahead. New evidence near kickoff can legitimately change a future score. No extra fetch, AI call, integration, or stale-standings bypass was introduced.

## Full-slate comparison

These are recalculations on identical inputs, not comparisons of different snapshots or changing odds. Components and unrounded totals are in [the generated JSON](output/nfl-competitiveness-20261101.json).

| Date | Matchup | Spread | Before | After | Change | Main reason |
|---|---|---|---:|---:|---:|---|
| Nov 1 | BAL @ BUF | BUF −3 | 75 | 75 | 0 | Preserved |
| Nov 1 | TEN @ CIN | CIN −13.5 | 40 | 38 | −2 | Spread downside |
| Nov 1 | ARI @ DAL | DAL −7 | 48 | 45 | −3 | Removed seven-point positive award |
| Nov 1 | MIN @ DET | DET −3 | 79 | 79 | 0 | Preserved |
| Nov 1 | LV @ NYJ | NYJ −1.5 | 45 | 45 | 0 | Preserved |
| Nov 1 | CLE @ PIT | PIT −3.5 | 75 | 75 | 0 | Preserved |
| Nov 1 | ATL @ TB | TB −2.5 | 57 | 57 | 0 | Preserved |
| Nov 1 | IND @ JAX | JAX −10 | 48 | 44 | −4 | Spread downside |
| Nov 1 | LAC @ LAR | LAR −6.5 | 39 | 37 | −2 | Less competitive spread |
| Nov 1 | KC @ DEN | KC −1.5 | 76 | 76 | 0 | Preserved |
| Nov 1 | NE @ MIA | NE −7 | 49 | 46 | −3 | Removed seven-point positive award |
| Nov 1 | PHI @ WSH | WSH −6 | 47 | 45 | −2 | Less competitive spread |
| Nov 8 | CIN vs ATL | CIN −3 | 55 | 53 | −2 | Bounded single-team quality |
| Nov 8 | DAL @ IND | DAL −4.5 | 49 | 49 | 0 | Subpoint spread reduction, same rounded rating |
| Nov 8 | NYJ @ KC | KC −9.5 | 47 | 40 | **−7** | Quality and spread correction |
| Nov 8 | DET @ MIA | DET −7 | 48 | 45 | −3 | Removed seven-point positive award |
| Nov 8 | CLE @ NO | NO −2.5 | 50 | 50 | 0 | Preserved |
| Nov 8 | NYG @ PHI | NYG −1.5 | 54 | 54 | 0 | Preserved |
| Nov 8 | LAR @ WSH | LAR −5.5 | 45 | 44 | −1 | Less competitive spread |
| Nov 8 | DEN @ CAR | DEN −2.5 | 54 | 50 | −4 | Bounded single-team quality |
| Nov 8 | HOU @ LAC | HOU −3.5 | 41 | 41 | 0 | Preserved |
| Nov 8 | GB @ NE | NE −3 | 57 | 57 | 0 | Preserved |
| Nov 8 | LV @ SF | SF −10 | 54 | 41 | **−13** | Quality and spread correction |
| Nov 8 | ARI @ SEA | SEA −10.5 | 46 | 42 | −4 | Spread downside |
| Nov 8 | TB @ CHI | CHI −6 | 49 | 47 | −2 | Less competitive spread |

Both movements over four points were inspected at component level:

- LV–SF: quality **10.37→1.79** (−8.58), spread **0→−4** (−4), total unchanged at +1.25. Raw 53.62→41.04; rounded 54→41.
- NYJ–KC: quality **4.15→1.82** (−2.33), spread **+0.50→−3.62** (−4.12). Raw 46.65→40.20; rounded 47→40.

These are intended corrections to the reported defect. No other movement exceeds four. SF remains one point above KC because its 48.5 total supplies +1.25 while KC's 43.5 supplies zero, partly offset by SF's wider line. SF no longer ties the competitive Denver/Carolina or Giants/Eagles matchups. Six requested close-game benchmarks retain their exact ratings; Tennessee/Cincinnati loses two for its 13.5-point market.

## Reproduction and verification

`node scripts/nfl-competitiveness-report.mjs` rebuilds the numerical audit. Immutable inputs and an independently bundled before scorer live in `test/fixtures/nfl-pregame/competitiveness-*`. The regression matrix covers the requested five spreads across five record tiers, derivative continuity/signs/bounds, .500 transitions, ties, division interest, unbeaten teams, missing odds/records/context, today versus seven days ahead, factor sums, ranking order, browser/Worker equality and observed kickoff baselines. Archived other-sport and NFL live/final factor outputs remain checked against the frozen engine.

`node scripts/verify-nfl-competitiveness.mjs` checks all 25 card scores and twelve detail views across desktop/mobile. Its production mode additionally verifies the exact published asset revision, service-worker revision, model version and every production factor against the audit. The normal GitHub Pages push workflow remains the deployment route. The Cloudflare Worker must deploy the same shared model because it owns the canonical feed.

Pre-publication validation: **810/810 repository and Worker tests passed**, site build passed, Worker deployment dry run passed, `git diff --check` passed, and all 25 ratings plus twelve desktop/mobile Game Center views passed browser checks. Frozen-engine comparisons confirm unchanged archived NFL live/final and other-sport rating/factor outputs. Fresh Windows checkout line endings were restored to their repository LF bytes, and the historical Git object required by the existing replay test was fetched from the prior local checkout; neither repair changes committed historical evidence or weakens its checks.
