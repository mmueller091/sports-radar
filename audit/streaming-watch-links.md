# Streaming watch actions — October 31, 2026

Sports Radar retains the provider's broadcast text and adds `Watch on [Provider]` with the same external-link SVG on Radar cards and in Game Center. Supported labels resolve to Peacock, ESPN/ESPN+, Paramount+, Prime Video and Apple TV. Unknown labels remain plain broadcast information. NBC/CBS/FOX labels do not imply an unlisted streaming subscription.

The browser uses native HTTPS anchors, `target="_blank"`, and `rel="noopener noreferrer"`. There are no custom schemes, Android intents, app-install probes, timers or automatic redirect chains. The OS/provider decides whether an installed app handles an eligible URL; otherwise the provider website handles it. Sign-in, subscriptions and regional rights remain the provider's responsibility.

## Destination verification

Read-only checks and provider association responses are retained in [the verification receipt](streaming-provider-verification.json). These are association/website checks, **not physical device tests**.

| Provider | Official fallback | Verification and mobile limits |
| --- | --- | --- |
| Peacock | https://www.peacocktv.com/watch/sports | HTTPS 200; production iOS association registers `/watch/*`; Android association delegates to `com.peacocktv.peacockandroid`. The marketing `/sports` page is outside those iOS paths, so the watch destination is used. |
| ESPN / ESPN+ | https://www.espn.com/watch/ | Official watch page returns HTTPS 200. Android delegates to `com.espn.score_center`. The retrieved production iOS association does **not** register the general `/watch/` hub, so browser fallback is expected there; app handoff is not promised. |
| Paramount+ | https://www.paramountplus.com/browse/sports/ | Official [sports catalog](https://www.paramountplus.com/browse/sports/) verified through web retrieval. Direct automated requests may return 406. Android delegates to `com.cbs.app`. Apple's cached US association registers selected show/video/live-TV paths; the general sports hub is not a verified US iOS Universal Link. |
| Prime Video | https://www.primevideo.com/sports | Official [live sports hub](https://www.primevideo.com/sports) verified through web retrieval and an initial HTTPS 200; subsequent automated requests intermittently returned 503. Its production iOS association registers `/detail/*`, `/dp/*` and other playback paths, but not `/sports`. The hub provides browser fallback. |
| Apple TV | https://tv.apple.com/sports | Official [Apple instructions](https://support.apple.com/en-am/118593) name this sports destination. HTTPS request succeeds and may redirect to a regional sports channel. Retrieved Android associations list TV apps; phone app handoff and iOS association could not be independently verified. |

## Direct games and data boundaries

Only URLs actually supplied in event links marked watch/stream/live/video or broadcast metadata are considered. No event IDs are translated into invented playback URLs. The URL must use HTTPS, a provider's exact allowlisted hostname and a playback/content path. Credentials, alternate ports, redirect parameters, encoded path tricks, unrelated articles/highlights and lookalike hosts are rejected. Rejected or missing URLs use the official sports fallback.

Normalization/enrichment retains only validated direct destinations as enumerable `watchLinks` so they survive the canonical Worker feed and stored JSON. Game Center can also resolve a link from its fetched summary. Existing cached games without this field still get the sports fallback. Broadcast text, scoring inputs, ratings, model version, watchlists, favorites and historical scoring records are not changed.

Card watch anchors are siblings of the existing Game Center navigation button. Pointerdown, pointerup and click delegation leave the link's native behavior intact and do not open Game Center. Native keyboard activation, browser context menus and external navigation remain available. The links have a 44px minimum height and span the mobile card grid.

## Test scope and outstanding device checks

Automated coverage includes every supported provider, fallback and direct selection, mixed/duplicate labels, unknown labels, malformed and unsafe URLs, Worker serialization/enrichment, native-link markup, touch/click isolation, existing game/team navigation, live detail refresh, service-worker dependency upgrade, and archived scoring parity.

Release validation: all 622 repository/Worker tests passed, as did the site build, Worker dry run and whitespace check. The Windows publication checkout used exact tracked bytes for frozen audit fixtures. The existing local historical checkpoint `1bf1c66703a097c97fcde55b4c7af13055c3c593` was fetched locally for the provenance test; it is not added to the publication branch.

Responsive browser QA was attempted through native Chrome and Edge. Computer Use ended because it could not determine the browser URL with enough confidence to enforce policy. No visual/responsive browser pass is claimed. No connected iOS or Android devices or installed provider apps were available.

Manual follow-up matrix (pending): iOS Safari and installed Sports Radar; Android Chrome and installed Sports Radar; provider installed with supported links enabled; provider absent or links disabled; both a real provider-supplied game destination and its fallback sports hub. Confirm OS handoff where supported, provider browser/sign-in fallback otherwise, return to Sports Radar, and unchanged card/Game Center/team/watchlist navigation. Website association checks cannot substitute for these device tests.

Publication uses the existing GitHub Pages workflow and the existing Cloudflare Worker configuration. No new hosting service or database migration is introduced.
