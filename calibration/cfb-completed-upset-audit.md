# Completed CFB upset-only audit — 2026-10-27

The concern is confirmed for genuinely close extraordinary spread upsets. A narrow convex contribution improves separation without changing the completed base, history, path, overtime, stakes, stagnation, or aggregate ceiling. No deployment.

## Cause and interaction audit

The ordinary three-point synthetic final totals 46: baseline 18 + carried pregame context 2 + final margin 19 + existing history 7. The pre-pass upset function adds only 6/11/16/21/22 points at +7/+14/+21/+28/+30. Thus 52/57/62/67/68 is caused by weak, essentially linear upset separation, not by a broken final base or aggregate ceiling. The ordinary 46 is defensible and stays unchanged.

At a 28-point winning margin, quality is zero. Only the old quarter-strength result significance remains, and the existing result-retention floor yields 3/4/5/6/7. These low values remain exactly equal. The extra contribution uses squared final-margin quality so it decays faster than the original result credit. No new path inference or duplicated history engine is introduced.

Verified path retention already consumes base, upset, history and finish points in an aggregate floor. In the +21 upset ending by 17 after a one-score game at 5:00 Q4, base rises by two and retention falls by two: total stays 71. The noncompetitive counterpart rises from 13 to 15. OT floors likewise consume the contribution; neither floor formula changes. Positive history and finishing awards still distinguish a late thriller from an ordinary close final. The existing 99 ceiling still clamps aggregate scores.

Stakes remain unchanged: the ordinary +21 close upset scores 71; conference-championship context scores 86 and CFP semifinal context 93. They do not automatically force 99. The conference fixture is interpreted by the existing stakes classifier as a 13-point semifinal-stakes factor; this pass does not alter that classification.

## Exact formulas

`unit(x) = max(0, min(1, x))`. Let spread be the qualifying winning underdog's positive spread, margin its positive winning margin, and favoriteRank/dogRank the valid existing rank reader outputs.

```text
m = unit((spread - 7) / 23)
r = favoriteRank
    ? (26 - favoriteRank) / 25 * unit(((dogRank || 35) - favoriteRank) / 20)
    : 0
q = unit((28 - margin) / 25)
s = 6 + 16*m + 6*r*(0.35 + 0.65*m)

BEFORE: points = round(s * (0.25 + 0.75*q))
AFTER:  points = round(s * (0.25 + 0.75*q)
                      + q² * (20*m^1.5 + 3*r*(0.35 + 0.65*m)))
```

Qualification, winner checks, rank gap, and saturation remain unchanged. The convex term accelerates above ordinary upset sizes and saturates at +30. Rank is bounded between zero and one, secondary to magnitude, and the added rank credit is also quality-gated. At full quality the total rank contribution is at most nine points; at a 28-point margin the added contribution is exactly zero. Unranked favorites receive zero rank significance.

## Stored fixture judgments

All five requested captures have valid scoring ledgers. Their exact spreads, rank contexts, competitive shares, history and points are in [the generated calibration tables](cfb-completed-upset-calibration.md). Competitive share here is the existing path reader's eight-point threshold; standalone history uses its own existing ten-point threshold.

| Game | Earlier model → pre-pass → now | Judgment and evidence |
| --- | --- | --- |
| Auburn–Georgia | 99 → 93 → 99 | Rise materially. Auburn +19.5, unranked against No. 1, wins by three. Verified eight-point competitive share 73.5%, last competitive position 1.0. A 14-point comeback, late 24–24 tie and expiration field goal support 25 history + 14 finish. Upset 15 → 23; 39 + 23 + 25 + 14 = 101, clamped to 99. Returning to 99 is a formula consequence, not a target. |
| Florida–Texas | 94 → 83 → 86 | Rise modestly. Florida +13.5, unranked against No. 7, wins by three. Competitive share 64.9%, last position 1.0; 14-point comeback, late one-score game, history 24 and defensive finish 9. Upset 11 → 14. The spread is not extraordinary enough to restore 94. |
| Notre Dame–BYU | 84 → 72 → 73 | Rise modestly. No. 8 BYU +10.5 beats No. 2 Notre Dame by four. Competitive share 78.0%, last position 1.0, four lead changes and late lead flip support capped history 25. Rank gap is only six places; upset 8 → 9. The winning score was at 1:47, so there is no expiration-finish award. No inferred additional drama. |
| Charlotte–Temple | 73 → 63 → 67 | Rise modestly. Unranked Charlotte +17.5 beats unranked Temple by seven. Competitive share 98.3%, last position 1.0, two lead changes and history 19. Upset 12 → 16. Seven-point quality discounts the new contribution; no rank or finishing bonus. |
| Alabama–Tennessee | 27 → 28 → 28 | Remain unchanged. No. 14 Tennessee +7.5 beats No. 6 Alabama by 16. Competitive share 51.0%, last position .665: the margin became nine at 5:05 Q3, with no one-score Q4 window. Existing history 17 remains; upset rounds to four both before and after. The small spread and wider final do not justify a boost. |

