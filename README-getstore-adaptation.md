# NFL EPA predictions + TD model (getStore-compatible)

These two functions are adapted to your working helper `../_lib/blobs-nfl.js` (which uses Netlify `getStore()`), avoiding `createClient`.

Deploy steps:
1) Replace files at:
   - netlify/functions/nfl-predictions-generate/index.mjs
   - netlify/functions/nfl-td-predictions/index.mjs
2) Ensure env:
   - BLOBS_STORE_NFL, URL, NFL_SCHEDULE_URL, ODDS_API_KEY
3) Smoke-test:
   - /.netlify/functions/teamform-refresh?force=1
   - /.netlify/functions/odds-refresh?week=1&bookmaker=fanduel&force=1
   - /.netlify/functions/odds-status?week=1
   - /.netlify/functions/nfl-predictions-generate?season=2025&week=1
   - /.netlify/functions/nfl-td-predictions?season=2025&week=1&position=RB
