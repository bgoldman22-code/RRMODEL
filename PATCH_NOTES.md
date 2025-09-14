# RRModel – Crash guard + Blobs import fix + Table columns

**Date:** 2025-09-14T04:38:05.762335Z

## What changed
- Netlify Blobs helper (netlify/functions/_lib/blobs-helper.mjs): removed deprecated createClient import, now uses getStore; safe getJSON/setJSON with logging.
- HTTP helpers (netlify/functions/_lib/http.cjs): ok/badRequest/internalError with CORS.
- Logger (netlify/functions/_lib/logger.cjs): structured logs; enable verbose with ?log=debug.
- nfl-predictions-generate (netlify/functions/nfl-predictions-generate/index.cjs): wrapped in try/catch, fixes 'rows is not defined', removes invalid finally, logs row count and preview.
- Frontend table (src/components/NFLPredictionsTable.jsx): columns for Matchup, Kickoff, Moneyline+Confidence, Spread+Confidence, Total+Confidence.

## Sanity checks (after deploy)
- /.netlify/functions/nfl-predictions-generate
- /.netlify/functions/nfl-predictions-generate?log=debug
- /.netlify/functions/nfl-predictions-generate?limit=5&log=debug

## Wiring tips
Import the new table component and render with the function output rows.
