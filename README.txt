# patch-step3o-depthcharts-public

Adds a public-source importer that tries **FantasyPros** first, then **ESPN** as a fallback.
Saves normalized RB/WR/TE/QB groups with inferred shares into your NFL blobs.

## File
- netlify/functions/nfl-depthcharts-import-public/index.cjs

## Use
```
/.netlify/functions/nfl-depthcharts-import-public?season=2025&week=2
```
Output includes the source used (`FantasyPros` or `ESPN`) and a sample team.

## Tip
You can keep your 11:30 AM ET cron and simply change the scheduled function name to:
```
[[scheduled.functions]]
name = "nfl-depthcharts-import-public"
cron = "30 15 * * *"
```
