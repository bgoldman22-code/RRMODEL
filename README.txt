# patch-step3u-dynamic-depthcharts

Creates dynamic, usage-based depth charts from your nfl-data-py history blobs.

## Files
- netlify/functions/nfl-depthcharts-build-dynamic/index.cjs

## Requires blobs (populated by your Mon/Tue GitHub Action):
- history/{SEASON}/weekly-last3.json
- history/{SEASON}/pbp-last3.json

## Run
/.netlify/functions/nfl-depthcharts-build-dynamic?season=2025&week=2&lookback=5

Writes to:
depth/{SEASON}/week{WEEK}/depth-charts.json

Then your TD model can read that path.
