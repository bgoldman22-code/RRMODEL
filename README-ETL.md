# NFL Advanced Metrics ETL & Predictor Integration

This patch adds:
- `scripts/etl-full.js` — nightly NFLverse PBP aggregation → `nfl/epa/latest.json`
- `scripts/etl-injuries.js` — injury snapshots → `nfl/injuries/latest.json`
- `netlify/functions/_lib/blobs-nfl.js` — blob readers and validators
- `netlify/functions/nfl-predictions-generate/index.mjs` — advanced predictor with tiered weights, injury adjustments, and HFA=0.018

## Schedules (GitHub Actions)
- Nightly Full ETL (stats + injuries): **03:30 AM ET** every day
- Daily Injury Refresh: **09:00 AM ET** every day
- Gameday Injury Refreshes:
  - **Thursday 07:00 PM ET**
  - **Sunday 11:00 AM ET**
  - **Sunday 03:00 PM ET**
  - **Sunday 07:30 PM ET**
  - **Monday 05:00 PM ET**

These are implemented in `.github/workflows/nfl-etl.yml` using UTC cron.
