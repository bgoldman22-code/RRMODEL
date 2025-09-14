# NFL Odds Bridge Environment (no secrets here)

Required (set in Netlify UI):
- `ODDS_API_KEY` – your TheOddsAPI key

Optional:
- `ODDS_REGION` (default: `us`)
- `ODDS_BOOKMAKER` (default: `fanduel`)
- `ODDS_MARKETS` (default: `h2h,spreads,totals`)
- `ODDS_DAYS_FROM` (default: `7`)
- `ODDS_TTL_SECONDS` (default: `120`)
- `BLOBS_STORE_NFL` (default: `nfl-td`)
- `NETLIFY_SITE_ID` and `NETLIFY_API_TOKEN` (only if your functions need manual Blobs auth)

> Do NOT commit actual secret values to the repo.
