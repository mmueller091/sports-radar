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
- `owner-approved`: the SlateMeter owner explicitly supplied and approved the
  hashtag for posting. This is an editorial approval, **not** a claim of
  independent first-party verification. `lastVerifiedAt` remains unset until
  official evidence is checked.
- `candidate`: a hashtag listed by a secondary directory or manually researched
  seed, but not corroborated on the official team profile.
- `seasonal-report`: an NHL season-specific hashtag reported by PuckBeat, but
  not corroborated on the official team profile.

Only `official-bio`, `official-post`, `official-site`, and `owner-approved` tags
enter the draft formatter. Missing or unapproved team tags are omitted, with a review warning. The generic league
tag is still included. No tag is guessed from a team's abbreviation.

Primary discovery sources:

- [Blinkfire NBA directory](https://www.blinkfire.com/publisher/leaguehashtags/nba)
- [Blinkfire college football directory](https://www.blinkfire.com/publisher/leaguehashtags/college_football)
- [Blinkfire men's basketball directory](https://www.blinkfire.com/publisher/leaguehashtags/mens_college_basketball)
- [PuckBeat 2026-27 NHL tags](https://puckbeat.com/story/nhl-teams-reveal-2026-27-social-media-hashtags)
- Official public X profile URLs stored with individual entries

The directories are incomplete and can be stale. This file is not a complete
list of every official team hashtag. It is an evidence-labeled starting point.
All 94 NFL, NBA, and NHL clubs have posting-ready primary tags, based on
first-party evidence or explicit SlateMeter owner approval. The owner-supplied
November 5 NFL and NBA lists supersede older discovery candidates. Earlier
primary tags can remain as research aliases, but automatic posts use only
one approved primary tag per team.
Alternate approved NHL tags
are retained as aliases, but automatic posts use one primary tag per team.
Utah is identified by its current name, Utah Mammoth, rather than its former
Utah Hockey Club name, while retaining the `#TusksUp` tag.
The Philadelphia 76ers use the owner's corrected `#ThrowTheBallUp` primary,
not `#Sixers` or the older `#HereTheyCome`.
Official X hashtag **emoji/brand hashflags** are seasonal and are not verified by
this registry; do not assume these hashtags display a team logo on X.

Generic college tags are `#NCAAFB` for football and `#CBB` for men's basketball.
The game links still use internal sport IDs `CFB` and `NCAAB`. Do not change
those identifiers to match social hashtags.

The owner approved one shared primary hashtag for each of the 16 SEC schools
on November 5, 2026. Each tag is keyed independently to its canonical ESPN
ID in both CFB and NCAAB, so those matchups use the same school hashtag with
their respective `#NCAAFB` or `#CBB` league tag. The selected primary tags
are `#RollTide`, `#WPS`, `#WarEagle`, `#GoGators`, `#GoDawgs`, `#BBN`,
`#GeauxTigers`, `#HailState`, `#MIZ`, `#BoomerSooner`, `#HottyToddy`,
`#Gamecocks`, `#GBO`, `#HookEm`, `#GigEm`, and `#AnchorDown`.
Sport-specific and superseded discovery tags remain research aliases only;
they are not included in bot posts. Owner approval does not imply independent
verification of every team's current official usage.

The owner likewise approved a shared primary hashtag for all 18 Big Ten
schools in both college sports: Illinois `#Illini`, Indiana `#GoIU`, Iowa
`#FightForIowa`, Maryland `#FearTheTurtle`, Michigan `#GoBlue`, Michigan
State `#GoGreen`, Minnesota `#SkiUMah`, Nebraska `#GBR`, Northwestern
`#GoCats`, Ohio State `#GoBucks`, Oregon `#GoDucks`, Penn State `#WeAre`,
Purdue `#BoilerUp`, Rutgers `#GoRU`, UCLA `#GoBruins`, USC `#FightOn`,
Washington `#GoHuskies`, and Wisconsin `#OnWisconsin`. These are also
owner-approved editorial selections. They do not change other conferences
or override sport-specific internal team IDs.

The owner's `batch1.xlsx` spreadsheet adds 107 more school primaries, retained
in `owner-college-hashtags-batch1-20261105.json`. All 107 are approved for men's
basketball and 104 for college football. Gonzaga, Grand Canyon, and Wichita
State are absent from the current football directory; their tags are applied
only to basketball. Appalachian State, Louisiana Monroe, and FIU are matched
to the canonical ESPN names App State, UL Monroe, and Florida International.
Each eligible college game uses the supplied primary for either team, plus
the sport-specific `#NCAAFB` or `#CBB` tag. These are owner-approved choices,
not independent claims of current official team hashtag verification.

To reapply the spreadsheet approvals after a registry refresh, run:

```sh
node scripts/approve-college-hashtags-batch1-20261105.mjs
```

Run the offline coverage audit to see posting-ready, candidate, and missing teams:

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
