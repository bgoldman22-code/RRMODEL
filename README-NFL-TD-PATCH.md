# NFL Anytime TD — Patch v1

This patch adds a complete, isolated NFL Anytime TD pipeline that plugs into your existing site.

## What’s included
- `netlify/functions/nfl-td-model/index.cjs` — core two-path model
- `netlify/functions/nfl-td-predictions/index.mjs` — API endpoint that builds + caches predictions to Netlify Blobs
- `src/pages/NflTd.jsx` — frontend page with week selector + 3 views
- `src/components/NflTdTable.jsx` — minimal table component

## Requirements
- `netlify.toml` already has `BLOBS_STORE_NFL = "nfl-td"` and `NFL_ODDS_BRIDGE_URL`, which we do **not** call yet (odds-agnostic to conserve credits).
- Depth charts & recent history written by your ETL to Blobs at:
  - `history/{season}/week{week}/depth-charts.json` (or `_data/nfl/{season}/week{week}/depth-charts.json`)
  - `history/{season}/recent-weeks.json` (or `_data/history/{season}/weekly-last3.json`)

## Deploy
1. Copy these files into the repo at the same paths.
2. Deploy to Netlify.
3. Visit `/nfl` (alias) or the route that renders `NflTd.jsx` to view the model output.

## Next steps
- Hook in odds cache (one write per week) into `getOddsIndex` using your `nfl-odds-get` function to remain under credits.
- Feed opponent RZ defense & explosive allowed into the `context` object from your ETL.
