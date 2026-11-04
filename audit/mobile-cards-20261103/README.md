# Mobile card correction

Production baseline: `0f0eb90dc332e951afc3a20e3226f99e951a6cec`.

## Diagnosis and reference

The last explicitly approved mobile layout in history is `dd530e4` ("Integrate approved mobile cards and Game Center interactions"). Its Arial names and stacked rows are the typography/layout reference, not a wholesale rollback: it clipped long names, hid records, and used a large rating container. The historical application and CSS were rendered alongside the production baseline and candidate in [the 390px comparison](comparison-390.png).

`c35fb75` subsequently applied Barlow Condensed to team names. `e784420` removed the numeral outline and used condensed rating type. Compact mobile overrides reduced row heights, while `0f0eb90` restored records on the same wrapping line as names and added cream logo plates with a 2px outer halo. Combined with the floating VS and unwrappable footer, these produced the regression.

## Correction

- Card names return to Arial/Helvetica at 15px with natural proportions and spacing. This follows the approved reference, uses familiar text typography, and adds no font download. Records are separate, muted 11px lines. Full names wrap at every phone width.
- Authentic 26px artwork remains in existing team buttons. A fine cream contour follows the artwork, replacing the large solid cream tile. Missing-logo fallbacks remain functional.
- The rating uses the unchanged continuous heatmap with outlined, natural-width numerals. The enclosing border and fill are removed. No qualitative labels are added; existing movement indicators remain.
- Cards hide the redundant VS. Status, sport and clocks remain visible; halftime is stated once, with its existing priority explanation retained in the title.
- Streaming provider links retain their URLs, external-link icons, accessible labels and native behavior. Compact odds retain all values and distinguish current, closing and unverified pregame lines; the complete original text remains in the title. Stats aligns with the broadcast row. Supporting text wraps.
- The 320px page fits even when a desktop scrollbar consumes part of the viewport. Last Score remains hidden on phones.

Changes are confined to card presentation in `app.js` and a scoped card section in `mobile-readability.css`, plus tests and this local-only review harness. Game Center explanations/timelines, scoring, histories, alerts, data processing, backend services and API behavior are untouched. The separate underdog-calibration branch is excluded.

## Verification

Actual Chrome screenshots were captured through native computer-use controls and inspected, not merely generated. Each review iframe is a real CSS viewport. All 54 card renders across **320, 375, 390, 430, 768 and 1280px** passed the recorded overflow/record checks; later geometry reports also check name/record/score/rating overlaps. Manual review covered typography, wrapping, logo recognition, header/footer hierarchy and heatmap differentiation.

Nine explicitly labeled presentation simulations cover NHL, NBA, NFL, CFB, NCAAM and MLB; pregame/live/halftime/intermission/overtime/final; long and short names; long records; missing, dark, light and multicolored logos; ratings 8–99; multiple broadcasts and betting values. They use the frozen provider fixture as a starting point and canonical team artwork. They are not real-game or scoring evidence and are never included in the public build.

Screenshots:

- [Historical / broken / corrected at 390px](comparison-390.png)
- Phones: [pregame/live/halftime](phones-0.png), [long names and records](phones-1.png), [320px footer](phones-1-footer.png), [logos and rating range](phones-2.png)
- 390px and tablet: [group 0](tablet-0.png), [group 1](tablet-1.png), [group 2](tablet-2.png)
- Desktop: [group 0](desktop-0.png), [group 1](desktop-1.png), [group 2](desktop-2.png)
- [Complete mobile application with live feed](live-mobile.png)

The complete mobile app also opened Game Center and toggled the watchlist successfully; the temporary local pin was removed. Team-logo navigation was checked separately. Automated tests cover card/score/clock/Stats navigation, touch scrolling and single activation, streaming links, records and missing-logo fallback.

**85/85 focused tests passed**, covering card footer, UI corrections, navigation, watch links, rating presentation, scoreboard display, team broadcasts, mobile reference, scoring module parity, release cache and release integration. `node test-score.js` passed scoring, watchlist and timeline fixtures. Build and `git diff --check` passed. Esbuild required normal host filesystem access on Windows; the release checks passed with that access.

The generated scoring runtime is byte-identical to production: SHA-256 `e785de3e46ddea0279451fdc18d65cbe87ffdd08a7c1932cbd36f5703286b3f0` for both baseline and candidate. No full backend suite was needed for this presentation-only change.

## Reproduction

Build with `node scripts/build-site.mjs`. Save an unchanged baseline build under `work/card-review/before` for comparisons, then run `node scripts/review-mobile-cards.mjs`. Open `http://127.0.0.1:4173/gallery?widths=320,375,430&group=0` and groups 1/2; repeat for widths 390,768 and 1280. The harness writes layout reports to this directory. `/live` renders the complete 390px app with a read-only proxy to public provider responses, avoiding production's intentional localhost CORS restriction. It does not publish fixtures or alter production data.

Deployment uses the existing GitHub Pages workflow from `main`; no Worker deployment is part of this release.
