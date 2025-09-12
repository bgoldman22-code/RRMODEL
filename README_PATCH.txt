NFL Predictions — LIVE Autobuild Patch
=====================================

What this patch does
--------------------
- Replaces the TRAIN step with a harmless endpoint (no secrets, no failure).
- Moves data ingestion + feature building into the SCORE endpoint so it can run on demand.
- Writes predictions to Netlify Blobs at `nfl/predictions/current.json`.
- GET endpoint reads the latest slate for your UI.

Files in this patch
-------------------
- netlify/functions/_blobs.js
- netlify/functions/nfl-predictions-train/index.cjs
- netlify/functions/nfl-predictions-score/index.cjs
- netlify/functions/nfl-predictions-get/index.cjs
- package.json (adds @netlify/blobs and node-fetch)

Required Netlify env vars
-------------------------
- ODDS_API_KEY = <your TheOddsAPI key>
- ODDSAPI_SPORT_NFL = americanfootball_nfl
- ODDSAPI_REGION_NFL = us
- ODDSAPI_BOOKMAKER_NFL = draftkings,betmgm,fanatics,fanduel,caesars   (optional)
- BLOBS_STORE_NFL = nfl-td  (must match _blobs.js)
- NETLIFY_BLOBS_TOKEN = <your token with Blobs RW>
- NETLIFY_SITE_ID = <your site id>

How to use (after deploy)
-------------------------
1) Kick off a build of predictions and cache to blobs:
   /.netlify/functions/nfl-predictions-score?open=1&autobuild=1

2) UI reads from:
   /.netlify/functions/nfl-predictions-get

Notes
-----
- NFLVerse/ESPN fetchers are stubbed with try/catch and won't break scoring if unavailable.
- You can iterate feature engineering inside `nfl-predictions-score/index.cjs` (decide()).