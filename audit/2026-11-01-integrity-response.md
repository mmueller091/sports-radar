# November 1, 2026 production integrity response

This response addresses the authoritative audit at `C:/Users/mmuel/Documents/Codex/audit-20261101-sports-radar/audit.md`. The changes repair evidence handling and distinguish a live recommendation from a retrospective assessment. They do not smooth ratings or enable experiments.

**Release status: first release rolled back; the repaired candidate passed 1,097 tests; final pregame compatibility activation and production verification are pending.** The initial 1,074-test candidate and asset verification passed, but normal refresh attempts repeatedly exceeded the publication deadline. The bounded transition repair preserves the deadline and exposes unfinished work honestly. The final release record below is authoritative.

## Source, preservation and rollback

The deployed Pages revision and GitHub main were verified at `8ad7a0096307e0ab9038dbcba60f0e965e9bcfaa`, model `2026-11-01.production-integrity.2`. No subsequent production source change was found at baseline. The public scorer SHA-256 was `0b3a7e5cb8ea9391be3bf0652a35fc0a735683fb5655c10b36979974803ce885`; a clean build of the audited source matched it. The published app SHA-256 was `e4ddebb4e3621dd46d66c90fec613ca496df9e0182a397bf9bc8e25fe3b5aec5`.

The user's original checkout at `C:/Users/mmuel/Documents/Codex/2026-10-21/sports-radar-publish` was at `ec2b87dc789fff3c5eca54e8377fe78dfe98319e`, with existing tracked and untracked work. It was not edited, reset, staged or checked out. Implementation uses the separate `sports-radar-integrity-20261101` clone and branch `audit/20261101-integrity-response`.

