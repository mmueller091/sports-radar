# SlateMeter UI and logo review — 2026-11-03–04

This review compares the isolated UI branch with production source `5b7f797c879d36826d08b2ea31a6fecd18ef092c`. The original workspace and its unrelated changes were preserved. The screenshots below are real Chrome captures of local, explicitly labeled UI fixtures; they are not observations of live scores.

**Status: local visual acceptance passed for the coverage below, and the final local build passed. Publication is authorized but has not occurred from this branch.** The interrupted browser review was resumed, and the final dark/light focus states, lower logo rows, Game Center records/PP, desktop and mobile secondary surfaces, filters and actual reduced-motion checks were completed.

The exact release evidence allowlist is [release-evidence.txt](release-evidence.txt). [Release source hashes](release-source-hashes.json) record the reviewed final assets and the source fingerprints retained in individual measurements. This is representative visual acceptance with the explicit coverage limits below, not a claim that every catalog logo was individually inspected.

## Current visual evidence

| Area | Reviewed artifacts | Coverage |
| --- | --- | --- |
| Desktop slate | [1024px](after-final-1024-slate.png), [1440px](after-final-1440-slate.png) | Two columns, clocks, ratings, records, possession, PP and footer separation. |
| Mobile slate | [Set 0](after-final-phones-set0.png), [set 1](after-final-phones-set1.png), [set 2](after-final-phones-set2.png) | Exact iframe widths 430, 390, 375 and 320 CSS px. Fixtures include six leagues, long names, ranks, pregame/live/intermission/halftime/final, rising/falling/steady and provisional ratings. A window capture shows only the visible portion of each scrollable frame; JSON layout checks also include the offscreen cards. |
| Completed and upcoming filters | [Completed NHL overtime](after-final-320-completed-filter.png), [long college matchup](after-final-320-upcoming-filter.png) | Native 320px filter interaction; readable logos, records and long names in the previously offscreen states. |
| Dark NFL/MLB marks | [Set 0 comparison](logos-final-before-after-320-set0.png), [lower rows](logos-final-before-after-320-set0-lower.png) | Authentic artwork at measured 20, 28, 32 and 48 CSS px on charcoal, including the Yankees' thin navy lettering and Red Sox red mark. |
| NHL/NBA marks | [Set 1 comparison](logos-final-before-after-320-set1.png), [lower rows](logos-final-before-after-320-set1-lower.png) | Visibly verifies dark navy Lightning, black/silver Kings, detailed Red Wings, Nets, Spurs and multicolored Heat. These paths were recaptured and inspected after the earlier invalid DevTools captures. |
| College marks | [Set 2 comparison](logos-final-before-after-320-set2.png), [lower rows](logos-final-before-after-320-set2-lower.png) | South Carolina, Penn State, Purdue, Wofford, Texas A&M–Corpus Christi and Stanford. Purdue's actual artwork has gold fill and a black outline; Wofford and the Sox SVG provide stronger black-region examples. |
| White and SVG | [White PNG / official SVG comparison](logos-final-before-after-320-white-svg.png) | The provider's genuine all-white Lightning alternate stays untreated. MLB's official transparent White Sox SVG receives the same artwork-aware analysis as PNG. Both are QA-only references, not production asset substitutions. |
| Interactive states | [20px dark Ravens](logos-final-interactive-dark-320.png), [20px light Spurs](logos-final-interactive-light-320.png) | Native focus/hover on the actual interactive surface, with a fine treatment retained and no oversized tile. Reports record focused size 20px, both `#191C1F` and `#292D30` surfaces, and zero errors. |
| Game Center | [Matchup and rating](after-final-320-game-center.png), [team stats](after-final-320-game-center-stats.png), [plays](after-final-320-game-center-plays.png) | 320px dark/red logos, records, PP, scores, rating and real tab interaction. |
| Secondary surfaces | [Search](after-final-320-search.png), [team page](after-final-320-team.png), [preferences](after-final-320-preferences.png) | 320px logo consistency and secondary navigation/settings presentation. |
| Desktop secondary surfaces | [Search](after-final-1440-search.png), [team page](after-final-1440-team.png), [Game Center](after-final-1440-game-center.png) | 1440px presentation. The final search capture and report follow the paired-logo column correction. |
| Reduced motion | [Slate measurement](after-final-320-reduced-motion-measurement.png), [Game Center measurement](after-final-320-detail-reduced-motion-measurement.png), [tab interaction](after-final-320-reduced-motion-tab.png) | Actual `prefers-reduced-motion: reduce` with DevTools kept open; measured styles and native tab interaction. |

