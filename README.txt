# patch-step3w-footballguys-import

Temporary importer that scrapes the Footballguys public depth chart page into the same
QB/RB/WR/TE JSON your TD model expects.

## Files
- netlify/functions/nfl-depthcharts-import-footballguys/index.cjs

## Use
- /.netlify/functions/nfl-depthcharts-import-footballguys?season=2025&week=2
  => writes depth/{season}/week{week}/depth-charts.json in your blobs store

Then run the model:
- /.netlify/functions/nfl-td-model?season=2025&week=2

This is a stopgap until dynamic usage-based depth charts are available.
