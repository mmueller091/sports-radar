# Alert release audit — 712f221

**Original commit: FAIL. Patched working tree: PASS for notification readiness.** No deployment, live push, threshold change, schema migration, provider request, or AI request was performed.

## Concrete defect and narrow fix

The alert primary key includes the scoring model version. On 712f221, an NCAAM game already sent under `2026-11-02.clock-integrity.2` could be sent again after the new model observed 90, then 84, then 90. The first 90 correctly established a baseline, but the later crossing bypassed the old model's sent record. The same defect affected prior ambiguous/in-flight delivery and a newer-model alert already in the queue.

The patch preserves model-specific crossing baselines while checking consumed notification history by **device + exact sport + event ID** at enqueue and in the atomic delivery claim. Sent, `delivery_unknown`, and `sending:*` records suppress another delivery across models; legacy unversioned keys also count. Cancelled/unsent old queues may still produce a later legitimate verified crossing. The current canonical-feed, preference, threshold, freshness, expiry, claim-owner, and retry checks remain intact. Notification health version becomes `2026-11-03.cross-model-dedupe.1`.

Changed files:

- `alerts-worker/src/index.js`
- `alerts-worker/src/alert-delivery.js`
- `alerts-worker/test/release-alert-transitions.test.js`

## Verified behavior

| Check | Result |
|---|---|
| Model transition with old-model score 84 and new-model first scores 86/90 | PASS: no alert; new verified baseline only |
| First partial observations 84/99 followed by first complete 90 | PASS: partial observations create neither baseline nor queue; complete 90 is baseline only |
| Complete high, partial low, complete high | PASS: partial dip cannot arm a threshold recrossing |
| Complete low, partial high, then complete high | PASS: partial high cannot alert; later verified crossing remains eligible |
| `partial`, `invalid`, `scoringPartial`, uncertain clock, stale detail, rejected live/basketball/summary/history updates | PASS: no alert or baseline update |
| Old-model sent / ambiguous / in-flight notification, then new-model recrossing | PASS after fix: neither enqueue nor repeat delivery |
| Older-model send completes after newer queue selection | PASS: atomic claim sees consumed history and cancels duplicate |
| Concurrent drainer loses claim while winning transport gets a definite rejection | PASS: legitimate retry remains pending and can deliver once |
| Existing canonical delivery revalidation | PASS: stale/missing/future feed, removed/final/declined game, partial evidence, changed threshold/preferences/unsubscribe cancel delivery |
| Existing transport/claim safeguards | PASS: concurrent drains send once; ambiguous failures never retry; definite rejection may retry within expiry; old claim cannot settle replacement |

The crossing ledger's nine partial 85/90 states are ineligible through the shared `currentAlertGame` gate regardless of sport. Complete replay states are only conditionally eligible: archived reratings do not establish a fresh canonical publication, current subscriber preferences, an observed threshold crossing, or absence of previous delivery. These tests exercise actual Worker queue/delivery code with isolated SQLite and a stub transport; they do not claim historical notifications occurred.

## Regression evidence

Before the fix, the first 18 new regression cases produced **11 PASS / 7 FAIL**. All failures reproduced duplicate delivery across model/legacy identity boundaries. Partial-evidence and first-observation controls already passed.

This baseline was independently reproduced against the exact two notification source blobs from `git show 712f221:<path>`, substituted in memory by [original-alert-loader.mjs](original-alert-loader.mjs). No active source file was overwritten. The [original-source log](original-alert-regressions.log) confirms 11 passes and the same seven failures: each of sent, ambiguous and in-flight prior history allowed a duplicate at recrossing and delivery, and the legacy unversioned game allowed a second notification.

```text
node --import ./audit/final-release-712f221/original-alert-loader.mjs --test --test-reporter=tap --test-name-pattern="migration uses|partial/rejected|model transition cannot|claim rechecks|cancelled/old pending|duplicate identity" alerts-worker/test/release-alert-transitions.test.js
```

After independent reverification, the expanded new suite has **22/22 PASS**. The combined six-file alert/feed/migration suite has **143/143 PASS**, zero failures or skips:

```text
node --test --test-reporter=dot alerts-worker/test/release-alert-transitions.test.js alerts-worker/test/audit-alert-delivery.test.js alerts-worker/test/notification-preferences.test.js alerts-worker/test/sports-feed.test.js alerts-worker/test/audit-refresh-migration.test.js alerts-worker/test/tennis-grand-slams.test.js
```

`git diff --check` passes. The root audit owns final all-suite validation.

The independent review added exact underscore-ID collision coverage and delivery-time checks for uncertain clocks, rejected summary lifecycle, and rejected scoring history. These pass without further production-code changes. The executable results are retained in [alert-reverification.log](alert-reverification.log).

Every queue and delivery test uses real SQLite rather than a SQL mock. A separate [cross-model race probe](alert-cross-model-sql-race.mjs) extracts the exact production claim query and executes it against two distinct model-specific pending rows from two worker threads with separate SQLite connections and a simultaneous-start barrier. **20/20 races produced exactly one claim**, with the other row still pending and therefore unable to send. See the [per-race proof](alert-cross-model-sql-race.json). This isolates the atomic cross-model guard itself; the normal drainer additionally cancels obsolete-model pending rows before selection.

## Database and budget impact

No new normal-path DB statement, network request, provider call, AI call, table, index, or retention change. Enqueue and successful delivery claim each add an indexed `NOT EXISTS` subquery to their existing statement. A denied claim uses **one additional conditional UPDATE** to remove a duplicate only while consumed history still exists. The queue limit remains ten rows per drain, so a drain adds at most ten such exceptional cleanup statements; ordinary successful claims add zero statements.

SQLite `EXPLAIN QUERY PLAN` confirms:

```text
SEARCH consumed USING INDEX sqlite_autoindex_alerts_1 (token_hash=?)
SEARCH alerts USING INDEX sqlite_autoindex_alerts_1 (token_hash=? AND game_key=?)
SCALAR SUBQUERY 1
SEARCH consumed USING INDEX sqlite_autoindex_alerts_1 (token_hash=?)
```

The guard searches one device's retained alert history using the existing composite primary-key index, then compares exact game suffixes; it does not scan every subscriber's alerts. Row-read work increases within that device's existing seven-day retention, so this is not a zero-cost query change. Existing retention and cleanup policies are preserved.

Scope of the duplicate guarantee: it applies to retained delivery records for the same device token and exact sport/event. The existing seven-day deletion policy and token identity are unchanged; the patch does not establish indefinite account-wide notification history. A long-suspended game resuming after all its alert records have expired remains an inherited limitation, outside this release-time model-transition fix.
