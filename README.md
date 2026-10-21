# Sports Radar

A static, mobile-friendly, installable sports radar: favorite teams stay pinned first, then games are ordered by a sport-aware excitement score. Soccer gets its own feed so the home page stays focused on NFL, MLB, NHL, college football, and major tennis.

## Run locally

Open `index.html` directly for the demo shell, or serve the folder with any static file server. Live scores and service-worker installation require HTTPS (GitHub Pages provides this automatically). No build step or runtime dependency is required.

On a phone, open the deployed HTTPS URL in Safari or Chrome and use **Add to Home Screen** / **Install app**. The included manifest and service worker make the site open as a standalone app and keep the UI shell available when connectivity is briefly unavailable.

## Deploy to GitHub Pages

1. Push the contents of this folder to a GitHub repository.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. The included workflow at `.github/workflows/deploy.yml` publishes the folder on pushes to `main`.

## Live-data architecture

The UI connects directly to public ESPN scoreboard JSON endpoints for NFL, MLB, NHL, college football, EPL, UEFA Champions League, and ATP tennis. It refreshes every 60 seconds and has a manual refresh button. Because these endpoints are an unofficial public surface rather than a guaranteed developer product, the app falls back to demo data if a provider blocks a request or changes its response. For a durable production feed, swap `LIVE_FEEDS` in `app.js` for an API-backed serverless adapter and keep API keys off the browser.

Viable sources to evaluate:

- ESPN scoreboard endpoints for NFL, college football, MLB, NHL, and soccer fixtures.
- MLB Stats API for official baseball game state and play-by-play.
- Sportradar or SportsDataIO when you need a supported commercial feed with stable quotas.
- A tennis partner feed for ATP/WTA tournament draws and point-level updates; free tennis coverage is more fragmented than the major American leagues.

## Excitement model

`score` is a normalized 0–100 value. A production scoring adapter should calculate it per sport from:

- score closeness and lead changes;
- time remaining / late-game leverage;
- pace, possession, shots, or baserunner pressure depending on sport;
- standings, playoff, rivalry, and tournament context;
- unusual events such as overtime, extra innings, match points, or red-zone possessions.

Favorite teams are sorted before the score, as required by the product brief. The preferences dialog exposes the first tuning controls for the future model. Spoiler-aware mode hides scores and replaces the numeric excitement score with a neutral signal state.

## Suggested normalized API shape

```js
{
  id, sport, state: 'live' | 'upcoming' | 'completed',
  startTime, status, teams: [{name, abbreviation, score}],
  context, venue, excitementScore, excitementLabel
}
```
