# NFL Predictions — Diagnostics & Minimal Patch (for Gemini)

**Generated:** 2025-09-12T14:59:00.148724Z

## What’s happening now

### Symptoms seen in prod
- `/.netlify/functions/nfl-predictions-train?open=1` → **500 Internal Error** with Netlify error page (non‑JSON).
- `/.netlify/functions/nfl-predictions-score?open=1` → JSON error **"TypeError: Blobs is not a constructor"** (previous) and later **"store.put is not a function"**.
- `/.netlify/functions/nfl-predictions-get` → returns `{ ok:true, rows:[], source:"empty" }` (no data).
- UI sometimes flashes then disappears—likely because `rows` is empty or shape differs from the table’s expectations.

### Most likely root causes
1. **Incorrect Netlify Blobs API usage** in serverless functions.
   - `Blobs is not a constructor` indicates using a class instead of the official helper.
   - In Node functions, the correct API is `import { getStore } from '@netlify/blobs'` (ESM) or `const { getStore } = require('@netlify/blobs');` (CJS).
2. **Mismatched store helpers** across functions.
   - Some files used `.put` which **does not exist**; correct is `await store.set(key, value)` and `await store.get(key)`.
3. **Training/scoring contract mismatch**.
   - Scorer expects an artifact written by trainer (e.g., `nfl/predictions/artifacts/latest.json`) but trainer either fails or writes elsewhere.
4. **UI expects `rows` but gets none / wrong shape**, causing a blank table after mount.
5. **Optional**: unresolved alias import (`@/components/NFLPredictionsActions`) broke a previous deploy—ensure file exists or import with relative path.

## This patch contains

- `netlify/functions/_blobs.js` — Single, safe helper around **@netlify/blobs** with siteID/token fallback if needed.
- `netlify/functions/nfl-predictions-train/index.cjs` — Writes a **training artifact** to blobs. Supports `?open=1` (no secret) for one‑off backfills.
- `netlify/functions/nfl-predictions-score/index.cjs` — Reads the latest artifact, produces `current.json` under `nfl/predictions/current.json`.
- `netlify/functions/nfl-predictions-get/index.cjs` — Returns `current.json` or empty structure.
- `SANITY.md` — Copy‑paste console tests + curl scripts.
- `ENV.md` — Minimal envs to check.

> **Note:** This is intentionally minimal and self‑contained so Gemini can reason about the serverless layer without the React app.

## Expected blob keys

- Artifact (from trainer): `nfl/predictions/artifacts/latest.json`
- Current predictions (from scorer): `nfl/predictions/current.json`

## Minimal success path

1) **Train (temp open route)**  
`POST /.netlify/functions/nfl-predictions-train?open=1`  
→ `{ ok:true, wrote:"nfl/predictions/artifacts/latest.json", ... }`

2) **Score**  
`POST /.netlify/functions/nfl-predictions-score?open=1`  
→ `{ ok:true, scored:true, rows:[...] }` and writes `current.json`

3) **Get**  
`GET  /.netlify/functions/nfl-predictions-get`  
→ `{ ok:true, rows:[...], source:"blobs" }`

If (1) or (2) fails, (3) will continue to return `rows: []` and `source: "empty"`.

## Env to confirm (Netlify UI)
- `NETLIFY_SITE_ID` = your site’s UUID
- `NETLIFY_BLOBS_TOKEN` = personal access token or site token (only needed if automatic context not available)
- *(Optional override)* `BLOBS_STORE_NFL` (default: `rrmodelblobs`)

## Files below are CJS (Netlify Node Functions).

