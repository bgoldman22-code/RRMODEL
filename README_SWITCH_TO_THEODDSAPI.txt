Switching to TheOddsAPI (step-by-step, super simple):

A) Add these environment variables in Netlify → Site settings → Environment variables
   (add one at a time; leave RapidAPI ones empty):

  1) THEODDS_API_KEY = <your TheOddsAPI key>
  2) PROP_MARKET_KEY = player_home_run     (you can change later if your account uses a different key)
  3) PROP_OUTCOME_FIELD = name             (TheOddsAPI uses 'name' for player name in outcomes)
  4) (Optional) ODDSAPI_SPORT_KEY = baseball_mlb
  5) (Optional) ODDSAPI_REGION = us
  6) (Optional) BOOKS = fanduel,draftkings,betmgm,caesars
  7) (Optional, only if Blobs isn't auto-enabled) NETLIFY_SITE_ID = <your site id>
  8) (Optional, only if Blobs isn't auto-enabled) NETLIFY_BLOBS_TOKEN = <a blobs token>
  9) (Optional) BLOBS_STORE = mlb-odds

  Leave these *blank* (not required for TheOddsAPI):
    RAPIDAPI_KEY, RAPIDAPI_HOST, RAPIDAPI_EVENTS_URL, RAPIDAPI_EVENT_PROPS_URL

B) Replace the two functions in your repo with the files in netlify/functions/ from this patch:
     - netlify/functions/odds-refresh-rapid.js
     - netlify/functions/odds-get.js

C) Deploy your site.

D) Visit this URL once to build today's snapshot:
     /.netlify/functions/odds-refresh-rapid

   If you see a message with "players": a number greater than 0 → success!
   If it says 204 or shows a helpful error → it didn't overwrite anything. Try again later or check credits.

E) Your page can read the snapshot at:
     /.netlify/functions/odds-get

That's all! You can still switch back to RapidAPI later by adding RAPIDAPI_* envs
and leaving THEODDS_API_KEY empty. The function detects which provider to use.
