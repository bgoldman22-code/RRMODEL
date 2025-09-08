# patch-step2a-schedule-refresh

Adds a new Netlify Function: **nfl-schedule-refresh**

- Endpoint: `/.netlify/functions/nfl-schedule-refresh?season=2025&commit=true`
- It builds a combined `schedule.full.json` under `netlify/data/nfl/{season}/schedule.full.json`
- Right now the fetch is a stub (2 games per week). Replace `fetchStubSchedule()` with live NFL.com/NFL API calls.

## Usage
- Deploy and then hit:
  ```
  https://YOUR-SITE.netlify.app/.netlify/functions/nfl-schedule-refresh?season=2025&commit=true
  ```
- This will create/update `netlify/data/nfl/2025/schedule.full.json` in the build artifact (and because of included_files, it will be bundled).

Your existing functions (nfl-schedule-local, nfl-week-local, nfl-td-candidates-local) already prefer this override file if present.
