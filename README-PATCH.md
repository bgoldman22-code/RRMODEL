# Fix: Netlify Blobs import error

This patch fixes the crash:
> `SyntaxError: The requested module '@netlify/blobs' does not provide an export named 'get'`

### What changed
- Replaced direct `import { get, put } from '@netlify/blobs'` with a **modern helper** that uses `createClient()`.
- Updated `odds-refresh` and `odds-status` to use the helper exclusively.

### Files
- `netlify/functions/_lib/blobs.js` — new helper (getJSON/setJSON + fallback)
- `netlify/functions/odds-refresh/index.mjs` — OddsAPI fetcher using helper
- `netlify/functions/odds-status/index.mjs` — status endpoint using helper

### Deploy & test
1) Deploy these files.
2) Seed odds (uses TheOddsAPI; set `THEODDSAPI_KEY` or `ODDS_API_KEY`):
```
GET /.netlify/functions/odds-refresh?week=1&bookmaker=fanduel
```
3) Status:
```
GET /.netlify/functions/odds-status?week=1
```
