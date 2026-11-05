# SlateMeter X bot via Buffer

The `slatemeter-social-bot` Worker runs independently of `sports-radar-alerts`.
It reads the existing published feed directly from the production SOURCE_DB D1
binding, never runs the scoring model or fetches ESPN, and records its own
posting history in the separate `slatemeter-social-bot` BOT_DB database.

**Default state is disabled.** It records live-game baselines and logs potential
85-point crossings but cannot create a Buffer post until `POSTING_ENABLED` is
explicitly changed to `true` and the Worker is deployed again.

## Posting policy

1. Only NFL, CFB, NCAAB, NBA, and NHL live games are eligible.
2. A published feed must be no more than 120 seconds old and match the pinned
   `EXPECTED_SCORING_MODEL`. Per-game rejected, stale, partial, or uncertain
   evidence is excluded, consistent with production notification safeguards.
3. The **first observed verified crossing from below 85 to 85 or higher** is the
   only opportunity to post. Initial observations already above 85 never
   back-post. Pregame and completed games never post.
4. D1 holds one unique claim per sport/game/85 milestone, independent of scoring
   model changes. `84 -> 85 -> 84 -> 86` can therefore yield only one Buffer
   request. Overlapping cron runs compete for the same claim.
5. Before calling Buffer, a unique claim is atomically changed from `reserved`
   to `sending`. A crash or ambiguous response stays consumed and requires
   manual reconciliation. It is **never retried blindly**.
6. Buffer uses `createPost` with `mode: shareNow`, not its scheduled queue.
   Acceptance by Buffer is not proof of successful delivery to X.
7. Defaults limit sends to 3 per cron run and 20 per rolling 24-hour period.
   No posts can occur while the publishing switch is off.

This is deliberately at-most-once, not guaranteed-delivery, behavior. If
delivery is uncertain, investigate the Buffer channel and claim before any
manual recovery. Do not delete or reset the claims database to force retries.

## Safe rollout

The resource IDs in `wrangler.jsonc` name the existing scoring database and
the separate newly provisioned bot database. There is no change to the
production scoring Worker configuration or its D1 schema.

1. Test: `node --test test/social-bot.test.mjs test/social-hashtags.test.mjs`.
2. Package dry run with the repository's pinned Wrangler:
   `alerts-worker/node_modules/.bin/wrangler deploy --dry-run --config social-bot/wrangler.jsonc`.
3. Apply the schema only to `slatemeter-social-bot` (BOT_DB) using the documented
   remote D1 execute command. Do **not** run it against `sports-radar-alerts`.
4. Deploy the separate Worker with `POSTING_ENABLED=false`; inspect `/health`
   and several natural scheduled dry runs.
5. From Buffer Settings > API, create a personal API key. Store it under
   `BUFFER_API_KEY` as a **Secret** on the separate Worker. Never paste it into
   chat, commit it, or set it as a plaintext Wrangler variable.
6. On activation, the bot makes two read-only Buffer queries to identify its
   single connected X channel and caches that channel ID in BOT_DB. If more
   than one X channel is linked, set a specific `BUFFER_X_HANDLE` or
   `BUFFER_X_CHANNEL_ID` instead, after verifying the exact account.
7. Review the format and dry-run crossings, then explicitly approve changing
   `POSTING_ENABLED` to `true`. Monitor the first post and the claim status.

The bot can be stopped immediately by switching the flag to `false` and
redeploying this Worker. The production scoring Worker and existing audit
remain unaffected.

## References

- [Buffer API authentication](https://developers.buffer.com/guides/authentication.html)
- [Buffer API immediate posting](https://developers.buffer.com/guides/rest-migration.html)
- [Buffer channel discovery](https://developers.buffer.com/examples/get-channels.html)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
