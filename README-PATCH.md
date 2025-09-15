# NFL Blobs (getStore) Patch

This patch switches NFL functions to use Netlify's official Blobs API:
`import { getStore } from '@netlify/blobs'`, scoped ONLY to the NFL store
name `BLOBS_STORE_NFL` (default "nfl-td"). MLB remains untouched.

## Files
- `netlify/functions/_lib/blobs-nfl.js` – NFL-only helper
- `netlify/functions/odds-refresh/index.mjs` – uses helper
- `netlify/functions/odds-status/index.mjs` – uses helper

## Netlify config
Keep your existing `netlify.toml` (no [[functions.blobs]] blocks). Ensure:
- `BLOBS_STORE_NFL` (and your MLB `BLOBS_STORE`) are set in env.
- `NODE_VERSION = "20"` in build env.

## Smoke test
- Seed/cache odds:
  `/.netlify/functions/odds-refresh?week=1&bookmaker=fanduel`
- Status:
  `/.netlify/functions/odds-status?week=1`
