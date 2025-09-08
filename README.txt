# patch-step2e-use-nfl-td-store

**NFL is fully isolated from MLB.** All schedule reads/writes use the dedicated store:
- Env var: `BLOBS_STORE_NFL` (you already set this to `nfl-td`)
- Key: `schedules/2025/full.json`

## Files
- netlify/functions/nfl-schedule-import-sportsblaze/index.cjs
- netlify/functions/nfl-schedule-local/index.cjs
- netlify/functions/nfl-week-local/index.cjs
- netlify/functions/nfl-td-candidates-local/index.cjs

## How it works
- Importer fetches the full season from SportsBlaze and writes to Blobs:
  store = getStore({ name: process.env.BLOBS_STORE_NFL || 'nfl-td', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN })
  key   = `schedules/${season}/full.json`

- Readers load from the same store/key, then fall back to:
  1) repo override: netlify/data/nfl/<season>/schedule.full.json
  2) function-local _data/schedule.json

## Deploy
1) Drop this folder into your repo root and commit.
2) Clear cache and deploy on Netlify.
3) Ensure env vars exist:
   - BLOBS_STORE_NFL = nfl-td   (already set)
   - SPORTS_BLAZE_KEY = <your key>
   - (optional) SITE_ID and NETLIFY_API_TOKEN if Blobs require manual auth

## Import once
/.netlify/functions/nfl-schedule-import-sportsblaze?season=2025

## Sanity tests
/.netlify/functions/nfl-schedule-local?week=1
/.netlify/functions/nfl-week-local?week=auto
/.netlify/functions/nfl-td-candidates-local?week=2
