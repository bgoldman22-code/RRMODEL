# Multi-season team form builder

This script builds `public/nflverse-team-form.json` from NFLVerse PBP for multiple seasons (last 3 + current by default).

## Usage

```bash
# default: last 3 full seasons + current YTD
node scripts/build-team-form.js

# explicitly choose seasons (comma separated)
node scripts/build-team-form.js --seasons=2022,2023,2024,2025

# tune decay (per game back) and number of recent games for decayed metrics
node scripts/build-team-form.js --decay=0.7 --recentGames=6
```

The output file is committed as part of your deploy, so your Netlify function can read:
`/nflverse-team-form.json`.
