# Patch: Explicit Blobs store per NFL (no env vars)

- Uses `getStore('nfl-td')` explicitly in NFL functions.
- Does not read BLOBS_STORE / BLOBS_STORE_NFL, so MLB store remains untouched.
- Works in Netlify prod without tokens. (If running locally, you'd need `BLOBS_SITE_ID` and `BLOBS_TOKEN`.)

Endpoints to test after deploy:
- /.netlify/functions/nfl-depthcharts-seed?season=2025&week=1
- /.netlify/functions/nfl-depthcharts-get?season=2025&week=1