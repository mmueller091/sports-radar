# Team-season leaders captures

Captured from ESPN on 2026-10-29 using the exact URLs in each JSON file.
These are reduced production responses, not hand-authored leader payloads.
Unconsumed identity metadata, links, and later schedule events are omitted;
Core category ordering, reference-only athletes, stat values, season metadata,
and Site v3's expanded athlete/team nesting are preserved. Only the first
Core leader in each category is retained. Site v3 is requested with `limit=1`.

Cloudflare remote-preview requests to the NFL Core profile, leaders, and
athlete URLs returned HTTP 403 with an HTML body, while local requests to the
same URLs returned HTTP 200. Site v3 `/leaders?team=33&season=2026&limit=1`
returned HTTP 200 from Cloudflare, with all returned team IDs equal to `33`
and the same four athlete IDs/stat values as Core. The integration tests
reproduce the 403 at the HTTP boundary rather than mocking the normalizer.

The NCAAB capture is intentionally important: season 2027 has no Core leaders
yet, and Site v3 silently returns `requestedSeason.year: 2026` despite a 2027
request. That response must be rejected, not displayed as current statistics.
