# SlateMeter social hashtag registry

This directory contains a research-backed, static lookup for team X hashtags and
a **draft-only** post formatter. It does not connect to X or Buffer, schedule a
post, send a notification, or alter production scoring.

## Scope and evidence

`hashtags.json` uses the same ESPN team IDs as `teams.json`. The covered sports
are NFL, NBA, NHL, CFB, and men's college basketball (stored as `NCAAB`, displayed
as NCAAM). It records each team name, candidate tags, official X handle when
identified, source URLs, verification category, and verification date.

- `official-bio`: a candidate hashtag appears in the description of the team's
  official X profile, with a matching account handle.
- `official-post`: a candidate hashtag appears among hashtag links rendered on
  the team's official X profile, with a matching handle. Treat it as a weaker
  confirmation than the bio and recheck before a fully automated rollout.
- `official-site`: the team or its governing league publishes the hashtag with
  the official team account on its own athletics website, current game notes,
  or an embedded post by that account. The original source URL is recorded.
- `candidate`: a hashtag listed by a secondary directory or manually researched
  seed, but not corroborated on the official team profile.
- `seasonal-report`: an NHL season-specific hashtag reported by PuckBeat, but
  not corroborated on the official team profile.

Only `official-bio`, `official-post`, and `official-site` tags enter the draft formatter. Missing
or unverified team tags are omitted, with a review warning. The generic league
tag is still included. No tag is guessed from a team's abbreviation.

Primary discovery sources:

- [Blinkfire NBA directory](https://www.blinkfire.com/publisher/leaguehashtags/nba)
- [Blinkfire college football directory](https://www.blinkfire.com/publisher/leaguehashtags/college_football)
- [Blinkfire men's basketball directory](https://www.blinkfire.com/publisher/leaguehashtags/mens_college_basketball)
- [PuckBeat 2026-27 NHL tags](https://puckbeat.com/story/nhl-teams-reveal-2026-27-social-media-hashtags)
- Official public X profile URLs stored with individual entries

The directories are incomplete and can be stale. This file is not a complete
list of every official team hashtag. It is an evidence-labeled starting point.
Official X hashtag **emoji/brand hashflags** are seasonal and are not verified by
this registry; do not assume these hashtags display a team logo on X.

Generic college tags are `#NCAAFB` for football and `#CBB` for men's basketball.
The game links still use internal sport IDs `CFB` and `NCAAB`. Do not change
those identifiers to match social hashtags.

Run the offline coverage audit to see verified, candidate, and missing teams:

```sh
node scripts/audit-social-hashtags.mjs
node scripts/audit-social-hashtags.mjs --json > /tmp/slatemeter-hashtags-audit.json
```

The audit reads only local canonical teams and the registry, without calling
ESPN, X, Buffer, Cloudflare, or AI APIs. Use an optional saved feed JSON file
with `--feed path/to/feed.json` to prioritize games currently live or upcoming.

## Refresh research data

From the repository root, on a machine permitted to fetch public web pages:

```sh
node scripts/build-social-hashtags.mjs --verify-x
node --test test/social-hashtags.test.mjs
```

The generator reads public directories and public team X profiles with bounded
concurrency. Review the diff before committing: the remote pages can change,
the generator does not authenticate, and some X profiles may be unavailable.
It starts with the existing reviewed registry, preserving first-party verified
entries and source links even if a discovery directory omits those teams.
**Never run the generator from the production Worker, cron, or bot posting path.**

## Use from a human-reviewed posting flow

```js
import {teamHashtag,gameHashtags,draftExcitementPost} from './social/hashtag-registry.mjs';

// The game is a normal SlateMeter feed game with canonical ESPN IDs at
// game.teams[0][8] and game.teams[1][8].
const draft=draftExcitementPost(game,{reason:'An existing verified game explanation.'});
if(draft.eligible){
  console.log(draft.text);
  console.log(draft.missingTeamHashtags);
}
```

For a snapshot downloaded from SlateMeter's existing `/feed` endpoint, you can
preview **live games at 85 or higher** without an X/Buffer account or additional
provider requests:

```sh
node scripts/preview-social-posts.mjs path/to/feed.json
```

Preview output is for review and copying, not direct publication. A production
posting bot still needs separate integration, user approval, deduplication of
threshold crossings, rate limits, and a safe disable switch.
