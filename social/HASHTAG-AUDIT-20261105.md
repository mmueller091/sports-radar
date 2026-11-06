# SlateMeter official team hashtag audit: November 5, 2026

This is a source-labeled **coverage audit**, not a claim that every team has
been independently verified. It compares all five social-bot sports against the site's
canonical ESPN ID lists. Counts are reproducible with:

```sh
node scripts/audit-social-hashtags.mjs
```

| Sport | Canonical teams | Eligible for automatic posts | Unverified candidates | No entry |
| --- | ---: | ---: | ---: | ---: |
| NFL | 32 | 15 | 17 | 0 |
| NBA | 30 | 16 | 14 | 0 |
| NHL | 32 | 32 | 0 | 0 |
| CFB | 761 | 8 | 60 | 693 |
| Men's college basketball | 362 | 13 | 5 | 344 |
| **Total** | **1,217** | **84** | **96** | **1,037** |

**NHL owner approval:** On November 5, the SlateMeter owner supplied all
32 NHL team hashtags. The eight NHL entries previously labeled
`seasonal-report` are now labeled `owner-approved`, making them eligible
without falsely representing a first-party verification. The 24 previously
first-party-confirmed entries keep their stronger provenance. Three teams
also have optional aliases: Sharks `#SJSharks`, Maple Leafs
`#PassionNeverSleeps`, and Jets `#NHLJets`. Automatic posts use only one
primary tag per team. Utah Mammoth retains `#TusksUp`, although the owner's
list used the former Utah Hockey Club name.

**Immediate corrections**

- Generic league hashtag: `#CBB` for men's college basketball and
  `#NCAAFB` for college football, per SlateMeter editorial preference.
- Confirmed Wake Forest basketball `#GoDeacs` and Vanderbilt basketball
  `#AnchorDown` using their official program sources.
- Added or confirmed: Arizona basketball `#BearDown`, Duke `#GoDuke`,
  Florida `#GoGators`, Illinois `#Illini`, Michigan State `#GoGreen`,
  Penn `#FightOnPenn`, Texas `#HookEm`, Texas Tech `#WreckEm`,
  and New York Rangers `#NYR`.
- The updated registry has **11 more confirmed team tags** than before.
  Secondary-directory candidates have **not** been silently promoted.

First-party evidence links for every new verified entry are stored in
`hashtags.json` under `sourceUrls`. These include athletic departments'
published game notes and official social posts embedded on their own sites.
The new `official-site` verification label distinguishes this evidence from
directly inspected X profiles (`official-bio` and `official-post`).

**Current basketball slate spot check:** The November 5 feed included
Wake Forest vs. Vanderbilt plus seven upcoming games. Ten of those sixteen
distinct teams now have verified primary tags. Jacksonville, Coastal Carolina,
Toledo, Gardner-Webb, Bethune-Cookman, and Cal Poly still lack verified tags;
their names and `#CBB` will appear without invented team hashtags.
All NHL teams now have a posting-eligible primary tag.

**Follow-up queue**

1. Verify official team accounts and primary hashtags for active/upcoming
   games first, then current FBS and Division I basketball teams.
2. Confirm remaining NFL and NBA team tags marked `candidate` against
   first-party posts, official team bios, or explicit owner approval.
3. Re-run the local coverage audit, optionally with `--feed saved-feed.json`,
   after each evidence batch. Do not automate scraping in the scoring Worker.
4. Preserve one claim per game at an 85-point crossing, the per-day rate limit,
   and the existing Buffer connection. Do not reset the posting ledger.

The registry is a separate, static, reviewed input. There is no additional
ESPN, AI, X, Buffer, or D1 request in the production scoring pipeline.
