# Release gates

A failure in a complete regression suite is an unresolved release gate. A passing
isolated rerun, retry, or subset does not clear it. Preserve the original failure,
reproduce its conditions, investigate the cause, and verify the correction in the
complete suite with its normal concurrency. Run the complete alerts Worker suite
more than once for an integrity release.

Do not deploy or claim the full suite is green while any required test fails, is
cancelled, times out, or has an unexplained discrepancy. Record exact commands,
source revision, pass/fail/cancelled counts, and unresolved limitations. Do not
skip, weaken, or serialize tests solely to make a release pass.

Preserve unrelated working-tree changes. Do not repair an unrelated production
defect merely to clear a release gate when the task explicitly limits scope;
report the blocker and leave the release undeployed.
