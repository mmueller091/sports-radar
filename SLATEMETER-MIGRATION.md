# SlateMeter release and domain migration

Canonical address: **https://slatemeter.app**. This source is prepared for that address; publication is gated on rendered desktop/mobile review and DNS/HTTPS verification. It does not configure hosting by itself.

## Brand

The supplied Option A assets are copied without geometry or color changes: `slatemeter-pennant-s-icon.svg`, `slatemeter-pennant-s-icon.png`, `slatemeter-pennant-s-favicon-32.png`, and both `slatemeter-pennant-s-wordmark` formats. `icon.svg` is an exact copy of the supplied icon SVG. The standard 192 and 512 pixel installation icons are proportional raster reductions of the supplied 1024 pixel PNG. The rejected meter symbol is not used.

`slatemeter-theme.css` centralizes warm cream `#F0E8D4`, deep red `#BD343E`, and charcoal `#191C1F`, and maps the existing theme tokens to the new palette. System UI sans-serif fonts use the device's installed fonts; no Avenir assets or remote font downloads are required. Slate is regular and Meter is heavier. Existing rating hues and chart data remain independent of the brand accent. The outlined supplied wordmark is retained for social metadata.

## Origin and browser storage

All existing internal storage keys and API names remain stable. Nothing is deleted or copied between origins, and no credential export or account system is introduced. Moving from `mmueller091.github.io` to `slatemeter.app` creates a separate browser storage and permission boundary.

| Item | New-domain behavior |
| --- | --- |
| Favorites and home-page sports | Select again in Preferences. Old values remain on the old origin. |
| Watching games | Add games again. Old watchlist remains on the old origin. |
| CFB FCS/conference/Top 25 filters | Reconfigure; they are part of browser preferences. |
| Notification sports, teams and threshold | Select again. These use a new per-origin device identity. |
| Push permission/subscription/device token | Enable explicitly on the new origin. Never export or transfer subscription secrets. |
| Existing push subscriptions | Remain active until the user turns them off in the old installed app or revokes old-origin notification permission in browser settings. Duplicate alerts may occur while both are enabled. |
| Browser-local rating history and pregame lines | Stay on the old origin; not transferred. |
| Recorded Worker history and completed archives | Same service/database and existing retention; available through Game Center. |
| Installed PWA state | Install SlateMeter again from the new address. Retain the old installation until choices are checked. |
| CFB metadata cache | Refetched normally at the new origin. |

A narrowly scoped export/import was considered. This release uses manual reconfiguration to avoid copying device tokens, push secrets, cached provider data or obsolete local history. The Preferences dialog explains the steps. Users unable to open the old installed app can revoke notification permission for `mmueller091.github.io` in browser settings. The release itself does not revoke it.

Notification payloads retain `sport`, `gameId` and `gameKey`. The existing click handler constructs a route inside its own registration scope from that identity. Old-origin subscriptions therefore continue opening the legacy hash route, which GitHub Pages must redirect after activation. New subscriptions open the custom-domain root. External or out-of-scope payload URLs remain rejected. Test pushes are never sent by the release checks.

## Controlled rollout

1. Inspect the current remote `main` and Worker version again. The preparation baseline is frontend `3b4fa3bd94ad89534a6c94b46da42c88e25791d3`, Worker `312df33a-6d5b-4378-9f7e-4ad7c7fd355d`, model `2026-11-01.audit-integrity.3`.
2. Complete actual desktop and mobile visual review, including the home list, Game Center explanations/timeline, Preferences and installation instructions. Do not treat markup tests as visual approval.
3. Deploy the CORS-only compatibility commit `a832f758578a34c2e3303fe2942d656a2ea1aca2` from a clean checkout through the existing Wrangler workflow. It changes only the explicit allowlist and related tests. Keep the original Worker endpoint, bindings, crons and secrets. Verify health/feed/details, both origins and preflight. Roll back immediately if production health or scoring differs.
4. In this repository's **Settings → Pages**, associate `slatemeter.app` as the custom domain. Read the saved value back before DNS changes. Keep the existing custom Actions build. Do not add a CNAME-file dependency.
5. Reinspect Cloudflare DNS. At preparation time the dashboard showed **zero records**; authoritative nameservers were `jean.ns.cloudflare.com` and `theo.ns.cloudflare.com`. Add only the records below, **DNS only**, without Cloudflare proxying or wildcard records. Do not overwrite any records added since preparation.
6. Wait for GitHub's certificate to cover the apex and `www`. Confirm valid HTTPS and Pages HTTPS enforcement. Check old GitHub Pages links and `www` redirect to the canonical root with their game hash preserved. If association redirects old traffic before HTTPS is ready, restore the prior Pages setting instead of leaving the working site unavailable; record the provisioning blocker and coordinate another activation attempt.
7. Only after the domain is ready, publish the complete branding source to `main` through the existing Pages workflow and deploy the final Worker branding/URL update. No schema migration is needed. If remote `main` advanced, integrate that source before release; do not overwrite intervening work.
8. Check every published asset's hash against the exact commit build, service-worker revision, root navigation/refresh, shared game URLs, both CORS origins, live feed freshness and source errors. Confirm repeated ordinary Actions builds retain the configured domain. Do not call `/test` with a real subscriber during automation.

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| A | @ | 185.199.108.153 | DNS only |
| A | @ | 185.199.109.153 | DNS only |
| A | @ | 185.199.110.153 | DNS only |
| A | @ | 185.199.111.153 | DNS only |
| CNAME | www | mmueller091.github.io | DNS only |

These are the documented GitHub Pages apex addresses. IPv6 is optional; no existing AAAA records were found. `www` points to the GitHub host, not the repository path or apex. The apex is the custom domain, so GitHub handles the canonical redirect. Certificate provisioning and DNS propagation can take time; `.app` has no HTTP fallback.

References: [GitHub custom-domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [GitHub HTTPS setup](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Rollback

No migration changes have been deployed at preparation time. The exact original source is retained in `rollback/slatemeter-20261102` and the local `work/slatemeter/production-rollback.bundle`. `work/slatemeter/pages-before.json` captures the original Pages state: no custom domain, Actions workflow builds, HTTPS enforced. Public assets and their original hashes are preserved in `work/slatemeter/published-before/` and `production-baseline.json`.

After deployment, restore the original source through a reviewed revert/restore commit on main and the existing Actions workflow (do not force-push). Restore Worker version `312df33a-6d5b-4378-9f7e-4ad7c7fd355d` with the established Wrangler rollback workflow and verify it receives 100% traffic. Restore Pages `cname` to null if returning to the original URL. Remove only the DNS records created by this migration if they must be rolled back, after restoring the working Pages address. Preserve domain registration, nameservers, unrelated records, repository visibility and hosting plan.

There is no reverse database migration. Old- and new-origin browser data and subscriptions remain separate and must not be erased during rollback. The retained dual-origin CORS commit can be used during a transition if the old source alone would prevent new-origin clients from reaching the service.
