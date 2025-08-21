# MLB HR Picks Logging (Drop-in)

This package adds **Netlify Blobs logging** for your MLB HR picks and two read APIs.

## Files
- `src/utils/hrLog.cjs` — helper for writing/listing/reading pick logs
- `netlify/functions/hr-picks-log.cjs` — returns last N days of logs
- `netlify/functions/hr-picks-by-date.cjs` — returns a single day by `?date=YYYY-MM-DD`

## Install
1. Copy the folders into your repo (preserving paths).
2. Ensure dependency in `package.json`:
   ```json
   {
     "dependencies": {
       "@netlify/blobs": "^6.4.0"
     }
   }
   ```

## How to write logs
Call `writeDailyPicks(payload, new Date(), -240)` **after you finalize your picks** (EDT offset shown).
`payload` shape example:
```json
{
  "date_key": "mlb-hr/logs/2025-08-20.json",
  "date_et": "2025-08-20T10:31:12.345Z",
  "league_hr_total": 27,
  "picks": [{ "player": "Kyle Schwarber", "game": "SEA@PHI", "model_hrp": 0.395, "american": 230, "why": "..." }],
  "diagnostics": { "usingOddsApi": false, "samples": 399, "days_lookback": 7, "version": "v1.0-log" }
}
```

## Read APIs
- Last 7 days (default): `/.netlify/functions/hr-picks-log`
- Last N days: `/.netlify/functions/hr-picks-log?days=14`
- Single date: `/.netlify/functions/hr-picks-by-date?date=2025-08-20`

## Notes
- All files are **CommonJS (.cjs)** for your Netlify setup.
- Logging uses Netlify Blobs—no DB or servers needed.
- If you need me to wire the call into your generator, tell me the file path of the function that produces the final `picks` array and I’ll return a patched file.
