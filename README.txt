# patch-step3r-sportradar-weekly-importer

Adds a Netlify function to import weekly depth charts from Sportradar official API and normalize
into RB/WR/TE/QB arrays, saving to your NFL blobs.

## File
- netlify/functions/nfl-depthcharts-import-sportradar-weekly/index.cjs

## Env
- SPORTRADAR_API_KEY (required)
- SPORTRADAR_ACCESS_LEVEL=trial (default)
- SPORTRADAR_LANG=en (default)
- BLOBS_STORE_NFL (defaults to nfl-td), SITE_ID, NETLIFY_API_TOKEN or BLOBS_TOKEN

## Use
```
/.netlify/functions/nfl-depthcharts-import-sportradar-weekly?season=2025&week=1&stype=REG
```
Then run your model:
```
/.netlify/functions/nfl-td-model?season=2025&week=1
```
