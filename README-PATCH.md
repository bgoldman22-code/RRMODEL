# Patch: Ephemeral Predictions + Blobs Version Fix

**What this does**
- Makes `nfl-predictions-generate` work even if Netlify Blobs is unavailable.
- If `team_form.json` exists in Blobs it is used; otherwise it computes **ephemerally** from NFLVerse `games.csv` (no write).
- Bumps `@netlify/blobs` to `^6.0.1` to resolve ETARGET.
- Converts build script to ESM and adds a simple `dist/index.html` to stop 404.

**Files included (upload exactly into your repo paths):**
- `package.json`
- `netlify/functions/_lib/blobs-helper.mjs`
- `netlify/functions/nfl-predictions-generate/index.mjs`
- `netlify/build-debug.js`
- `netlify.toml`
- `dist/index.html`

**Sanity URLs (copy/paste):**
- https://bgroundrobin.com/.netlify/functions/odds-status
- https://bgroundrobin.com/.netlify/functions/nfl-schedule-get?force=1
- https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
- https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
- https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

**Notes**
- Ephemeral mode sets spread/total to “–” until Blobs-backed features are present.
- Once Blobs is configured, rerun train and predictions will use saved `team_form.json` automatically.
