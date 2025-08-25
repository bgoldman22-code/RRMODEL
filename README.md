# NFL Patch (SportsDataIO-powered)

What’s inside:
- `nfl-bootstrap.mjs`: pulls the week schedule from ESPN (dates window), writes to Blobs **if available**, but works without Blobs too.
- `nfl-td-candidates.mjs`: merges schedule + SportsDataIO depth charts to produce named Anytime TD candidates (RB/WR/TE priority).
- `nfl-weekly-roll.mjs`: scheduled function to roll forward weekly schedule each Tuesday 1am ET (approx, via cron at 06:00 UTC).

## Env Vars
- `SPORTSDATA_API_KEY` (required for player names/depth)
- `BLOBS_STORE_NFL` = `nfl-td` (optional, enables caching)
- `BLOBS_STORE` (optional fallback)

## Test URLs
- `/.netlify/functions/nfl-bootstrap?season=2025&week=1&mode=auto`
- `/.netlify/functions/nfl-td-candidates?season=2025&week=1`

Add `&noblobs=1` to bypass Blobs if your site doesn’t have it enabled.

Netlify Node 18+ exposes global `fetch` so no `node-fetch` is required.