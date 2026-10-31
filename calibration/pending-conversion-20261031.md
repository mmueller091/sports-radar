# Pending conversion after a late touchdown

The captured Kansas State–Colorado scoreboard (`401856846`, October 31) showed
Kansas State trailing 20–21 at 0:01 after a six-point touchdown. The live feed
cleared possession, set `down: -1` and `yardLine: 0`, and supplied no explicit
two-point-attempt flag. Recorded production snapshots fell to 40 while the try
was still pending. The current touchdown drive appeared in both `previous` and
`current` in the summary.

`footballPendingTryImpact` recognizes this structured transition in late Q4 for
CFB and NFL, and during overtime. It uses the existing critical-try headroom calculation, independent
of the remaining game clock, and explains that a conversion is pending. It does
not add the unplayed conversion to the actual score or assume a kick/two-point
decision. The production replay of the captured state now scores 99 with or
without summary enrichment.

TD text alone does not qualify. Scrimmage downs, a changed field location,
unknown scoring teams, mismatched scores, resolved PAT metadata/text, and later
plays remove the inference. Accepted summaries can confirm that even a scoreless
failed try has finished. Duplicate drives, review, timeout, and quarter-end
records do not erase an outstanding try. Completed ratings remain on their
existing path.

The public captured regression is in `test/fixtures/cfb-pending-try-401856846.json`.
The pending-try, NFL/CFB calibration, completed-CFB, opening-transition, and
football-transition suites passed all 82 tests, including built-browser/Worker
parity. The test baseline helper now uses the baseline calibration identifier
instead of assuming it equals the release model version. Existing stored
baseline calibration identifiers remain compatible.

Included in release model: `2026-10-31.football-live-state.1`.
