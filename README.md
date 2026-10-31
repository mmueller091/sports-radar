# Sports Radar

A static, mobile-friendly, installable sports radar: visitors start with no favorite teams selected. After someone chooses favorites, their game-day games are pinned; future favorite games are ranked by excitement with everything else. Scores are always shown. Soccer gets its own feed so the home page stays focused on NFL, MLB, NHL, College Football, NBA, NCAAM, and major tennis.

## Run locally

Run `npm ci --prefix alerts-worker`, then `node scripts/build-site.mjs`, and serve `dist/` with a static file server. The existing locked esbuild dependency bundles the shared scoring runtime; only allowlisted public assets enter `dist/`. Live scores and service-worker installation require HTTPS (GitHub Pages provides this automatically).

On a phone, open the deployed HTTPS URL in Safari or Chrome and use **Add to Home Screen** / **Install app**. The included manifest and service worker make the site open as a standalone app and keep the UI shell available when connectivity is briefly unavailable.

The Preferences dialog lets each visitor add or remove favorite teams and choose which sports appear on the home page. No teams are preset. Users can search a bundled team directory across NFL, MLB, NHL, College Football, NBA, NCAAM, and soccer, or enter a full team name if a team is missing. `teams.json` was generated from ESPN's public team listings and can be refreshed periodically as leagues change. Adding a favorite also enables its sport on the home page (soccer stays on its own page). The college-football row has a one-tap **FCS: On/Off** filter; FBS remains visible either way. Explicit favorite selections are saved separately in browser `localStorage`, so they persist on that device and browser but do not sync automatically to another device. Existing custom selections are retained; an untouched legacy list of the three old presets is cleared. Cross-device syncing would require a sign-in and a small hosted settings service.

Open a game and tap **Add to watchlist** to follow that individual matchup without favoriting either team. The **Watching** view shows saved games that are still in the current scoreboard feed, including older finals. The selection persists in this browser and can be removed in game details. When play-by-play provides a recent scoring event, the card calls out the named play and its game time; significant confirmed player milestones remain in the rating explanation. Game details include an excitement time-series chart that uses the ratings already captured by the Cloudflare Worker in 15-second live snapshot buckets when that history is available. Those points preserve the rating and model version that Sports Radar actually recorded at the time; scoring plays remain chart annotations rather than being used to invent the main curve. The newest browser observation can temporarily extend a live chart until the next Worker snapshot is persisted. Games without enough centralized history keep the existing scoring-play reconstruction as a legacy fallback, and insufficient data still produces a clear empty state. Worker snapshots are retained for about 30 days; browser-local observations are retained for up to eight days.

## Background excitement alerts

The settings dialog offers a per-device alert threshold from 50 to 99. When enabled, the browser registers a Web Push subscription. A Cloudflare Worker checks live scoreboards every minute, uses the shared rating model, and sends one alert when a game's score crosses that device's threshold. A first observation sets the baseline rather than sending a burst for already-exciting games. Use **Send test** to verify delivery. Timing is approximate: feeds, the scheduled job, and phone delivery can each be delayed. This service is separate from GitHub Pages; a static site alone cannot wake a closed iPhone.

**Settings → Notifications** includes a master switch, sport choices, a searchable directory of all available teams, favorite-team shortcuts, and the threshold. A game qualifies when its sport is enabled **or** one of its teams is selected. Team IDs are scoped by sport, and selected favorites can qualify with their general sport disabled. Preferences are saved locally and under the device's hashed subscription token in D1. The Worker checks them at both queue creation and delivery; turning the master off cancels pending work and unsubscribes the browser. Existing subscribers retain all-sport eligibility until they change their choices. Threshold crossings, first-observation baselines, and one-alert-per-game protection remain in force.

Game-specific pushes carry `sport`, `gameId`, `gameKey`, and a URL such as `https://mmueller091.github.io/sports-radar/#game/NFL/401123456`. The existing service worker closes the notification and focuses/navigates an existing Sports Radar window or opens one at that destination. Hash routes survive refresh and sharing without a GitHub Pages 404. The game API resolves current feed entries and stored game identities, including finals that have left the scoreboard; unknown or expired games show a retry/return fallback. Stored snapshots retain the existing approximately 30-day limit. The existing shared scorer remains authoritative.