The logo manifest contains 18 catalog assets plus two explicitly marked authentic alternate-format references. Each sample retains its source, colors, proportions and transparency. No generated or recolored replacement assets were used. Light artwork remains untreated; weak dark boundaries receive a fine cream contour; intermediate artwork receives a restrained soft edge. The final contour uses half-pixel, zero-blur cardinal shadows rather than an opaque tile or broad glow.

## Measurements and remaining limits

The `qa-after-*.json` files record image load state, rendered dimensions, treatment, clipping, page overflow, footer/content overlap, PP placement and record visibility/type size. Newer reports also record source SHA-256 hashes, capture time, Game Center record/PP bounds, native focus, search-row logo/copy/rating separation and the browser's actual reduced-motion preference. `qa-history/` retains later measurements without overwriting earlier evidence; only selected relevant history files are included in the release allowlist. Earlier reports lacking a field did not execute that check. New reports with a `surface` field restrict logo counts to the active dialog, overlay or team page; older modal counts also included the obscured underlying slate. Rendered-element counts include offscreen content within the same scrollable surface and do not certify visual readability.

All four mobile widths and both desktop widths have card reports with zero page overflow, clipped fields, detected card overlaps and card-record failures. Logo comparisons have exact 20/28/32/48px dimensions and zero size mismatches. These are geometric checks, not a substitute for the screenshots that were captured and inspected.

The refreshed 320px Game Center report is scoped to the active overlay: both authentic logos loaded, both records are visible at 11px, and the PP badge is within its team's area without overlapping the name, record or score. The report has zero browser errors, detected overlaps and record failures.

Both final search reports measure six result rows and 12 loaded logos with zero logo/copy/rating overlap, clipping, page overflow or browser errors. The 1440px report was captured at `2026-11-04T05:18:40.820Z`, and the 320px report at `2026-11-04T05:18:13.688Z`; both contain the final `ui-overhaul.css` hash `721fcb6cc6bf8ea7b1255b2bc325396c4cac9df629a6e2c133382e6e5eb24e6c`. Earlier accepted captures predate the final search-only column correction and, for the card contact sheets, the later Game Center-specific record correction. The affected search and Game Center surfaces were rechecked after their respective fixes. No missing historical fingerprint has been inferred or filled in retroactively.

Coverage is representative, not a screenshot census of every team in the catalog. All shared logo-rendering surfaces use the common system, but an unreviewed asset can still merit a targeted follow-up. Tests cover missing canvas access and CORS retry behavior; the live provider's CDN was confirmed to permit anonymous canvas inspection. Original artwork is retained when inspection is unavailable.

Reduced motion was exercised with Chrome's actual CSS media emulation while DevTools remained open. The preserved [raw slate measurement](qa-reduced-motion-measured.json) records `actualPreference: true` and tests the score/rating-update classes on 20 elements: all animation names are `none`, all animation durations are `0s`, and transitions are either zero or the legacy one-microsecond sentinel. The initial exact-zero checker flagged 12 such sentinel transitions. The [explicit acceptance review](qa-reduced-motion-acceptance.json) preserves those raw flags and treats durations no longer than 0.01ms as effectively zero; no perceptible-motion failures remain. The [Game Center measurement](qa-reduced-motion-detail.json) separately checks five elements with actual reduction enabled and has zero raw failures; native tab switching was also captured. Older `reducedMotion: false` reports are not reduced-motion tests.

Screenshots use desktop Chrome with exact-width frames, not physical iOS/Android hardware, touch emulation, installed-PWA launch or notification permission changes. Streaming destinations and production score polling were not exercised by these offline fixtures.

## Regression results

| Check | Result | Evidence |
| --- | --- | --- |
| Full root suite | 1564 passed; 1 baseline failure | [Full run](tests-root.log) |
| Baseline failure reproduction | Same historical replay failure on unchanged baseline | [Baseline run](baseline-replay.log) |
| Worker suite | 285 passed, 0 failed | [Worker tests](qa-worker-tests.log) |
| Focused UI and logo tests, final rerun | 23 passed, 0 failed | [Final sanity run](tests-final-sanity.log) |
| Provenance/build-related rerun | 30 passed, 0 failed | [Rerun](tests-provenance.log) |
| Legacy score/watchlist/timeline fixtures | Passed | [Legacy checks](tests-legacy.log) |

