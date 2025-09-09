
# Depth Charts Patch (Auto Rollover)

This patch contains:
- `netlify/functions/_data/nfl/2025/week1/depth-charts.json`
- `netlify/functions/_data/nfl/2025/week2/depth-charts.json`
- `netlify/functions/_data/nfl/2025/depth-charts.json` (master copy)
- `netlify/functions/_data/nfl/2025/current.json` (descriptor that points to current week path)
- `netlify/functions/nfl-depthcharts-rollover.cjs` (scheduled function that updates current.json to the highest available week in Blobs)

## Where to place
Merge the `netlify/` folder at the repo root (keep existing files).

## Notes
- Your existing `nfl-depthcharts-get` should read:
  - Blobs: `depth/season/2025/current.json` (to auto-target latest) OR explicit `weekN.json`
  - Local fallback: `netlify/functions/_data/nfl/2025/weekN/depth-charts.json`
- The JSON files contain only the `{ TEAM: {QB:[], RB:[], WR:[], TE:[]} }` mapping (no wrapper).

