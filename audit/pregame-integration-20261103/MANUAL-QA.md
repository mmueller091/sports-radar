Manual desktop and phone verification — release gate

Use the integrated candidate in `C:\Users\mmuel\Documents\Codex\2026-10-21\sports-radar-publish\work\pregame-integration`, branch `pregame/integration-20261103`. The read-only preview uses the November 3 frozen production corpus and the actual built application. It makes no production writes and serves local API overrides. Team-summary/stat panels outside the captured narrative inputs are intentionally incomplete; this preview verifies the actual outlook and surrounding layout.

1. Open `http://127.0.0.1:5532/qa`. If it is no longer running, open PowerShell in the candidate directory and run `node scripts/serve-pregame-integration.mjs`, then open that URL. The validated `dist` build is already present. To rebuild later, set `$env:ASSET_REV='36fca6bcd78b5cf8cd88478de1bf4439aafd1625'` and run `node scripts/build-site.mjs` first; use the final candidate SHA instead when preparing an actual release.
2. Choose **Desktop 1440**, then each of the eight matchup links. Check that title, team names/records/ranks, score badge, metadata, outlook and tabs do not overlap. All outlook text must be visible, with comfortable line spacing and no clipped final sentence. The desktop iframe renders a 1440px layout scaled to fit common monitors; use `http://127.0.0.1:5532/#game/CFB/401856743` in a browser window at least 1440px wide for an unscaled check.
3. Choose **Phone 390**, repeat all eight matchup links, and scroll the Game Center from header through the complete outlook and following section. Confirm no horizontal overflow within the phone frame, no overlapping names/badge, readable body text, and reachable close/back controls. Repeat the four priority games at **Phone 320** to check the narrowest prepared layout.
4. Verify the exact content checks below. Then use **Slate**, open a game card, close it, and reopen it. Confirm the card and Game Center show the same rating and explanation, and the layout remains stable after reopening. Watchlist changes, if exercised, should be reverted; do not enable notification permissions or send test alerts.
5. Save screenshots or record a dated pass/fail with browser/version and widths. A layout defect requires a fix and a rerun of affected checks before release. Automated test success alone is insufficient.

| Matchup / event | Rating | Content that must be visible |
|---|---:|---|
| Texas–Missouri / 401856743 | 82 | No. 10 / No. 19, matching 6-2 records, 2.5-point spread, reason this is worth circling |
| Ottawa–Buffalo / 401892644 | 57 | Atlantic Division opportunity, neither side has much market edge; no half-of-points wording |
| Detroit–Tampa Bay / 401892635 | 51 | Atlantic Division, Lightning clear favorites, Red Wings challenge; no unrelated recap or “Lightning has” |
| BYU–Utah / 401856849 | 80 | Top-10 matchup, Utah unbeaten, long-running rivalry, 5.5-point favorite; complete final sentence |
| Cincinnati–Atlanta / 401873038 | 56 | 3-point spread and 52.5 listed total; no invented offensive ranking |
| Philadelphia–Detroit / 401909922 | 65 | 7-1 and 6-1 records, 1.5-point spread |
| Wofford–Tennessee / 401906848 | 39 | Season opener, No. 8 Tennessee, 25.5-point favorite; no 0-0 unbeaten-season claim |
| SC State–Howard / 401867964 | 40 | Honest sparse-data outlook; no invented rivalry, playoff stakes or changed FCS rating |

Correction to the earlier preview checklist: current production already renders the full outlook in `renderDetailContent`, and CSS explicitly disables clamping. No “More” button is generated for this block. A legacy click handler remains in the source, but it is not an active control. Verify complete visible text, not expansion of a nonexistent button. If a “More” control appears here, hard-refresh and confirm you are on this candidate rather than an older cached build. No UI redesign was introduced in this task.

The [24-example editorial comparison](../pregame-editorial-20261103/examples.html) is also served at `http://127.0.0.1:5532/examples.html`. Reading that comparison is useful editorial QA but does not replace checking the application's actual Game Center layout.
