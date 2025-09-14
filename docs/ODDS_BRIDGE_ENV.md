# NFL Odds Bridge (shared key)

Uses the same TheOddsAPI key you use for MLB:

```
ODDS_API_KEY=<your TheOddsAPI key>
```

Optional:
```
ODDS_REGION=us
ODDS_BOOKMAKER=fanduel
ODDS_MARKETS=h2h,spreads,totals
ODDS_TTL_SECONDS=120
BLOBS_STORE_NFL=nfl-td
NETLIFY_SITE_ID=<site id>      # if Blobs context isn't injected
NETLIFY_API_TOKEN=<>
```

Point your generator at it:
```
NFL_ODDS_BRIDGE_URL = nfl-odds-bridge
```
