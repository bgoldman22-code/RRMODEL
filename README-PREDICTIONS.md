# NFL Predictions — Auto Ingest (Phase 1)

This patch adds:
- A Netlify function `nfl-predictions-get` that serves predictions from repo files.
- A GitHub Action that runs Tue + Fri mornings to build predictions using your schedule/odds APIs.
- A `/site/predictions.html` page and `/public/js/predictions.js` to render picks + parlays.

## What you need to configure

### 1) Secrets (in GitHub -> Settings -> Secrets and variables -> Actions)

- `SCHEDULE_API_ROOT` **(required)**  
  Example: `https://bgroundrobin.com/.netlify/functions/nfl-schedule-get`

- `ODDS_API_URL` *(required for live picks)*  
  Your working odds endpoint. The pipeline passes `season` + `week` as query params. It should return a list of games with moneyline/spread/total fields. Minimal expected keys per game:
  - `game_id` (preferred) or `home`+`away`
  - `ml_home` / `ml_away` (American odds, e.g. `-160`, `+145`)
  - `spread` (negative favors home), `total` (over/under number)

- `ODDS_API_KEY` *(optional)* bearer token

- `WEATHER_API_URL`, `INJURY_API_URL` *(optional placeholders — not used yet in Phase 1)*

### 2) Deploy

- Commit & push this patch.
- Netlify will include `netlify/functions/nfl-predictions-get/_data/**` in the function bundle automatically.
- The Action will run Tue + Fri 10:30 UTC (and can be run on-demand via “Run workflow”).

### 3) Browse

- Open `/site/predictions.html` after deploy.  
- Or call the function directly: `/.netlify/functions/nfl-predictions-get`

### Notes

- Phase 1 is **baseline**: schedule + odds → structured predictions JSON + simple parlay suggestions.
- Phase 2 will add historical features + ML training on GitHub Actions (scikit-learn) and injury/weather enrichments.
