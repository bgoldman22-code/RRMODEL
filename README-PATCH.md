
# Netlify Blobs Binding Patch

## Why
You're seeing:
```
"error": "Cannot read properties of undefined (reading 'set')"
```
because `context.blobs` isn't bound. This patch:
1) Adds a clear guard/error in the helper.
2) Provides a ready-to-paste `netlify.toml` block to bind Blobs.

## Files
- `netlify/functions/_lib/blobs.js` — updated with guard and helpful error.
- `ADD-TO-netlify.toml.txt` — paste this block into your existing `netlify.toml`.

## Steps
1) Replace your helper at `netlify/functions/_lib/blobs.js` with this one.
2) Open `netlify.toml` and paste the contents of `ADD-TO-netlify.toml.txt` (merge with your existing config).
3) Ensure env var `ODDS_API_KEY` (or `THEODDSAPI_KEY`) is set.
4) Redeploy.

## Smoke test URLs
- Seed/cache odds (one call per week):
  - `https://bgroundrobin.com/.netlify/functions/odds-refresh?week=1&bookmaker=fanduel`
  - Force refresh: `...&force=1`
- Status:
  - `https://bgroundrobin.com/.netlify/functions/odds-status?week=1`
- Predictions:
  - `https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025&week=1`

If you bind additional functions that touch Blobs, add more `[[functions.blobs]]` entries with the same `name = "nfl-td"` (or your chosen store name).
