# patch-step3a-td-model-infra

Adds:
1) **nfl-history-refresh** — pulls prior week's *final* games from SportsBlaze and saves to NFL Blobs store at `history/<season>/weekN.json`.
2) **nfl-td-model** — v1 Anytime TD model that uses:
   - Team baseline TD rates from saved history
   - Player red-zone/goal-line/deep threat shares from depth charts
   - Hooks to add weather, defensive matchup, pace (placeholders for now)
   - Fair odds + EV (if you pass offered odds)

## Files
- netlify/functions/_lib/common.cjs
- netlify/functions/nfl-history-refresh/index.cjs
- netlify/functions/nfl-td-model/index.cjs

## Env vars used
- BLOBS_STORE_NFL = nfl-td (already set)
- SPORTS_BLAZE_KEY = <your key> (used by history-refresh)

## Scheduled refresh (Mon & Tue @ 10:00 ET)
Add to `netlify.toml` if your plan supports scheduled functions:
```
[[scheduled.functions]]
name = "nfl-history-refresh"
cron = "0 14 * * 1,2"  # 10:00 ET on Monday & Tuesday
```
(14:00 UTC = 10:00 ET)

## APIs
- Import history (auto picks latest Final week):
  /.netlify/functions/nfl-history-refresh?season=2025
  Optional: &week=2 to force a specific week

- Run Anytime TD model (returns candidates with prob & fair odds):
  /.netlify/functions/nfl-td-model?season=2025&week=2

- Optional EV: pass a small JSON of offered odds (American):
  Example:
  /.netlify/functions/nfl-td-model?season=2025&week=2&odds={"NE:Rhamondre%20Stevenson":130,"MIA:Tyreek%20Hill":-110}
```

## Next steps (when ready)
- Plug in weather (Open-Meteo) and defensive matchup (EPA/allowed RZ rates) into `estimateGameFeatures()`.
- Replace team TD baselines with market-implied team totals when you wire in TheOddsAPI.
