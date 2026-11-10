# Navigation fluidity verification

Status: implemented on a feature branch, not deployed. Full-suite release gates remain unresolved.

## Revisions and scope

- Baseline: `8fdefa9010c7004c23455df9fbcb755988c28f6d`, the current production `main` checked before implementation and again before handoff.
- Tested implementation: `96518f5eed318dc0339ca5588a8c8a925723fd01`.
- Branch: `feat/navigation-fluidity-20261109`.
- Runtime used for these checks: Node.js `v24.22.1`.
- Production files changed: `app.js`, `index.html`, `ui-overhaul.css`.
- Scoring, Workers, feed requests/polling cadence, D1, notifications, bot behavior, approved card layouts, logo assets and logo styles were not changed.

## Implemented behavior

1. Retain Slate DOM, filters, scroll and return context across navigation. Own browser history scroll restoration, restore team tabs before their scroll, and restore Game Center focus without scrolling the page.
2. Mount an initial 24-card prefix and append 16 near its end. Keep the complete feed available to sorting, filters, counts, search and game links. Retain expanded depth when returning or changing watch/favorite metadata. Browsers without IntersectionObserver render the full list.
3. Show the Game Center scoreboard and controls before expensive detail construction. Render hidden tab content on selection. Reuse a bounded, eight-game presentation cache while still making one fresh request and retaining chronology/model/staleness checks.
4. Use short navigation motion, scoped tab-entry animation and capture-phase sports-menu dismissal. Honor reduced motion and retain Escape/focus behavior.
5. Skip unchanged card/detail DOM work and patch changed content in place. Preserve logo runtime state, focused controls, disclosures and timeline selection. Defer structural card movement during an active gesture, not fresh scores. Routine polling does not flash a Connecting label.

## Complete regression results

Both runs used the same command and normal default concurrency after a successful site build:

```sh
node scripts/build-site.mjs
node --test test/*.test.js test/*.test.cjs test/*.test.mjs
```

| Source | Tests | Passed | Failed | Cancelled | Skipped | Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unchanged baseline | 1,780 | 1,776 | 4 | 0 | 0 | 33.36 s |
| Navigation implementation | 1,818 | 1,814 | 4 | 0 | 0 | 34.12 s |

The failure names are identical. All 38 added regression tests pass. No failing test was skipped, weakened or serialized to obtain these results.

Unresolved baseline failures:

- `test/league-standings.test.cjs:234`: game row has correct away/home marker, local date, exact ID and shared current score.
- `test/league-standings.test.cjs:248`: missing ratings remain unavailable, while a real numeric zero is preserved.
- `test/league-standings.test.cjs:257`: conference and poll rows share the same game resolver and exact navigation.
- `test/replay-input-comparison.test.js`: required historical Git object `1bf1c66703a097c97fcde55b4c7af13055c3c593` is unavailable.

The three Standings cases use upcoming fixtures dated `2026-11-10T01:00:00Z`. Their VM clock is fixed, but the imported resolver uses the host clock, so those fixtures are already in the past during this run. Their observed outputs are `No scheduled next game` or a missing next-game button. The unrelated tests and production resolver were left unchanged.

The historical test requires the exact checkpoint manifest and several source blobs from its frozen revision. `git cat-file -t` could not resolve the object, and `git fetch origin 1bf1c66703a097c97fcde55b4c7af13055c3c593` returned `upload-pack: not our ref`. Current files were not substituted for historical evidence.

Original full outputs were retained in the working environment:

- Baseline: `/workspace/scratch/3921eeee8aab/slatemeter-nav-baseline/navigation-baseline-built-tests.log`.
- Implementation: `/workspace/scratch/3921eeee8aab/slatemeter-navigation/navigation-full-tests.log`.

The first baseline attempt was made before its build prerequisites were ready. Its setup failures remain recorded separately in `slatemeter-nav-baseline/navigation-baseline-tests.log`; the table above reports the subsequent valid, built baseline rather than treating setup errors as application defects.

## Other checks and limitations

- Site build passed at the tested implementation revision.
- `node --check app.js` passed.
- `git -c core.whitespace=cr-at-eol diff 8fdefa9010c7004c23455df9fbcb755988c28f6d --check` passed. Existing CRLF in HTML/CSS was preserved.
- Focused checks cover full-feed search/counts/deep links beyond mounted cards, Back/Forward, cached team navigation, selected tab and scroll restoration, rapid game switching, late responses, hidden-tab rendering parity across all six enabled sports, canonical scores, existing PP/situation markers, logo glow/fallback/CORS state, and unchanged polling intervals.
- The 285-game fixture mounts 24 cards initially. An unchanged refresh parses zero card/divider templates; one changed game parses one card and retains its existing controls and logo nodes.
- Real-browser visual verification and real-device interaction timing remain pending. The available browser could not reach the execution environment's local preview. No claimed tap-to-paint or frame-rate measurement is based on the unit tests.
- Deployment remains blocked by the unresolved full-suite failures and pending browser QA. No main-branch update or deployment was performed.
