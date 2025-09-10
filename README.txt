Depth Chart Patch (all common paths)

This patch writes your updated 32-team depth chart JSON into all common locations
found in your repo, so any function or static import picks it up:

- netlify/functions/nfl-depthcharts-get/_data/nfl/current.json
- netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week1/depth-charts.json
- netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week2/depth-charts.json
- netlify/functions/nfl-depthcharts-dbg/_data/nfl/current.json
- netlify/functions/nfl-depthcharts-dbg/_data/nfl/2025/week1/depth-charts.json
- netlify/functions/nfl-depthcharts-dbg/_data/nfl/2025/week2/depth-charts.json
- public/data/nfl/current.json
- public/data/nfl/2025/week2/depth-charts.json
- src/data/nfl/current.json
- src/data/nfl/2025/week2/depth-charts.json

After committing to GitHub and deploying to Netlify, sanity checks:

1) Week 2 (should show SEA with Cooper Kupp & PIT with DK Metcalf)
fetch("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get?season=2025&week=2")
  .then(r => r.json())
  .then(j => console.log("SEA WR:", j.SEA.WR, "PIT WR:", j.PIT.WR));

2) Current
fetch("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get")
  .then(r => r.json())
  .then(j => console.log("SEA WR:", j.SEA.WR, "PIT WR:", j.PIT.WR));

If you still run Blobs seed:
fetch("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-seed?season=2025&week=2", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify(%DEPTH_JSON%)
})
.then(r => r.json()).then(console.log);