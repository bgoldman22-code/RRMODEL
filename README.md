
# RRModel Netlify NFL Patch (vNEXT)

## What this fixes
- Uses `@netlify/blobs@^6` (existing ^5.3.0 pin caused ETARGET).
- Removes top-level await in blobs helper (ESM/CJS bundling errors).
- Provides CommonJS `odds-status/index.cjs` to avoid ESM "require" crash.
- Adds a safe build step that always creates `dist/` so your site won't 404 if there's no frontend build.
- `nfl-train` now fetches a single canonical CSV (`nflverse/nfldata/data/games.csv`) and filters by `years`.
- `nfl-predictions-generate` loads `team_form.json` from Blobs (store = `BLOBS_STORE_NFL || BLOBS_STORE || "nfl-td"`). If missing, returns empty rows (no crash).

## Drop-in steps
1. Copy `netlify/functions/_lib/blobs-helper.mjs` into your repo (replace if present).
2. Copy `netlify/functions/odds-status/index.cjs` and **remove/rename** any `odds-status.mjs`.
3. Copy `netlify/functions/nfl-train/index.mjs` (replace or add).
4. Copy `netlify/functions/nfl-predictions-generate/index.mjs` (replace or add).
5. Ensure `package.json` has:
   ```json
   { "type": "module", "scripts": { "build": "node netlify/build-debug.js" }, "dependencies": { "@netlify/blobs": "^6", "csv-parse": "^5" } }
   ```
   Merge instead of overwriting if you have a real frontend build.
6. Ensure `netlify.toml` (or UI) has:
   ```toml
   [build]
     command = "node netlify/build-debug.js"
     publish = "dist"

   [functions]
     node_bundler = "esbuild"
     external_node_modules = ["@netlify/blobs", "csv-parse"]
   ```

## Environment
- `BLOBS_STORE_NFL` (optional) – preferred store name. **Default fallback:** `nfl-td`.
- `BLOBS_STORE` (optional) – secondary fallback.

## Debug URLs (bgroundrobin.com)
- Status: https://bgroundrobin.com/.netlify/functions/odds-status
- Schedule: https://bgroundrobin.com/.netlify/functions/nfl-schedule-get?force=1
- Train (all): https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
- Train (2025): https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
- Generate: https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

## Notes
- If `odds-status` shows `"hasTeamForm": false`, run a train URL. If `persisted:false` with a message about `@netlify/blobs not available`, ensure dependency is in package.json and Netlify functions are bundled with `external_node_modules = ["@netlify/blobs"]`.
