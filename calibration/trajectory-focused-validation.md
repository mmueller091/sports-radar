# Frozen Phase 3.1 focused validation

No scoring function or policy constant changed. These are synthetic mechanics checks, not human accuracy labels. Both members of each pair have identical present score, clock, possession, field position, provider current WP, stakes and current-event inputs. Earlier event contributions are itemized below.

Group | Case | Policy | Pre-clamp | Final | History replaced (net) | Retained events | Requested net before guards | Requested positive | Awarded net | Negative multiplier | Absolute sport floor | Retained earlier factors
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
decisive | decisive-A | live-owned-35-85 | 92.5349 | 93 | 3 | 0 | 7.5349 | 7.5349 | 7.5349 | 0.25 | 85 | none
decisive | decisive-A | live-owned-45-95 | 90.9505 | 91 | 3 | 0 | 5.9505 | 5.9505 | 5.9505 | 0.25 | 85 | none
decisive | decisive-B | live-owned-35-85 | 89 | 89 | 0 | 6 | -8 | 0 | -2 | 0.25 | 85 | Erased a large deficit: 6
decisive | decisive-B | live-owned-45-95 | 89 | 89 | 0 | 6 | -8 | 0 | -2 | 0.25 | 85 | Erased a large deficit: 6
ordinary | ordinary-A | live-owned-35-85 | 56.5349 | 57 | 3 | 0 | 7.5349 | 7.5349 | 7.5349 | 1 | none | none
ordinary | ordinary-A | live-owned-45-95 | 54.9505 | 55 | 3 | 0 | 5.9505 | 5.9505 | 5.9505 | 1 | none | none
ordinary | ordinary-B | live-owned-35-85 | 47 | 47 | 0 | 6 | -8 | 0 | -8 | 1 | none | Erased a large deficit: 6
ordinary | ordinary-B | live-owned-45-95 | 47 | 47 | 0 | 6 | -8 | 0 | -8 | 1 | none | Erased a large deficit: 6
capacity | capacity-available | live-owned-35-85 | 56.5349 | 57 | 3 | 0 | 7.5349 | 7.5349 | 7.5349 | 1 | none | none
capacity | capacity-available | live-owned-45-95 | 54.9505 | 55 | 3 | 0 | 5.9505 | 5.9505 | 5.9505 | 1 | none | none
capacity | capacity-consumed | live-owned-35-85 | 64 | 64 | 0 | 15 | 8.5158 | 8.5158 | 0 | 1 | none | 2 lead changes: 4; Recent late lead change: 5; Big win-chance swing: 6
capacity | capacity-consumed | live-owned-45-95 | 64 | 64 | 0 | 15 | 6.7251 | 6.7251 | 0 | 1 | none | 2 lead changes: 4; Recent late lead change: 5; Big win-chance swing: 6

The ordinary pair uses the same earlier histories as the decisive pair. Its present situation has no supplied possession leverage. The capacity pair uses identical ordinary present inputs; the consumed case retains lead-change, recent late lead-change and WP-swing awards totaling 15. Its positive request is suppressed by the existing budget, not by final clamping.

Historical-WP thinning keeps every play and the same valid current observation. Current Tension, Generic Leverage and raw live components remain identical. Earlier provider-WP event evidence may change; complete event breakdowns are in the diagnostic key. End-to-end missing-current-WP cases remain separate.

Historical WP variant | Current WP | Current Tension | Raw sustained | Confidence | Adjusted sustained | False-close | Dominance | Retained events | Pre-clamp | Final
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
full | 0.8 | 27 | 9.4779 | 1 | 9.4779 | -0.9925 | -0.6387 | 0 | 54.9505 | 55
currentOnly | 0.8 | 27 | 10 | 0.65 | 6.5 | 0 | -0.0016 | 0 | 53.928 | 54
earlyPlusCurrent | 0.8 | 27 | 8.8282 | 0.9636 | 8.5069 | -1.3521 | -1.1089 | 0 | 53.5848 | 54
latePlusCurrent | 0.8 | 27 | 10 | 0.6609 | 6.6094 | -0.2149 | -0.1686 | 0 | 53.7213 | 54
sparseEndpoints | 0.8 | 27 | 8.4309 | 0.6864 | 5.787 | -1.5306 | -1.344 | 0 | 51.2086 | 51
internalSamplesRemoved | 0.8 | 27 | 9.4779 | 0.8768 | 8.3102 | -0.9925 | -0.6387 | 0 | 54.065 | 54

Internal sample removal still spans endpoint coverage; it does not establish observed coverage inside a gap. Current WP stays identical; retained earlier WP-event awards may legitimately change.

Policy labels: Phase 2; original slow-evidence / gate-10-65-wp-100; intermediate gate-45-95-wp-65; live-owned-35-85; live-owned-45-95. Historical reports are preserved rather than renamed.

Reviewer pack: [trajectory-reviewer-pack.md](trajectory-reviewer-pack.md). Diagnostic key: [trajectory-diagnostic-key.json](trajectory-diagnostic-key.json). No policy selected or promoted.
