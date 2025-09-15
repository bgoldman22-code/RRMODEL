# NFL Blobs explicit-client patch

This patch avoids both `context.blobs` **and** `getStore()` by using
`createClient({ siteID, token })` with credentials from env. It is NFL-only and does not touch MLB.

## Files
- `netlify/functions/_lib/blobs-explicit-nfl.js`
- `netlify/functions/odds-refresh/index.mjs`
- `netlify/functions/odds-status/index.mjs`
- `netlify/functions/nfl-predictions-generate/index.mjs`

## Required env vars (Netlify UI → Site settings → Environment)
- `SITE_ID` **or** `NETLIFY_SITE_ID` (your site ID)
- `NETLIFY_API_TOKEN` **or** `NETLIFY_BLOBS_TOKEN` (token with Blobs read/write)
- `BLOBS_STORE_NFL` (e.g., `nfl-td`)
- `ODDS_API_KEY` (TheOddsAPI)

## netlify.toml (keep simple)
```
[build]
  functions = "netlify/functions"
  publish   = "dist"

[functions]
  node_bundler = "esbuild"
  external_node_modules = ["@netlify/blobs"]

[build.environment]
  BLOBS_STORE_NFL        = "nfl-td"
  NFL_SCHEDULE_URL       = "nfl-schedule-get"
  NFL_ODDS_BRIDGE_URL    = "odds-get"
  NFLVERSE_TEAM_FORM_URL = "/nflverse-team-form.json"
  NODE_VERSION           = "20"
```

## Smoke test
- Seed odds: `/.netlify/functions/odds-refresh?week=1&bookmaker=fanduel`
- Status:    `/.netlify/functions/odds-status?week=1`
- Predict:   `/.netlify/functions/nfl-predictions-generate?season=2025&week=1`
