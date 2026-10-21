# Sports Radar

A static, mobile-friendly, installable sports radar: favorite-team games are pinned when live, completed, or scheduled for today; future favorite games are ranked by excitement with everything else. Scores are always shown. Soccer gets its own feed so the home page stays focused on NFL, MLB, NHL, College Football, NBA, NCAAM, and major tennis.

## Run locally

Open `index.html` directly for the demo shell, or serve the folder with any static file server. Live scores and service-worker installation require HTTPS (GitHub Pages provides this automatically). No build step or runtime dependency is required.

On a phone, open the deployed HTTPS URL in Safari or Chrome and use **Add to Home Screen** / **Install app**. The included manifest and service worker make the site open as a standalone app and keep the UI shell available when connectivity is briefly unavailable.

The Preferences dialog lets each visitor remove or add favorite teams and choose which sports appear on the home page. Ravens, Orioles, and Capitals are the initial favorites; users can search a bundled team directory across NFL, MLB, NHL, College Football, NBA, NCAAM, and soccer, or enter a full team name if a team is missing. `teams.json` was generated from ESPN's public team listings and can be refreshed periodically as leagues change. Adding a favorite also enables its sport on the home page (soccer stays on its own page). The college-football row has a one-tap **FCS: On/Off** filter; FBS remains visible either way. These choices are saved with browser `localStorage`, so they persist on that device and browser but do not sync automatically to another device. Cross-device syncing would require a sign-in and a small hosted settings service.

## Deploy to GitHub Pages

1. Push the contents of this folder to a GitHub repository.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. The included workflow at `.github/workflows/deploy.yml` publishes the folder on pushes to `main`.

## Live-data architecture

The UI connects directly to public ESPN scoreboard JSON endpoints for NFL, MLB, NHL, College Football, NBA, NCAAM, EPL, UEFA Champions League, and ATP tennis. For the NFL, it requests the current scoreboard week plus adjacent weeks, keeping all finals from the last completed slate and any newer finals, and upcoming games from the latest started slate and the following slate. On a Monday before kickoff, this includes Monday night and the next Thursday-through-Monday schedule. The Final tab retains older finals even though they remain hidden from All after game day. College Football requests ESPN's FBS (`groups=80`) and FCS (`groups=81`) groups separately with a larger result limit and removes duplicate crossover games. It refreshes every 60 seconds and has a manual refresh button. Because these endpoints are an unofficial public surface rather than a guaranteed developer product, the app falls back to demo data if a provider blocks a request or changes its response. The FCS switch hides games appearing in the FCS feed, including FBS–FCS crossovers. For a durable production feed, swap `LIVE_FEEDS` in `app.js` for an API-backed serverless adapter and keep API keys off the browser.

Viable sources to evaluate:

- ESPN scoreboard endpoints for NFL, college football, MLB, NHL, and soccer fixtures.
- MLB Stats API for official baseball game state and play-by-play.
- Sportradar or SportsDataIO when you need a supported commercial feed with stable quotas.
- A tennis partner feed for ATP/WTA tournament draws and point-level updates; free tennis coverage is more fragmented than the major American leagues.

## Excitement model

The displayed rating is an estimate on a 1–99 scale, not a provider-supplied excitement score. Each card gives a plain-English explanation. Before a game starts, the model uses a sport baseline plus confirmed stakes (for example postseason, championship, ranked teams, or rivalry). NFL games gain points for divisional opponents, both teams having winning records, and a close listed spread; the NFL explanation never refers to college rankings. For the 2026 Ravens–Bengals matchup, the card conditionally notes the possible Jackson–Burrow quarterback duel, without assuming either will start or adding points for unconfirmed availability. Two ranked college-football teams get a substantial pregame lift, with smaller additions for a top-10 team, two top-20 teams, winning records, or an unbeaten team. It never counts a pregame 0–0 as a close score. During play it adds closeness and game progress, plus verified live situations: a football red-zone or fourth-down possession, late close-game runners in scoring position, or a hockey power play. A named player's six-inning no-hit bid, two-goal game, hat trick, or three-touchdown passing game can add a larger bonus when the box score confirms it. The live card shows period/clock, baseball inning/outs/base occupancy, football possession/down/spot, and hockey power play when the feed supplies enough information. Missing data is omitted rather than guessed. After the final the model accounts for the final margin and, when available, decisive scoring plays and lead changes. A World Series opener therefore receives its championship and series-opener points before play, while an unranked regular-season college football game does not.

The arrow shown only for live or completed games compares the current rating with that game's opening estimate. It is a change from the start, not a measured minute-by-minute time series. No trend appears for an upcoming game. A production scoring adapter could improve this model with:

- score closeness and lead changes;
- time remaining / late-game leverage;
- pace, possession, shots, or baserunner pressure depending on sport;
- standings, playoff, rivalry, and tournament context;
- unusual events such as overtime, extra innings, match points, or red-zone possessions.

On All, game-day favorites are pinned first, followed by live games, today's upcoming games, today's finals, and future upcoming games. Each group is sorted by excitement. Completed games from earlier dates appear only on Final. Future favorite games are not pinned until game day. The preferences dialog controls which sports appear on the home page. Team records and college rankings are taken from the scoreboard feed when present. Spreads and totals are shown from ESPN scoreboard or game-summary data when available. ESPN's MLB and NHL listings sometimes provide a moneyline instead of a run/puck spread; the app labels that as a moneyline and never calls it a spread. For started games, a line without a verified closing marker is labeled as the last listed pregame line; this is not a guarantee of the exact market close. The browser also retains the latest line it saw before each game started, but only on that device and only if it was opened while the game was upcoming.

## Suggested normalized API shape

```js
{
  id, sport, state: 'live' | 'upcoming' | 'completed',
  startTime, status, teams: [{name, abbreviation, score}],
  context, venue, excitementScore, excitementLabel
}
```
