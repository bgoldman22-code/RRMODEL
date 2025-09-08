# patch-step3g-depthcharts-unified

Adds a single importer that supports either **Sportradar** (trial) or **RapidAPI Rolling Insights** depth charts and saves to your NFL Blobs store so the TD model can consume them.

## Files
- netlify/functions/_lib/common.cjs
- netlify/functions/nfl-depthcharts-import/index.cjs

## Env
- SPORTRADAR_API_KEY       = <your Sportradar key>
- SPORTRADAR_ACCESS_LEVEL  = trial   (default)
- SPORTRADAR_LANG          = en      (default)
- RAPIDAPI_KEY             = <your RapidAPI key>
- RAPIDAPI_HOST            = football-datafeeds-by-rolling-insights1.p.rapidapi.com

## Usage
Sportradar (REG Week 2):
```
/.netlify/functions/nfl-depthcharts-import?source=sportradar&season=2025&week=2
```
RapidAPI (single team):
```
/.netlify/functions/nfl-depthcharts-import?source=rapidapi&season=2025&week=2&team_id=28
```
RapidAPI (try many team ids 1..40 until they return data):
```
/.netlify/functions/nfl-depthcharts-import?source=rapidapi&season=2025&week=2
```

Saved to:
```
depth/{season}/week{week}/depth-charts.json
```

Then run the model:
```
/.netlify/functions/nfl-td-model?season=2025&week=2
```
