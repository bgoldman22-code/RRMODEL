# NFL Roster Updater — Daily + Gameday Bursts (Netlify Scheduled Functions)

This bundle adds **automatic daily roster updates** and **extra runs on gamedays** (for inactives/last-minute changes).

## Files
- `netlify/functions/_shared/rosters-shared.cjs` — common logic (providers, normalization, blobs write)
- `netlify/functions/nfl-rosters-daily.cjs` — runs **every day 13:00 UTC** (~09:00 ET)
- `netlify/functions/nfl-rosters-gameday-sun.cjs` — runs **every 30 min** on **Sundays 15–23 UTC** and **Mondays 0–3 UTC**
- `netlify/functions/nfl-rosters-gameday-thu.cjs` — runs **every 30 min** on **Thursdays 21–23 UTC** and **Fridays 0–3 UTC**
- `netlify/functions/nfl-rosters-gameday-mon.cjs` — runs **every 30 min** on **Mondays 22–23 UTC** and **Tuesdays 0–3 UTC**
- `netlify/functions/nfl-rosters-run.cjs` — **manual trigger**: GET `/.netlify/functions/nfl-rosters-run`

> All crons are **UTC**. Adjust windows if needed. During EDT (UTC−4), these cover inactives ~90 minutes before kick for TNF/SNF/MNF and most Sunday slates.

## Environment variables (Netlify → Site settings → Environment variables)
- `NFL_TD_BLOBS` (optional) — blobs store name (default: `nfl-td`)
- `NFL_ROSTERS_SOURCE` (optional) — `auto` (default), `espn`, or `fantasypros`
- `NFL_ROSTERS_FP_URL` (optional) — JSON endpoint with normalized charts if you host your own
- `NFL_ROSTER_OVERRIDES` (optional) — path to overrides file in repo (default `data/nfl-td/roster-overrides.json`)

## How the app reads fresh rosters
- Your existing `/.netlify/functions/nfl-data` serves **Blobs first** with repo fallback. These scheduled functions write `depth-charts.json` to Blobs, so `/nfl` will automatically pick up the latest charts on page load.

## Manual run
- Hit `/.netlify/functions/nfl-rosters-run` to force an update immediately (e.g., emergency trades/inactives).

## Notes
- Provider order: ESPN → FantasyPros (or reversed if you set `NFL_ROSTERS_SOURCE`). Falls back to repo if both unavailable.
- Overrides file lets you fix edge cases instantly (rookie wins job, mislabel, etc.).
