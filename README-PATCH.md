# OddsAPI Wiring Patch (NFL)

This patch wires **TheOddsAPI** into `odds-refresh` so you don't have to paste odds manually.
It caches to **Blobs** and joins by team pair (HOME-AWAY), so your schedule gameIds don't have to match OddsAPI ids.

## Files
- `netlify/functions/odds-refresh/index.mjs` — GET pulls NFL H2H moneylines from TheOddsAPI (US region, American format), writes `odds_week_<W>.json`. POST still supported.
- `netlify/functions/_lib/schedule-source.mjs` — When building schedules, joins odds from Blobs by `gameId` **or** `HOME-AWAY` pair.
- `netlify/functions/_lib/blobs.js` — JSON helpers.

## Usage
1) Set env var on Netlify: `THEODDSAPI_KEY` (or `ODDS_API_KEY`).
2) Cache odds for the week (single call, low credits):
```
GET /.netlify/functions/odds-refresh?week=1&bookmaker=fanduel
```
- Use `&force=1` to refresh the cache.
3) Predictions will now pick up odds via the schedule source without placeholders.

> Notes
- If your schedule already has `gameId`s, they'll still join if you later add `gameId` fields to cached rows. For now, pair-based join ensures a clean match.
- This fetch is **one** API call; keep it once per week to stay well under credit limits.