## Files in this pass

- `scoring/sports/cfb.js`: only the completed-upset points calculation and its explanatory comment.
- `test/helpers/cfb-upset.cjs`: controlled A–S fixtures and immediate frozen-baseline loader.
- `test/cfb-completed-upset.test.js`: relative assertions, saturation, exact protected regressions, browser/Node and provider replay.
- `test/fixtures/scoring-core-before-cfb-upset.js.gz`: immutable snapshot of the workspace scoring graph immediately before this pass (including pre-existing work).
- `scripts/cfb-completed-upset-report.cjs`: reproducible immediate-before/after report and private path diagnostics in an isolated reporting VM.
- `calibration/cfb-completed-upset-calibration.md`: generated numeric evidence.
- `calibration/cfb-completed-upset-audit.md`: this audit.

Pre-existing workspace edits are preserved. `rating-core.js`, `scoring/shared/football.js`, the NFL model, live CFB upset/rank/opportunity/runway/OT logic, all completed OT/path formulas, and prior tests were not edited in this pass.

## Validation

- Focused completed tests: `node --test test/cfb-completed-upset.test.js test/cfb-completed-calibration.test.js` — 11/11 pass.
- Full scoring suite: `node --test test/*.test.js` — 242/242 pass.
- Worker suite: `npm.cmd test --prefix alerts-worker` — 22/22 pass.
- `node test-score.js` — model and watchlist/timeline fixture groups pass.
- Browser/Node equivalence covers the new A–S matrix and every normalized/enriched stored provider output.
- Provider replay: 107 captures, including 50 CFB; all 57 non-CFB complete outputs equal the immediate baseline.
- Exact equality: live CFB A–Y, NFL A–P, completed OT C/D/E/R/V, path F/G/H/I/J, defense T/U, CFB pregame, and standalone history. See generated before/after tables; comparisons include all components, not just scores.
- Calibration reports: completed-upset, completed-CFB, live-CFB, NFL and stored real-game reports executed. Prior generated reports/CSV were restored byte-for-byte; fresh versions and execution logs are under `work/cfb-upset/`.
- `git diff --check` — pass (only existing Windows line-ending notices).
- The first full-suite attempt passed 241/242; esbuild was blocked reading a parent directory. The filesystem-authorized rerun passed 242/242. PowerShell blocked `npm.ps1`; invoking `npm.cmd` ran the Worker suite successfully. No tests were weakened.

## Limitations

The close-final quality gate is intentionally a proxy: absent a usable path, a close final can still receive the new upset contribution. It does not prove a close fourth quarter and can reward a late cosmetic narrowing. Requiring verified path for every close final would need a broader integration change, outside this pass. Existing validated-path floors remain the only source of late-pull-away rescue.

The 99 ceiling still compresses extraordinarily dramatic games (Auburn is an example); this pass does not redesign aggregation. Rank rounding can tie adjacent elite ranks (+14 against No. 1 and No. 2 both score 65). Stored captures are not fresh verification, and synthetic scenarios supply controlled extraordinary-spread coverage. Coefficients are transparent calibration judgments, not fitted audience ratings. No game identifiers or outcomes enter runtime scoring.
