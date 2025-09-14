# Environment variables (sample)

# Core
BLOBS_STORE_NFL=nfl-td

# Netlify Blobs manual auth (set in Site settings > Environment variables)
# NETLIFY_SITE_ID=your-site-id
# NETLIFY_API_TOKEN=your-personal-access-token

# TheOddsAPI
# ODDS_API_KEY=your-theoddsapi-key
ODDS_REGION=us
ODDS_BOOKMAKER=fanduel
ODDS_MARKETS=h2h,spreads,totals
ODDS_TTL_SECONDS=120

# Endpoints (can be bare names, absolute paths, or full URLs)
NFL_SCHEDULE_URL=nfl-schedule-get
NFL_ODDS_BRIDGE_URL=nfl-odds-bridge
NFLVERSE_PBP_URL=/nflverse-team-form.json
