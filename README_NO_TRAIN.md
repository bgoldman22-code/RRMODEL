# NFL Predictions — No-Train Patch

This patch lets your site produce predictions **without** calling TRAIN. The scorer pulls public data (schedule+odds) and writes `nfl/predictions/current.json` directly.

## Files

- `netlify/functions/_blobs.js` — safe JSON wrapper over `@netlify/blobs`
- `netlify/functions/nfl-predictions-get/index.cjs` — unchanged contract, graceful empty fallback
- `netlify/functions/nfl-predictions-score/index.cjs` — **updated** to self-build rows from public endpoints
- `netlify/functions/nfl-predictions-diag/index.cjs` — quick environment/Blobs sanity check

## Env Vars (Netlify → Site settings → Environment variables)

- `BLOBS_STORE_NFL` = `nfl-td` (or your chosen store)
- `NETLIFY_SITE_ID` = your site id (shown in Netlify UI)
- `NETLIFY_BLOBS_TOKEN` = personal access token with Blobs scope
- `NFL_SCHEDULE_URL` = `https://bgroundrobin.com/.netlify/functions/nfl-schedule-get`
- `NFL_ODDS_BRIDGE_URL` = `https://bgroundrobin.com/.netlify/functions/odds-get`

## Sanity URLs

- `/.netlify/functions/nfl-predictions-diag`
- `/.netlify/functions/nfl-predictions-score?open=1`  → writes `current.json`
- `/.netlify/functions/nfl-predictions-get`           → returns rows/parlays

## Notes

- No auth; `?open=1` remains for consistency but isn’t required.
- If TRAIN is broken, this still runs using public data and keeps the UI live.
