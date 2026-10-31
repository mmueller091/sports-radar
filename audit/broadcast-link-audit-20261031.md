# Broadcast link audit — October 31, 2026

The five-provider registry omitted Disney+, leaving Florida–Georgia (`401856734`, `ABC · Disney+`) without an action. Arizona–Texas Tech (`401856842`, `ESPN · TV`) already resolved correctly. Both labels were confirmed in the public Worker feed before this change.

## Added services and official destinations

| Explicit broadcast service | Official HTTPS fallback / evidence |
| --- | --- |
| Disney+, Disney Plus, DisneyPlus, ESPN on Disney+ | [Disney+ sports](https://www.disneyplus.com/explore/sports); [provider sports guidance](https://help.disneyplus.com/article/disneyplus-en-us-live-sports?redirect=false) |
| HBO Max, HBOMax, Max | [HBO Max sports](https://www.hbomax.com/sports); [provider sports guidance](https://help.hbomax.com/US/Answer/Detail/000002560?link_clicked=schedule_lookup). Automated retrieval can return 403. |
| Netflix | [Netflix sports](https://www.netflix.com/tudum/topics/sports); [live-event guidance](https://help.netflix.com/en/node/129840) |
| YouTube TV, YouTubeTV, YTTV | [YouTube TV sports directory](https://tv.youtube.com/directory/sports) |
| Hulu, Hulu + Live TV | [Hulu live sports](https://www.hulu.com/live-sports) |
| FloSports | [FloSports](https://www.flosports.tv/); [browser/mobile support](https://www.flosports.tv/apps) |
| DAZN, DAZN (YES), DAZN CLE/IND/MEM/MIN/SAS | [DAZN](https://www.dazn.com/); [provider NBA guidance](https://www.dazn.com/en-ES/help/articles/30418357152669-nba-on-dazn). Region-specific labels remain visible; this does not promise availability outside the listed market. |
| NBA League Pass | [NBA League Pass](https://www.nba.com/league-pass/) |
| MW+, Mountain West Plus | [MW+](https://watch.themw.com/) |
| Midco Sports Plus | [Midco Sports Plus](https://midcosportsplus.com/); [official network](https://sports.midco.com/) |
| SWAC TV | [SWAC TV](https://tv.swac.org/), linked by the [conference announcement](https://swac.org/news/2025/7/16/general-swac-announces-creation-of-swac-tv-streaming-platform.aspx) |
| YouTube (separate from YouTube TV) | [YouTube sports](https://www.youtube.com/sports) |

The audit covered current production channel labels and broadcast/geoBroadcast metadata in repository JSON fixtures. It also found missed existing aliases `Prime Video (Local)`, `ESPN Unlmtd`, and `SEC Network +`, now recognized.

Regional/team products were also inventoried: Suns Live, ClipperVision, MavsTV, BlazerVision, Thunder App, Bucks App, Blues App, Pelicans.com, Spectrum Sports Net +, BN+, and Mammoth+. These remain informational pending verified product/territory mappings; no generic subscription service is substituted for them. NEC Front Row and regional network/station abbreviations likewise remain unchanged. Unknown names continue to display as supplied.

## Availability and security

ABC does not imply Disney+, NBC does not imply Peacock, CBS does not imply Paramount+, and TNT/TBS/truTV do not imply HBO Max. Networks also do not imply YouTube TV, Hulu, or League Pass. Existing ESPN-family labels continue linking to ESPN Watch. Multiple explicitly named services receive independent native anchors in the existing broadcast row and Game Center, with no card/CSS changes.

Direct destinations are accepted only from the game's event/broadcast metadata or revalidated serialized watch links, using exact official hosts and restricted content paths. URLs are never built from game IDs. Unsupported content paths use the verified sports fallback. New small/regional-service entries deliberately use fallback destinations until their playback formats are verified. Netflix's fallback is its sports guide, rather than a fabricated live catalog URL.

Validation rejects non-HTTPS URLs, credentials, nondefault ports, lookalike hosts, fragments, raw/encoded dot traversal, double encoding, backslashes, unknown query parameters, duplicate parameters, redirect parameters, and explicitly identified highlights/recaps/previews. Raw input is checked before URL normalization, which would otherwise erase encoded dot segments. Only ESPN `id`/`ex_cid` and YouTube `v` parameters are accepted. A serialized provider ID with an invalid URL cannot establish availability.

## Desktop and mobile

Links retain native HTTPS navigation, `target="_blank"`, `rel="noopener noreferrer"`, accessible labels, and existing pointer/click isolation. No popup API, custom scheme, user-agent branching, or app-install probe is introduced. Existing compact horizontal overflow and mobile card formatting are unchanged. Browser fallback is intentional; app handoff depends on the provider and OS.

Official app associations were retrieved for `play.hbomax.com` and `tv.youtube.com`. YouTube TV excludes `/directory/*` from Universal Links, so its sports directory is a browser fallback. Disney+ association retrieval failed certificate validation; no certificate check was bypassed. These checks do not establish physical iOS Safari or installed-app behavior.

Visual desktop/mobile QA was attempted. Computer Use stopped because it could not determine Chrome's current URL confidently enough to enforce policy. Consequently no visual browser pass, physical iOS Safari pass, sign-in, or subscription playback pass is claimed. Automated markup/navigation, serialization, cache, broadcast, and security regression tests cover the application behavior available here.

Publication updates the shared resolver in both the existing Pages shell and Worker bundle. No scoring, ratings, model versions, game inputs, database schemas, card layouts, or unrelated source files change.