The exact source rollback tag is [`rollback/production-20261101-8ad7a00`](https://github.com/mmueller091/sports-radar/tree/rollback/production-20261101-8ad7a00), preserved locally before implementation and pushed to the existing remote before release. The baseline Worker deployment version is `8bb6ab4e-ff5b-43ca-bae4-493371b20d9e`, with 100% traffic, deployed at 2026-11-02 02:27:19.663 UTC (November 1 in New York). Wrangler verified identity and routing; Worker executable byte provenance was unavailable and is not claimed. The [implementation plan](integrity-20261101/implementation-plan.md) records architecture, risks and release order established before implementation.

The candidate model is **`2026-11-01.audit-integrity.3`**. Browser and Worker use `scoring/live-runtime.cjs`; the browser checks canonical-feed model compatibility. Pages deploys through the existing main-branch GitHub Actions workflow. Worker deployment uses the existing Wrangler configuration. No database migration is required.

## Finding dispositions

| Finding | Root cause and correction | Direct evidence and controls |
|---|---|---|
| F1: legitimate football correction rejected | Monotonic clock/ID checks confused same-ID revisions with stale arrivals. Reconciliation now uses ordered provider revisions, matching summary evidence or explicit coherent scoreboard clock/field corrections, with bounded superseded-version protection. | Captured play `4018730352076` moves from obsolete 1:23, first-and-ten at WSH 20 to corrected 1:38, fourth-and-one at WSH 19, then accepts the 1:32 punt/possession change. Old same-ID replays, earlier revision timestamps and agreeing stale lower-score resources remain rejected. |
| F2: incomplete history reported complete | Validity and completeness were conflated. Explicit `complete`, `partial`, `invalid`, reasons and score-progression coverage now distinguish them. Historical reads classify explicit old ledger mismatch as partial without modifying the recorded rating. | OTT–ANA's delayed goal remains a legitimate +8. Unsupported early completeness and scoreless excerpts are covered. Provider partial flags survive cached-summary retention. |
| F3: fabricated duration credit | Inferred opening 0–0 and elapsed time were treated as observed history. Duration credit now requires supported score/WP intervals, excluding unknown starts and unexplained gaps. | Header-only cases across sports have zero history credit; real observed scoreless/competitive intervals retain credit. Clockless observations cannot invent timing. |
| F4: duplicate event inflation | Repeated records reached event consumers independently. Normalization now deduplicates stable IDs and exact fallback records, selects supported revisions and quarantines unresolved factual conflicts. | The interception's shock is 4 for one, two or three copies. Distinct events remain distinct. Persisted old-model caches and revised-event replays are covered. |
| F5: future evidence used at an older state | Summary events, WP and drive/aggregate fields crossed the scoreboard boundary. All retained and incoming evidence now passes through the canonical boundary. | A future 0:50 play cannot alter the displayed 1:00 state; future OT drive results are deferred even with a synchronized header. Supported current WP remains available. |
| F6: Soccer missing probability treated as zero | Numeric conversion turned null into a real zero. Missing values now use the intended score-margin fallback; actual numeric zero and one remain valid. | Tied trajectory, competitive/dominant share and absent/boundary values are tested. No probability is invented. |
| F7: stale Soccer pressure | Array-tail selection treated old repeated chances as recent. Pressure now uses actual occurrence time within five match minutes and deduplicates records. | Old/repeated/unknown/future chances contribute no current pressure. Timed current chances, stoppage time and explicit occurrence timestamps are covered. |
| F8: nested Tennis collection | The collector ignored tournament groupings. It now flattens individual competitions, preserves match status and identities, and exposes only supported score context. | Exact capture: 0 → 225 matches, comprising 143 completed, 82 upcoming and zero live. Captured live singles/doubles/tiebreak fragments test feed/detail behavior separately. |
| F9: obsolete queued alerts | Delivery trusted the old queue payload. An atomic owned claim now precedes rereading current subscription preferences and canonical game eligibility immediately before transport. | Queued 90/current 10 and completed games send nothing. Current eligible 88 sends 88 once. Concurrency, retries, unknown delivery outcome, replacement subscriptions and later valid crossings are tested with mocked transport. |
| C1: CFB retrospective quality inflates live urgency | A completed-game assessment was blended back into late live scores. It is now separate provisional `gameQualitySoFar` telemetry; finals retain their existing assessment. | Legal kneels 58/77/80 → 34/34/34; provisional quality remains 80. Genuine late threats and dramatic finishes remain covered. NFL has no equivalent retention mechanism and its control stays 55/55/55. |
| C2: MLB tying batter ignored | Raw deficit gates excluded a loaded-bases, down-four plate appearance. Confirmed occupancy, outs, batting side and tying/winning-run location now inform the existing current-tension curve and situation gates. | Bottom ninth, loaded, down four: 2 → 43 at zero outs, 42 at one out, 44 at two outs; three outs returns 1. Empty bases and down-five remain 1. No new support is awarded for unknown occupancy or an exhausted inning. |

Detailed mechanisms, test provenance and limitations are in [evidence notes](integrity-20261101/evidence-notes.md), [trajectory and sport notes](integrity-20261101/trajectory-notes.md), [Tennis and alert notes](integrity-20261101/alerts-tennis-notes.md), and [independent adversarial review](integrity-20261101/adversarial-review-notes.md).

## Exact rating and explanation comparisons

All differences below are intentional consequences of the named correction. The model version changes; global scoring coefficients and experiment flags do not. The original observations remain immutable.

| Game/scenario | Original | Corrected | Cause and resulting explanation |
|---|---:|---:|---|
| OTT–ANA, delayed tying goal absent from ledger | 63 | 61, partial | F2 exposes missing score progression; F3 removes unsupported opening-duration credit. UI discloses that history is catching up. |
| Same canonical score, tying goal arrives | 71 | 69, complete scoring ledger | Verified erased multi-goal deficit still contributes +8; the explanation identifies that comeback. No smoothing conceals the adjustment. |
| NFL interception, one/two/three copies | 54/57/60 | 53/53/53 | F4 keeps shock at 4. Shared −1 is F3's removed 1.421875 unsupported trajectory contribution before rounding. |
| NFL 1:00 current WP .5 / append 0:50 WP .99 | 65/52 | 58/58 | F5 retains current .5 and removes future influence; F3 removes 6.5 unsupported history points. |
| NFL header-only 24–19, Q4 1:50 | 84 | 83 | Unsupported +3.964 trajectory credit removed. Existing decisive-floor allocation reuses some headroom, so the final change is not simply −4. |
| CFB equivalent header-only state | 92 | 88 | Unsupported +4.390 trajectory credit removed. |
| NBA / NCAAM header-only late tie | 64 / 78 | 57 / 71 | Unsupported +6.5 history removed. |
| MLB header-only bottom-ninth tie | 78 | 71 | Same F3 correction. |
| Soccer tied after minute-21 equalizer, no WP | 53 | 65 | F6 replaces false dominance with the intended margin-based assessment of observed history. |
| Soccer minute-3 chance repeated seven times at 90+5 | 46 | 47 | Pressure 7 → 0; independently, F6 removes a false −6.4 penalty. The total can legitimately rise while stale pressure disappears. |
| CFB legal kneels at 0:59 / 0:19 / 0:01 | 58/77/80 | 34/34/34 | C1 removes only the 24/43/46-point live/final blend; quality-so-far remains separately labeled 80. |
| MLB bottom ninth, loaded, down four, no outs | 2 | 43 | C2 recognizes the tying run at the plate using confirmed runners and an existing tension curve. It does not assume those runs will score. |

The NHL reconstruction reproduces 63/71 exactly using persisted evidence from audit rounds 17/18. It is explicitly a reconstruction; a complete original raw summary was not captured. [Before](integrity-20261101/evidence-replay-before.json) and [after](integrity-20261101/evidence-replay-after.json) record factors and provenance. The broader [sport reproduction](integrity-20261101/trajectory-reproduce.mjs), [original values](integrity-20261101/trajectory-baseline.json) and [corrected values](integrity-20261101/trajectory-corrected.json) expose component-level interactions.

Live cards and accessibility descriptions say “watch now rating”; completed games say “game quality.” Game Center labels the provisional CFB assessment separately. Partial history and manpower conflicts have explanatory text. Raw stored ratings, timeline observations and old model identities are preserved.

## Additional investigations

NHL manpower is an advisory consistency check, not a reconstructed replacement lineup. The official [2026–27 NHL rules](https://media.nhl.com/site/asset/public/ext/2026-27/2026-27Rules.pdf), rules 16.2, 18.2, 19 and 20.1, informed minor, double-minor, major, overlap and goal treatment. Known expiration conflicting with on-ice state marks evidence partial; incomplete or complex penalty evidence remains unknown/provider-only. No global ESPN override or NHL weight change was made. The observed Ottawa minor and later on-ice snapshot are combined in a provenance-labeled consistency fixture; an unreported new penalty cannot be excluded.

NBA/NCAAM sequence guards remain unchanged. Finalized historical PBP is not the original live arrival stream. Existing archived fresh-versus-retained differences therefore remain a documented provider-history limitation pending timestamped original observations. [Investigation details](integrity-20261101/nhl-basketball-notes.md) distinguish the audit runner from the common replay harness.

## Regression and release gates

The clean audited source passed **972/972 tests**, score/watchlist/timeline fixtures and the 107-fixture calibration report. An initial clone's Windows line-ending/ownership problems were isolated and corrected in a separate clean baseline; those infrastructure failures were not reclassified as product defects. The original user's tree remained untouched.

Every confirmed finding has failing-before targeted evidence. The evidence suite initially failed every assertion group against the audited source. The initial Tennis/queue suite was 0/19 before correction. The trajectory suite's controls include already-correct behavior alongside its failing defect cases. Independent review produced further failing tests before fixing cache, chronology, queue replacement and missing-time holes. Detailed logs and totals are recorded with each sub-report; overlapping targeted totals must not be added to the full-suite count.

The first broad candidate run exposed real and expected failures. Unexpected archived NBA 47→43 and MLB WP-swing 38→39 changes were rejected and repaired by preserving provider WP order and using proper MLB inning/event ordering. Historical review generation now uses a hash-checked frozen audited dependency graph rather than mutable current modules; historical goldens were not updated. Tests with intentional semantic changes retain explicit old-source baselines and attribution checks. Independent test review restored input-immutability contracts.

Final automated validation:

| Gate | Result | Evidence |
|---|---|---|
| Complete root and Worker suite | **1,097 passed; 0 failed, skipped, cancelled or todo** | [Final test log](integrity-20261101/release-final-tests.log.gz); includes browser/Worker bundle parity, all new tests, bounded migration and replay-comparator controls |
| Audited clean baseline suite | **972 passed; 0 failed or skipped** | [Baseline log](integrity-20261101/baseline-clean-tests.log.gz) |
| Score, watchlist and timeline fixtures | Passed | [Fixture log](integrity-20261101/final-fixtures.log.gz) |
| Completed-game calibration | **107 fixtures; all CSV values unchanged** | [Baseline](integrity-20261101/baseline-calibration.csv), [candidate](integrity-20261101/final-calibration.csv) |
| Historical causal-prefix replay | **1,997 checkpoints; 79 attributed changes; 0 unexplained; 0 repeated-poll changes** | [Per-checkpoint JSON](integrity-20261101/replay-differences.json), [CSV](integrity-20261101/replay-differences.csv) |
| Candidate endpoint smoke | **8 expected outcomes passed**; zero network, notification, background or production-write activity | [Route checks](integrity-20261101/endpoint-smoke-notes.md), [results](integrity-20261101/endpoint-smoke-results.json) |
| Production build and Worker dry run | Passed; existing DB/AI bindings; refreshed after the bounded migration repair | [Build](integrity-20261101/release-final-build.log.gz), [dry run](integrity-20261101/release-final-dry-run.log.gz) |
| Source/whitespace review | Passed with CRLF-aware Git whitespace check; no original-worktree changes | Source and artifact manifests accompany the evidence |
| Desktop/mobile visual inspection | Not completed; user stopped Computer Use | Explicit limitation below; responsive checks were requested where tooling permits |

Four old shock assertions relied on events later than the displayed clock. The repaired tests now separately require zero future influence and legitimate decay after advancing the canonical clock. The archived basketball parity fixture uses an observed 0:12 event; a separate negative control proves its old 0:10 future event is excluded. These corrections retain the intended contracts and do not relax the new boundary.

### Final replay attribution

The final baseline, candidate and ablations use matching runner/source fingerprints. The manifest covers all modified production modules; [unchanged dependency verification](integrity-20261101/unchanged-replay-dependencies.json) separately pins the unchanged core/calibration/reconstruction dependencies to the audited Git blobs. The comparator rejects missing or mismatched provenance. Restored mechanisms exist only in the offline runner and are never imported by production.

| Sport / game | Checkpoints | Changed | Verified cause |
|---|---:|---:|---|
| NFL `401872988` | 220 | 0 | Complete-prefix ratings preserved |
| CFB `401856723` | 177 | 12 | C1 retrospective retention removed |
| MLB `401908024` | 385 | 67 | 59 F3, 5 C2, 3 interacting F3+C2 cases |
| NHL `401892524` | 312 | 0 | Complete-prefix ratings preserved |
| NBA `401909088` | 499 | 0 | Original chronology/order preserved |
| NCAAM `401856574` | 404 | 0 | Original chronology/order preserved |

The per-checkpoint records include game/play, period/clock, original and corrected scores, exact restored-mechanism ratings, cause, intentionality, unchanged-weight flag and changed-model flag. There are **1,918 unchanged** checkpoints. Interacting MLB effects are labeled jointly rather than falsely added as independent bonuses. Initial 90-change MLB counts came from an earlier candidate and are superseded by the final matched-fingerprint result.

An introduced same-clock basketball ordering bug was also rejected during review: numeric sequence order had overridden the existing wallclock tie-break, changing turnover decay and one observed score interval. Preserving the established order restored every fresh and sequential basketball rating. [Independent replay review](integrity-20261101/replay-review-notes.md) records the precise examples. Both models retain 65 NBA and 104 NCAAM fresh-versus-sequential differences in finalized historical data, with identical rejection behavior and zero repeat differences. These are not new regressions or proof of current live-feed failure.

Full [baseline](integrity-20261101/baseline-replay.json.gz), [candidate](integrity-20261101/final-replay.json.gz) and single/joint restoration artifacts are retained as lossless gzip. Logs are similarly archived as `.log.gz`; commands in the sub-reports reproduce their uncompressed local originals. No original historical rating or golden artifact was rewritten.

## Remaining limits and follow-up evidence

- “Complete” describes supported score progression, not proof of an uninterrupted arrival stream. Duration coverage is separate telemetry. Missing facts remain unavailable.
- Exact idless duplicate payloads cannot distinguish retransmission from genuinely identical unidentifiable events. Distinct IDs/factual fields remain distinct. Unseen older unversioned revisions remain a provider limitation.
- Revision caches are bounded (1,024 timestamped events / 384 KB; 16 superseded scoreboard fingerprints). Overflow exposes reduced coverage. They are persisted only for current reconciliation and omitted from public and long-term historical payloads.
- Tennis point-by-point/history coverage is unverified; started Tennis ratings remain partial. The generic summary endpoint returned HTTP 400 in the capture, so detail uses persisted match scoreboard context without inventing point state.
- Alert transport has no exactly-once network guarantee. Ambiguous outcomes and crashed in-flight claims are not retried automatically, favoring missed alerts over duplicates. Device delay after successful transmission remains outside server-side revalidation; existing Web Push TTL is unchanged. Tests sent no real notifications.
- Computer Use was stopped by the user's physical Escape before the candidate page was inspected. **No desktop/mobile visual verification is claimed.** Source/DOM/accessibility checks and a synthetic local preview are available, but do not substitute for visual inspection.
- Worker deployment identity and traffic can be verified; executable binary provenance remains unavailable unless separately established.

## Release record

The initial implementation commit was `c138f5f0e6761d3169ea54f2bcc8a15dccefaa4c`. Worker version `48fff039-4d06-4dfe-9f33-5220c1f32bd6` reached 100% traffic. Pages [workflow 41386622106](https://github.com/mmueller091/sports-radar/actions/runs/41386622106) succeeded, and all 15 published assets matched the committed build byte for byte; downloaded JavaScript syntax checks passed. The new health model and alert safeguards were correct.

Production consistency nevertheless failed: normal refresh attempts repeatedly reached the existing 25-second deadline while attempting to enrich 259 non-Tennis games whose metadata was invalidated by the model change. The previous publication remained stale. The new Tennis matches were excluded from summary candidates and were not the cause of those 259 requests. A later trace showed publication finally succeeding at approximately 04:10:23 UTC and another update afterward, but rollback had already been initiated because the repeated failures were unacceptable. No candidate detail verification was claimed. GET `/feed` has an existing automatic background refresh path; these normal read checks did not invoke an explicit refresh or notification endpoint.

The Worker was restored to exact version `8bb6ab4e-ff5b-43ca-bae4-493371b20d9e`. Main advanced to rollback commit `30cd7c437a5f94404fa5cffa8179882a8b96efba`, whose entire tree equals the audited `8ad7a00` tree. Pages [rollback workflow 41387018806](https://github.com/mmueller091/sports-radar/actions/runs/41387018806) succeeded. At 04:13 UTC, health and feed both reported the original model, with an approximately 11-second-old, non-stale, non-degraded feed. The isolated audit branch and all verified changes remain preserved.

The [bounded migration repair](integrity-20261101/migration-notes.md) reserves seven seconds inside the unchanged 25-second deadline for publication. Live games retain priority. Compatible cached provider facts are recalculated under the new model; missing, failed or incompatible nonlive inputs publish explicit provisional/partial records rather than relabeled old-model scores. Completed work is persisted and pending work prioritized on the next poll. Deferred validation of a previously calculated current-model row preserves its original input metadata and explicit partial/stale flags. Reuse requires both row and metadata model identity. Partial finals never enter completed history.

The heavy 485-game regression fails before this correction and now progresses from 187 to 115 to 43 to zero pending enrichment rows, with simulated publication at 18.55–18.75 seconds; deferred cache validation also converges. Six migration tests plus the existing refresh and Tennis tests pass 41/41, and the complete final suite passes 1,082/1,082. Independent review reproduced and verified corrections for cache-validation starvation and stale live summaries incorrectly certifying finals. Cards, accessible descriptions and Game Center visibly label pending details/provisional ratings; that UI regression fails before its correction and passes afterward. These are deterministic offline controls, not a claim about worst-case Cloudflare latency.

A second release still requires the actual canonical-publication check. [Sanitized remote observations](integrity-20261101/failed-release-observation.json) omit request headers, IP/location and account identifiers; [rollback record](integrity-20261101/rollback-record.json) and [restored asset hashes](integrity-20261101/rollback-assets.json) preserve exact identities. Raw tail logs are local-only and will not be published.

The second Worker release (`07b15395-b632-4db0-82e0-368f8ac635e2`, source `c02fa1901be905a9c0d9bf738571c7564bbb7872`) successfully published current-model data within the deadline. Public checks passed 13 requests, including 10 matching representative details and 225 Tennis matches. Review then found 88 upcoming NBA/NHL games unnecessarily held partial because their summaries omitted scores while scoreboards supplied zero placeholders. The final ingestion predicate accepts this equivalence only for explicitly pregame resources with matching participants, without writing scores into either resource. Started/completed resources require present finite numeric scores. The 15 focused score-guard tests and the final 1,097-test suite pass.

The [final source comparison](integrity-20261101/final-guard-source-verification.json) proves that the compatibility predicate is the sole production delta from the last fingerprinted replay: all 58 other recorded source files, including every scoring module and the active replay adapter, are byte-identical. The full older Worker fingerprint is not claimed to match this final guard revision. Complete-input scoring replay results therefore remain supported by the unchanged scoring graph; the ingestion change has its own provider-shaped end-to-end and full-suite checks.
