# Patch: Fix @netlify/blobs version ETARGET

Your Netlify build failed because the repo depended on a non-existent version: `@netlify/blobs@^5.3.0`.

## What this patch does
- Provides a one-liner script that updates your `package.json` to use a **safe** version range: `^6`.
- Gives you copy/paste instructions in case you prefer to edit manually.

## Why `^6`?
Netlify’s current runtime supports `@netlify/blobs` v6+. Using `^6` lets npm pick a published 6.x version and avoids pinning a non-existent 5.3.0.

## How to apply

### Option A — Quick edit (recommended)
Open your repo’s **package.json** and change the dependency line for `@netlify/blobs` to:
```json
"@netlify/blobs": "^6"
```
Then redeploy.

### Option B — Run the helper script locally
1) Save this repo patch in your project root.
2) Run:
```bash
bash netlify/fix-blobs-version.sh
```
This uses `jq` if available, or falls back to `sed`, to replace the version in place.

### Verify
- Ensure `netlify.toml` includes:
```toml
[functions]
  node_bundler = "esbuild"
  external_node_modules = ["@netlify/blobs", "csv-parse"]
```
- Re-run your Netlify deploy.

### Sanity check URLs (bgroundrobin.com)
- Status: https://bgroundrobin.com/.netlify/functions/odds-status
- Schedule: https://bgroundrobin.com/.netlify/functions/nfl-schedule-get?force=1
- Train all years: https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
- Train 2025: https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
- Generate: https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

If you still see dependency errors after this, paste the new log and I’ll adjust. 
