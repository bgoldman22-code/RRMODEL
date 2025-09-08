# patch-step3m-fantasypros-importer

Adds a Netlify function that scrapes FantasyPros NFL depth charts and saves normalized charts to your NFL blob store.

## Files
- netlify/functions/nfl-depthcharts-import-fantasypros/index.cjs

## Usage
```
/.netlify/functions/nfl-depthcharts-import-fantasypros?season=2025&week=2
```

This writes:
```
depth/{season}/week{week}/depth-charts.json
```

Then run your model:
```
/.netlify/functions/nfl-td-model?season=2025&week=2
```

## Scheduling
Add this to `netlify.toml` (UTC: 15:30 = 11:30 ET):
```
[[scheduled.functions]]
name = "nfl-depthcharts-import-fantasypros"
cron = "30 15 * * *"
```
