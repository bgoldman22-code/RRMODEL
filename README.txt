# patch-step3d-depthcharts-sportsdataio

Adds an importer to pull NFL depth charts from **SportsDataIO Discovery Lab** and save them to your NFL Blobs store so the TD model can use them automatically.

## Files
- netlify/functions/_lib/common.cjs                         (shim if not already present)
- netlify/functions/nfl-depthcharts-import-sportsdataio/index.cjs

## Env
- SPORTSDATAIO_KEY = <your Discovery Lab key>
- BLOBS_STORE_NFL  = nfl-td   (already set)

## Usage
Import for a given week:
```
/.netlify/functions/nfl-depthcharts-import-sportsdataio?season=2025&week=2
```
If Discovery Lab provides a specific endpoint for your plan, pass it explicitly:
```
/.netlify/functions/nfl-depthcharts-import-sportsdataio?season=2025&week=2&url=https://your.discovery.lab/endpoint
```
The function saves to:
```
depth/{season}/week{week}/depth-charts.json
```

## Notes
- The importer is **defensive** and supports several common SportsDataIO shapes (flat array of players, or nested under Teams/Players). It converts depth order to sensible default shares when explicit usage fields are missing.
- If the payload contains usage stats (GoalLineCarries, RedZoneTargets, DeepTargets, QBRushTDs…), we convert those to **shares** automatically.
- After import, run your model:
```
/.netlify/functions/nfl-td-model?season=2025&week=2
```
