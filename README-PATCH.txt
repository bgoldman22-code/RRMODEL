RRModel NFL Netlify Patch — CJS/ESM + Blobs + Build fixes

What this fixes
- CommonJS-in-ESM errors: renames/uses .cjs for CJS entry files.
- Removes top-level await in blobs-helper.mjs (uses dynamic import inside functions).
- Adds CJS wrappers for functions (odds-status, nfl-train) so esbuild bundles cleanly.
- Adds build script + build-debug.sh; always creates dist/ to satisfy publish.
- Blobs store fallback: BLOBS_STORE_NFL -> BLOBS_STORE -> nfl-td.

Files in this patch
- netlify/build-debug.sh
- netlify/functions/_lib/blobs-helper.mjs
- netlify/functions/_blobs.cjs
- netlify/functions/odds-status/index.cjs
- netlify/functions/odds-status/handler.mjs
- netlify/functions/nfl-train/index.cjs
- netlify/functions/nfl-train/handler.mjs
- netlify/functions/odds-diag.cjs
- netlify.toml
- package.json

Instructions
1) Drop this entire folder into your repo, preserving paths. If a file already exists, overwrite it.
   - Specifically replace any single-file odds-status.mjs with the new folder-based odds-status (index.cjs + handler.mjs).
2) Commit & deploy.

Post-deploy copy/paste sanity URLs (your domain hardcoded):
- Odds status: https://bgroundrobin.com/.netlify/functions/odds-status
- Train single year: https://bgroundrobin.com/.netlify/functions/nfl-train?years=2025&force=1
- Train multi-year: https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
- Generate: https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

Notes
- The trainer uses a lightweight nflverse CSV path: https://raw.githubusercontent.com/nflverse/nflverse-data/master/fastR/roster_games/games_<YEAR>.csv
  Adjust in nfl-train/handler.mjs if you prefer a different source.