The root-suite failure comes from the historical replay comparison trying to read `calibration/trajectory-current-checkpoint-manifest.json` from an old hardcoded commit where the file does not exist. It was reproduced on the untouched baseline. No scoring fix was introduced to conceal it. Earlier focused runs encountered sandbox path-access errors in esbuild; the successful provenance rerun supersedes those environment failures.

The final local build succeeded after source line-ending normalization. Both baseline and revised `scoring-runtime.js` have SHA-256 `aa5ee805be4401866607f0c25a1f98ebf756f1fc04a19e5097b71cadb1a09622`. [Protected-file verification](protected-hashes.json) confirms that all 151 checked scoring, Worker/provider, live-audit, notification, watch-link, Game Center and calibration source files retain their canonical contents; raw hashes distinguish existing Windows line-ending differences. The [baseline failure analysis](baseline-failure.md) explains this verification and the unrelated historical test failure. Protected paths are excluded from the release staging allowlist. No backend deployment is part of this UI change.

## Superseded evidence

- `after-1024-slate.png` exposed the old footer/grid specificity conflict. Use `after-final-1024-slate.png` after the correction.
- `logos-before-after-320-set0.png` and `logos-before-after-320-set1.png` mislabeled the wall sizes because legacy CSS forced all samples to the same size. Keep them as investigation evidence only; use the `logos-final-*` captures and dimension reports.
- `logos-final-before-after-320-set1.png` and `logos-final-before-after-320-set1-lower.png` temporarily contained invalid DevTools screenshots. They were recaptured on November 4 at approximately 00:13 Eastern and inspected again; their current contents are valid comparisons covering the NHL and lower NBA rows. `logos-refined-before-after-320-set1.png` remains an earlier valid NHL comparison.
- `after-320-slate.png`, `after-390-slate.png` and `after-phones-set*.png` are interim captures. Prefer `after-final-*` for acceptance.
- `after-390-slate-first-pass.png` is an empty file from an unsuccessful capture and is not visual evidence.
- An earlier logo-wall click bubbled into production game-navigation handlers after the test wall had replaced their DOM, producing a null-element error. The wall now preserves the original application DOM hidden underneath and stops its test-button clicks from reaching game-navigation handlers while retaining native focus, hover and measurement. `logos-interactive-dark-320.png` is an interim investigation artifact. The new `logos-final-interactive-dark-320.png`, its light-logo counterpart and refreshed reports supersede it: both report a focused 20px sample and zero errors.
- Files named `after-final-320-game-center-reduced-motion.png` and `after-final-320-reduced-motion-stats.png` were taken after DevTools closed; their corresponding report says `reducedMotion: false`. They are normal-motion visual captures despite their filenames and must not be used as evidence of reduced-motion behavior.
- The initial 1440px search inspection exposed a 42px column containing 60px of paired logos. The final 60px desktop / 30px mobile column rules, refreshed captures and explicit search-row measurements supersede that earlier layout. Only the corrected `after-final-1440-search.png` and `after-final-320-search.png` are selected for release.

## Files and publication scope

Production presentation changes: `app.js`, `index.html`, `styles.css`, `mobile-readability.css`, new `ui-overhaul.css`, new `team-logos.js`, new `team-logos.css`, `scripts/build-site.mjs` and `sw.js` asset entries. Changes to the build/service-worker files include the new frontend assets; scoring and notification behavior remain unchanged.

Regression support: `test/ui-overhaul.test.js`, `test/team-logos.test.cjs`, `test/fixtures/ui-overhaul-cases.json`, `test/helpers/slate-dom.mjs`, `test/card-footer.test.js`, `test/card-navigation.test.js`, `test/cfb-filters.test.js`, `test/detail-comparison.test.js`, `test/game-links.test.js`, `test/helpers/overtime-terminology.mjs`, `test/home-sports-settings.test.js`, `test/mobile-reference.test.js`, `test/nhl-advanced.test.js`, `test/pregame-quality.test.js`, `test/rating-presentation.test.js`, `test/startup-feed.test.js`, and local-only `scripts/ui-overhaul-preview.mjs` plus this audit directory.

The QA server serves only loopback, stubs backend requests, disables service-worker registration, and injects fixture behavior into its test responses. That bootstrap, the fixture controls and the measurements are not production assets. Publication must use the established GitHub Pages frontend build; no Sites migration or scoring Worker deployment is required.
