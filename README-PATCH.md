# NFL Predictions Patch

This patch adds:
- `netlify/functions/nfl-odds-get` — Odds proxy/normalizer for The Odds API.
- `netlify/functions/nfl-predictions-get` — Builds transparent picks + a 3–5 leg parlay.
- UI: `site/src/pages/NFL_Predictions.jsx` (React) and a static fallback at `site/public/nfl/predictions/index.html` with a **Generate Latest** button.

## Env vars
Add these in Netlify → Site settings → Environment variables:

- `ODDS_API_KEY` **(required)** — your The Odds API key.

You DO NOT need `ODDSAPI_MARKET_NFL` for these functions.

## Deploy
1. Unzip this at the root of your repo (it contains the `netlify/` and `site/` subfolders).
2. Commit and deploy.
3. Test endpoints:
   - `/.netlify/functions/nfl-odds-get`
   - `/.netlify/functions/nfl-predictions-get`
4. UI:
   - If your React router auto-mounts `site/src/pages`, add a route to `NFL_Predictions`.
   - Otherwise, you can hit the static page at `/nfl/predictions/`.

## Notes
- The model is rule-based and uses consensus pricing across books. It's designed to be explainable and fast.
- Upgrade later with injuries/weather by extending `nfl-predictions-get` (left as TODO hooks).
