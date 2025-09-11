# Depth charts bundle patch

This folder contains bundled JSON fallbacks used by the function
`netlify/functions/nfl-depthcharts-get/index.cjs` when blobs are not
available. Update these weekly and commit.

Files:
- _data/nfl/current.json
- _data/nfl/depth-charts.json (generic fallback)
- _data/nfl/2025/week1/depth-charts.json
- _data/nfl/2025/week2/depth-charts.json

Each file has the shape:
{
  "ok": true,
  "season": 2025,
  "week": 2,   // only in the weekly files
  "charts": { ... 32 teams ... }
}
