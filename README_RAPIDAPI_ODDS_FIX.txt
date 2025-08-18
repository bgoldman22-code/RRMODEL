Fix: Use a NAMED Netlify Blobs store.

Add these env vars (Netlify → Site settings → Environment variables):

Required RapidAPI:
  RAPIDAPI_KEY=...your key...
  RAPIDAPI_HOST=therundown-therundown-v1.p.rapidapi.com
  RAPIDAPI_EVENTS_URL=https://therundown-therundown-v1.p.rapidapi.com/sports/MLB/events?date={DATE}
  RAPIDAPI_EVENT_PROPS_URL=https://therundown-therundown-v1.p.rapidapi.com/events/{EVENT_ID}/props?markets=batter_anytime_hr
  PROP_MARKET_KEY=batter_anytime_hr
  PROP_OUTCOME_FIELD=participant
Optional:
  BOOKS=fanduel,draftkings,betmgm,caesars
Blobs store (optional override):
  BLOBS_STORE=mlb-odds      # default used if not set

Endpoints:
  - Refresh odds: /.netlify/functions/odds-refresh-rapid
  - Read odds   : /.netlify/functions/odds-get

This version stores to: (store 'mlb-odds')
  latest.json
  YYYY-MM-DD.json

If you previously used the unnamed store with keys like 'odds/latest.json', update any consumers to call the function above (which abstracts the store paths).
