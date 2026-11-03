Why 61 of 62 upcoming games classified as FCS have a rating of 40

In the captured 2026-11-03 production feed, 61 games have exactly two factors: the CFB sport baseline (32) and schedule scarcity (8). They have no usable betting line and no ranked team. This yields exactly 40; it is not an FCS-specific floor or a cap.

Records are present, so missing records do not explain the uniformity. In `scoring/shared/college.js`, the ranking-rules `matchup` callback runs only when both teams are ranked. The CFB record-strength and unbeaten rewards live inside that callback in `scoring/sports/cfb.js`. Ordinary unranked/FCS records therefore do not activate those rewards. Without odds, ranks or another verified contextual factor, these games all receive the same baseline and scarcity total.

The exception is Merrimack–Wake Forest (`401858290`). The feed classifies this cross-division matchup in the FCS group. Wake Forest is No. 14, supplying the existing single-ranked-team factor (+4), for 44. This directly accounts for the 62nd game.

No changes to this behavior were made. If a future scoring task addresses it, it should evaluate unranked/FCS record strength and schedule quality separately, with recalibration and replay checks. Narrative improvements alone should not manufacture stakes or change the rating.
