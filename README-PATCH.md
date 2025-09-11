# Patch: SPA Fallback + Cache Headers + Stale Predictions Cleanup

## What this does
- Adds `public/_redirects` so Netlify serves your SPA for all deep links (`/* -> /index.html 200`).
- Adds `public/_headers` to **never cache** `index.html` (so new bundles load after deploy) and to **long-cache** `/assets/*`.
- Removes legacy static `public/predictions*.html` files that can shadow the React route when you open `/predictions` directly.

## Files included
```
public/_redirects
public/_headers
scripts/apply_patch.sh
```

## How to apply

**Option A — one-liner with the helper script**
1. Unzip this patch at the **repo root** (you should end up with `public/_redirects`, `public/_headers`, and `scripts/apply_patch.sh`).
2. Run:
   ```bash
   bash scripts/apply_patch.sh
   ```
3. Commit & push:
   ```bash
   git add public/_redirects public/_headers
   git commit -m "fix: SPA fallback + cache headers; remove stale predictions html"
   git push
   ```

**Option B — manual copy**
- Copy `public/_redirects` and `public/_headers` into your repo.
- Delete any stale `public/predictions*.html` manually if you see them.
- Commit & push.

## Sanity checks after deploy
1. Open **/predictions** directly in a fresh tab/window (not via the nav). You should see the table with green confidence bars.
2. In the console, verify the function returns rows:
   ```js
   fetch('/.netlify/functions/nfl-predictions-get')
     .then(r=>r.json())
     .then(j => console.log('rows:', j.rows?.length, 'updated:', j.updated));
   ```
3. Confirm headers:
   - `index.html` has `Cache-Control: no-cache, no-store`.
   - `assets/*.js` have long `Cache-Control` with `immutable`.

If anything looks off, hard refresh or clear cache once; after this patch, future deploys will swap bundles reliably without cache issues.