**Settings → Install Sports Radar** contains separate Safari/iPhone and Chrome/Android steps, browser-button illustrations, installed-status detection, and the native install action where supported. Installation is requested only after a click. Home Screen iPhone support follows [Apple's installation guide](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iphea86e5236/ios); the native offer uses [Chrome's existing PWA installation event](https://web.dev/learn/pwa/installation-prompt).

For an existing deployment, apply only the additive `alerts-worker/migrations/0003_notification_preferences.sql` before deploying the updated Worker (`wrangler d1 execute sports-radar-alerts --remote --file alerts-worker/migrations/0003_notification_preferences.sql --config alerts-worker/wrangler.toml` from the repository root). It creates a separate preference table and preserves existing subscription and snapshot rows. Fresh installations use the updated `schema.sql`.

On iPhone, use Safari's **Share → Add to Home Screen**, open the icon, then enable alerts in Preferences. iOS 16.4 or later is required for Home Screen web push. No Apple developer license is needed. The threshold and permission are device/browser specific. Notification permission is requested only after tapping Enable. If `alert-config.js` has no Worker URL, the UI says background alerts are not connected.

To set up the Worker with a Cloudflare account:

1. From `alerts-worker/`, run `npm install`, then `npm run vapid`. Keep the private key out of GitHub.
2. Create a D1 database named `sports-radar-alerts` with `npx wrangler d1 create sports-radar-alerts`; put its database ID in `alerts-worker/wrangler.toml`.
3. Apply the schema with `npx wrangler d1 execute sports-radar-alerts --remote --file schema.sql` from `alerts-worker/`.
4. Set the private key with `npx wrangler secret put VAPID_SERVER_PRIVATE_KEY`. Set `VAPID_SERVER_PUBLIC_KEY` to the generated public key and `VAPID_SUBJECT` to an HTTPS site URL or `mailto:` contact using Worker secrets or `[vars]` (only the public key and subject are nonsecret).
5. Run `npx wrangler deploy`. Set `SPORTS_RADAR_ALERTS_URL` in `alert-config.js` to its HTTPS `workers.dev` URL, then publish the site files. Visit `/health` and `/config` on the Worker, enable alerts on the installed app, and use Send test.

The Worker validates push endpoints, stores a hashed browser token plus subscription keys in D1, and keeps the VAPID private key out of the public site. Cloudflare's free tier has CPU and subrequest limits; monitor usage and errors, especially with many subscribers or live games. The current job batches up to 10 outbound notifications per minute. ESPN data is an unofficial public feed and can delay or omit some games or odds, so alerts are best-effort rather than guaranteed.

## Deploy to GitHub Pages

1. Push the contents of this folder to a GitHub repository.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. The included workflow at `.github/workflows/deploy.yml` builds and publishes `dist/` on pushes to `main`.

The default live policy is `LIVE_CFB_COMPETITION_POLICY` (`live-owned-45-95-relevant-history-cfb-competition`), with model version `2026-10-31.football-pregame.1`. Live competition/trajectory and completed scoring remain unchanged; see `calibration/live-cfb-competition.md`. Upcoming NFL/CFB now use independent, continuously interpolated spread rewards and mismatch deductions, with record-competitiveness deduplication and source-grounded injury evidence; see [the pregame audit and comparisons](calibration/football-pregame-20261031.md). Missing odds add no assumed market evidence, and FCS classification adds no rating penalty. `scoring/live-runtime.cjs` supplies the shared browser/Worker graph; the browser accepts only its matching feed model. Recorded history keeps its original values/model; graph gaps indicate model changes, and reconstructed older points are labeled legacy. Live/final scoring retains the prior opening-context calculation so the new pregame mismatch deductions cannot suppress an unexpected upset.

## Live-data architecture

The UI connects directly to public ESPN scoreboard JSON endpoints for NFL, MLB, NHL, College Football, NBA, NCAAM, EPL, UEFA Champions League, and ATP tennis. For the NFL, it requests the current scoreboard week plus adjacent weeks, keeping all finals from the last completed slate and any newer finals, and upcoming games from the latest started slate and the following slate. On a Monday before kickoff, this includes Monday night and the next Thursday-through-Monday schedule. NBA and NHL are requested one calendar day at a time for yesterday, today, and the next seven days because their default scoreboards may return only the current day. Yesterday and today refresh each minute so late games crossing midnight remain current; future days are cached for 15 minutes. The Final tab retains older finals even though they remain hidden from All after game day. College Football requests ESPN's FBS (`groups=80`) and FCS (`groups=81`) groups separately with a larger result limit and removes duplicate crossover games. It refreshes every 60 seconds and has a manual refresh button. Because these endpoints are an unofficial public surface rather than a guaranteed developer product, the app falls back to demo data if a provider blocks a request or changes its response. The FCS switch hides games appearing in the FCS feed, including FBS–FCS crossovers. For a durable production feed, swap `LIVE_FEEDS` in `app.js` for an API-backed serverless adapter and keep API keys off the browser.

Viable sources to evaluate:

- ESPN scoreboard endpoints for NFL, college football, MLB, NHL, and soccer fixtures.
- MLB Stats API for official baseball game state and play-by-play.
- Sportradar or SportsDataIO when you need a supported commercial feed with stable quotas.
- A tennis partner feed for ATP/WTA tournament draws and point-level updates; free tennis coverage is more fragmented than the major American leagues.

## Excitement model

The displayed rating is an estimate on a 1–99 scale, not a provider-supplied excitement score. Each card gives a plain-English explanation, and the small **i** beside the slate title explains every score range. Before a game starts, the model uses a sport baseline plus confirmed stakes (for example postseason, championship, ranked teams, or rivalry). In the NFL, a division matchup is only a small boost; two winning records, similar winning percentages, an unbeaten team, and a close listed spread matter more. Two losing teams or a winless team lower the pregame expectation. For the 2026 Ravens–Bengals matchup, the card conditionally notes the possible Jackson–Burrow quarterback duel, without assuming either will start or adding points for unconfirmed availability. Two ranked college-football teams get a substantial pregame lift, with smaller additions for a top-10 team, two top-20 teams, winning records, or an unbeaten team. It never counts a pregame 0–0 as a close score. Once play starts, the pregame rating becomes context rather than the foundation: current margin, game progress, and leverage lead the rating. Verified live situations can then add urgency—a football red-zone or fourth-down possession, late close-game runners in scoring position, a hockey power play, or a close basketball game in its final minutes. Where a summary supplies scoring plays, the shared browser/alert model adds up to 20 points for verified lead changes, erased deficits, recent unanswered runs, and a game that stayed competitive for much of its duration. Older lead changes decay while recent swings matter more. NFL and NBA summaries may also provide a play-by-play win-chance estimate; a large swing adds context even without a score. Missing play-by-play or win-chance data adds no momentum points. A named player's six-inning no-hit bid, two-goal game, hat trick, or three-touchdown passing game can add a larger bonus when the box score confirms it. The live card shows period/clock, baseball inning/outs/base occupancy, football possession/down/spot, and hockey power play when the feed supplies enough information. Missing data is omitted rather than guessed. After the final, the rating is rebuilt around final margin and the full game's verified drama—sustained competitiveness, comebacks, lead changes, overtime, and the deciding sequence—so a merely close score is not automatically treated as a classic.

When a listed pregame line identifies a large underdog, the game gains a context-specific boost only if that team is tied late, leading well into the game, or wins outright. The card names the underdog and the spread or moneyline behind the boost. Missing odds never create an assumed upset.

The arrow shown only for live or completed games compares the current rating with that game's opening estimate. It is a change from the start, not a measured minute-by-minute time series. No trend appears for an upcoming game. A production scoring adapter could improve this model with:

- score closeness and lead changes;
- time remaining / late-game leverage;
- pace, possession, shots, or baserunner pressure depending on sport;
- standings, playoff, rivalry, and tournament context;
- unusual events such as overtime, extra innings, match points, or red-zone possessions.

On All, game-day favorites are pinned first, followed by live games, today's upcoming games, today's finals, and future upcoming games. Each group is sorted by excitement. The Upcoming tab is divided into ascending calendar dates, with games ranked by excitement within each date. The Final tab is divided into descending calendar dates (newest first), also ranked by excitement within each date. Its sticky date divider changes as the user scrolls. Completed games from earlier dates appear only on Final. Future favorite games are not pinned until game day. The preferences dialog controls which sports appear on the home page. Team records and college rankings are taken from the scoreboard feed when present. Spreads and totals are shown from ESPN scoreboard or game-summary data when available. ESPN's MLB and NHL listings sometimes provide a moneyline instead of a run/puck spread; the app labels that as a moneyline and never calls it a spread. For started games, a line without a verified closing marker is labeled as the last listed pregame line; this is not a guarantee of the exact market close. The browser also retains the latest line it saw before each game started, but only on that device and only if it was opened while the game was upcoming.

## Suggested normalized API shape

```js
{
  id, sport, state: 'live' | 'upcoming' | 'completed',
  startTime, status, teams: [{name, abbreviation, score}],
  context, venue, excitementScore, excitementLabel
}
```
