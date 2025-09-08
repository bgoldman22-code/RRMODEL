# patch-step2c-import-sportsblaze

Adds a Netlify Function that imports the **full NFL season** from SportsBlaze and stores it in **Netlify Blobs** where your readers already look.

## Files
- netlify/functions/nfl-schedule-import-sportsblaze/index.cjs

## Prereqs
- Netlify env var: `SPORTS_BLAZE_KEY`

## Use
1) Commit this patch to your repo.
2) Trigger **Clear cache and deploy** on Netlify.
3) Hit:
   /.netlify/functions/nfl-schedule-import-sportsblaze?season=2025

Expected response:
```json
{ "ok": true, "season": 2025, "blobKey": "2025/full.json", "counts": { "1": 16, "2": 16, ... } }
```

Your existing endpoints:
- /.netlify/functions/nfl-schedule-local?week=2
- /.netlify/functions/nfl-week-local?week=auto
- /.netlify/functions/nfl-td-candidates-local?week=2
will now serve from the imported season (Blobs) without code changes.

## Optional (cron refresh)
If your plan supports scheduled functions, add to `netlify.toml`:
```
[[scheduled.functions]]
name = "nfl-schedule-import-sportsblaze"
cron = "0 14 * * 2" # Tuesdays 10:00 ET
```
