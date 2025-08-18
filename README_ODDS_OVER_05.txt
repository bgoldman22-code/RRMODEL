# Odds Over 0.5 HR Patch

This patch switches the odds refresh to use TheOddsAPI's **batter_home_runs** market and records **Over 0.5** outcomes only (a workable proxy for "Anytime HR").

## Files
- netlify/functions/odds-refresh-rapid.js  ← drop-in replacement
- netlify/functions/odds-get.js            ← unchanged API shape for your frontend

## Env (Netlify → Site settings → Environment variables), then redeploy
- PROVIDER = theoddsapi
- THEODDS_API_KEY = <your key>
- ODDSAPI_SPORT_KEY = baseball_mlb
- ODDSAPI_REGION = us
- PROP_MARKET_KEY = batter_home_runs
- PROP_OUTCOME_PLAYER_FIELDS = description,participant,name   (optional; order to search for player field)
- BOOKS = (leave blank at first to discover all)
- BACKOFF_MS = 500,1000           (optional; faster retries)
- (If Blobs not auto-enabled): NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN, optional BLOBS_STORE=mlb-odds

## Test
- Refresh (short retries + debug):
  /.netlify/functions/odds-refresh-rapid?quick=1&debug=1
- Read snapshot:
  /.netlify/functions/odds-get

If refresh returns 204, it means no Over 0.5 outcomes came back for the scanned events with your current provider/books. Clear BOOKS and retry, or try a bit later in the morning when props populate.
