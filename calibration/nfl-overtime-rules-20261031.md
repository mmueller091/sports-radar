# NFL overtime rule audit

Checked against the official [2026 NFL rulebook](https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf), Rule 16 and Rule 4-8-2(c).

The current opening FG/TD response is subject to the regular-season ten-minute
limit. Playoff periods last fifteen minutes and can continue an unfinished
response. A scoreless opening possession makes the next score decisive; matching
scores after both opportunities also lead to sudden death. An outcome-changing
conversion can remain pending after time expires. Defensive scores, completed
failed responses, and legally recovered kickoffs do not create another
unearned possession. Historical opening-TD rules remain versioned by season.

The audit corrected the scoreless-opening sudden-death label, regular-season
clock expiry, playoff continuation, active response leverage, conversion leverage
at a tied score, and ended-opportunity detection. Season metadata is preserved
from event-only feeds and supports object-shaped season types. Unknown or
nullified play evidence cannot establish a new opportunity. Game scores and
official final status remain provider-owned.

`test/nfl-overtime-rules.test.js` covers the rule matrix and production
browser/Worker parity. All 114 relevant scoring, conversion, overtime,
transition, completed-game, and module-parity checks passed; the site builds.

Release model: `2026-10-31.football-live-state.1`.
