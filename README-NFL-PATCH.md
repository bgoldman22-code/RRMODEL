# RR NFL Blobs Fallback Patch

This small patch makes the NFL functions resilient when the Netlify Blobs
automatic context isn't injected into your functions (the root cause of
`MissingBlobsEnvironmentError`).

## What changed
- Added `netlify/functions/_blobs.js` helper that:
  - tries automatic context first,
  - falls back to manual mode if `NETLIFY_SITE_ID` and `NETLIFY_API_TOKEN` are present,
  - otherwise returns a helpful diagnostic JSON.
- Removed any `node-fetch` usage (Netlify provides global `fetch`).

## Required env vars
- **BLOBS_STORE_NFL** = `site:nfl-td`  (recommended exact value)
  - We also accept `BLOBS_STORE`. If neither is provided, default is `site:nfl-td`.

### Optional (only if automatic context still missing)
- **NETLIFY_SITE_ID** = your site ID (Netlify UI → Site settings → Site details)
- **NETLIFY_API_TOKEN** = a personal access token with *Blobs* scope

With those two present, the functions will work even if the Blobs extension
hasn't injected context into the runtime yet.

## Sanity URLs
- `/._netlify/functions/nfl-bootstrap?debug=1` → shows `{ ok:true, hasSchedule, store }`
- `/._netlify/functions/nfl-td-candidates?debug=1` → shows `{ ok:true, diag:{...} }`
