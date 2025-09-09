# Patch: nfl-depthcharts-seed writes full depth charts

- Replaces `netlify/functions/nfl-depthcharts-seed/index.cjs`
- When invoked, it writes the **full** depth charts JSON you provided to:
  - depth/season/{season}/week{week}.json
  - depth/season/{season}/current.json

## Deploy
Commit and deploy to Netlify.

## Run
Seed week 2 and current for 2025:
https://YOUR_SITE/.netlify/functions/nfl-depthcharts-seed?season=2025&week=2

Then verify:
https://YOUR_SITE/.netlify/functions/nfl-depthcharts-get?season=2025&week=2
