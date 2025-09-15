# NFL Full Sanity Patch

This patch fixes CommonJS/ESM interop, adds a robust Netlify Blobs helper with
graceful in-memory fallback, corrects nflfastR CSV URLs, and ensures the
predictions endpoint never crashes even when its ESM handler is missing.

## Files
- `netlify/functions/_lib/blobs-helper.mjs` — Netlify Blobs helper with memory fallback.
- `netlify/functions/nfl-train/index.cjs` — CJS bridge -> ESM handler.
- `netlify/functions/nfl-train/index.mjs` — Minimal resilient trainer; fetches
  `games_{year}.csv.gz` from nflfastR repo, builds a tiny `team_form` payload, and
  attempts to persist `team_form.json`.
- `netlify/functions/nfl-predictions-generate/index.cjs` — Safe bridge; uses ESM
  handler if present, otherwise returns a safe empty result (no crash).

## Use
1. Copy these files into your repo, preserving folder structure.
2. (Optional) Ensure `@netlify/blobs@^5` is installed for real persistence.
3. Call:
   - `/ .netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1`
   - `/ .netlify/functions/nfl-predictions-generate?force=1`

If Blobs is not configured on your site, the helper will log a warning and use
an in-memory store so you can still run end-to-end tests without crashes.
