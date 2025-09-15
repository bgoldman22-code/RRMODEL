# RRModel NFL – Patch (main31 fixes)

## What this fixes
- ESM/CJS errors (`require() of ES Module ... .mjs`) by adding CJS wrappers where needed.
- Removes top-level `await` from `blobs-helper.mjs` (lazy import now).
- Adds `package.json` with `build` script and installs deps (`@netlify/blobs`, `csv-parse`).
- Ensures Netlify has a `dist/` to publish.
- Makes `BLOBS_STORE_NFL` fallback `"nfl-td"` everywhere.

## Files in this patch
- `package.json`
- `netlify/build-debug.sh`
- `netlify.toml`
- `netlify/functions/_blobs.cjs`
- `netlify/functions/_lib/blobs-helper.mjs`
- `netlify/functions/odds-status/index.cjs`
- `netlify/functions/nfl-train/index.mjs`

## Replace / Remove
- **Remove or rename** `netlify/functions/odds-status/handler.mjs` (old) if present.
- Ensure no duplicate `odds-status.mjs` in `netlify/functions/` root.

## ENV
- `BLOBS_STORE_NFL` (fallbacks to `nfl-td`).
- Optional (local-only): `NETLIFY_SITE_ID`, `NETLIFY_BLOBS_TOKEN` for direct client.

## Sanity URLs (copy/paste for bgroundrobin.com)
- Status: https://bgroundrobin.com/.netlify/functions/odds-status
- Get schedule (odds fallback): https://bgroundrobin.com/.netlify/functions/nfl-schedule-get?force=1
- Train from multiple years and write to blobs (set `force=1` to write):
  - https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
  - Single year: https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
- Generate predictions:
  - https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

> Note: `nfl-train` now tries several known NFLVerse locations and a whole-corpus fallback. You will no longer see a bogus `2016.csv.gz` URL.
