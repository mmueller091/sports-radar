SlateMeter pregame upgrade — Phase 1 review

This is the original Phase 1 review record. The subsequent [24-example editorial pass](../pregame-editorial-20261103/examples.html) compares this draft with the final candidate; the full narrative corpus below has been refreshed to the final wording. Original test logs below predate that editorial pass; combined integration verification is recorded separately.

Implemented locally on `pregame/phase1-narratives`, based on production commit `31f3eb26fbd3c3fc083f7828b2bb93d181fdb888`. Nothing was pushed or deployed. The original working checkout was preserved. Phase 1B and Phase 2 are independent sibling worktrees and branches.

The new upcoming-game explanation leads with supported matchup appeal, describes the market naturally, includes NBA/NHL division context and positive NFL total context, uses short college names, and avoids hypothetical stronger opponents. Existing story verification, conditional language, link deduplication and live/completed explanations are preserved. No new excitement labels or scoring calculations appear in the product.

**Production corpus.** The fresh capture at 2026-11-03 19:44:17 UTC contained 262 upcoming games, compared with 254 in the user's earlier audit. Counts therefore differ from the original findings. [All before/after examples](narrative-corpus.html) and [machine-readable evidence](narrative-corpus.json) are retained.

| Measure | Before | After |
|---|---:|---:|
| Old generic record-gap sentence | 50 | 0 |
| Old losing-record filler | 54 | 0 |
| Missing-market filler | 49 | 0 |
| Hypothetical stronger-matchup comparisons | 26 | 0 |
| NBA/NHL division games described | 0 | 22 of 22 |

These are exact phrase-pattern counts, not a claim that deterministic prose has no repetition. Limited-data games still share sentence structures. Ratings and matchup inputs are unchanged.

**Real examples.** Saturday's six leading CFB matchups are retained at ratings 82, 81, 80, 79, 76 and 73, covering both noon and evening kickoffs.

- Texas–Missouri, 82: Previously ended with “Both teams already have multiple losses, keeping this below a meeting of unbeaten contenders.” Now: “No. 10 Texas (6-2) and No. 19 Missouri (6-2) meet in a ranked matchup. A 2.5-point spread points to a close contest.”
- BYU–Utah, 80: Previously described a 5.5-point spread as leaving more risk of an uneven contest. Now: “No. 7 BYU (7-1) and No. 3 Utah (8-0) meet in a top-10 matchup, with Utah's unbeaten season on the line. The long-running BYU–Utah rivalry adds local bragging rights. The 5.5-point line favors Utah, but keeps a competitive game in view.”
- Ottawa–Buffalo, 57: Preserves the standings-points and competitive-market explanation, adding “They are also Atlantic Division opponents.”
- Cincinnati–Atlanta, 56: Preserves the records and 3-point spread, adding “The listed total of 52.5 suggests the potential for plenty of scoring.” This communicates an existing positive rating driver without asserting offensive quality or an outcome.

**Verification completed.** The full root suite passes 1,348/1,348 tests. The unchanged Phase 1 Worker passes 252/252 tests. Standalone scoring and watchlist timeline fixtures pass. The production site build passes. The corpus explicitly checks all 262 captured games plus controlled MLB, tennis, ties, NHL overtime-loss records and openers. All 36 captured live/completed explanations match the baseline exactly. Hash comparison confirms 85 scoring, Worker and calibration-output files are unchanged. Historical replay and calibration regressions pass without regenerating or editing their expected outputs.

Local verification initially exposed Windows checkout line endings, a frozen historical Git object absent from the isolated clone, and esbuild sandbox access restrictions. Exact unchanged repository bytes were restored, the historical object was fetched from the user's existing local repository, and the suite ran with the required filesystem access. No scorer, replay fixture or calibration expectation was changed to obtain a passing run. Test logs are retained alongside this report.

**Deployment gate still open.** Desktop/phone visual QA and the Game Center “More” interaction have not been verified. Computer Use stopped because it could not confidently determine the browser URL for its policy check. The user could not inspect the prepared preview. Automated UI contracts pass, but they do not substitute for that visual check. Do not deploy until it is completed. The development preview is available through `node work/pregame/preview.mjs` on port 5531 while running; `/qa` contains desktop/phone links. The standalone corpus HTML remains available without that server.

**Other phases.** Phase 1B is in sibling `work/pregame-research`, branch `pregame/phase1b-research`: seven-day canonical-slate selection, bounded priority/rotation, relevance-ranked articles, unchanged AI reservations, and separate saved/read/link-eligible diagnostics. Its audit traces all 13 stored rows and explains the zero public links. Phase 2 is in sibling `work/pregame-facts`, branch `pregame/phase2-facts`: an offline fact normalizer, source projections, coverage evaluation, MLB/tennis fixture audit and adversarial tests. It has no production imports. Both remain undeployed.

The separate [FCS explanation](fcs-rating-40.md) documents the 61-of-62 observation. FCS scoring was not changed. Optional recurring AI prose remains disabled; the Phase 1B report records observed inference usage, reservation headroom, current pricing and the evidence still needed before enabling it.
