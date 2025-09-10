# RRModel Depth Charts Patch (2025 Week 2)

Files included:
- `netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week2/depth-charts.json`
- `netlify/functions/nfl-depthcharts-get/_data/nfl/current.json`

## Sanity tests (paste in browser console after deploy)
```js
(async () => {
  const urls = [
    "https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get?season=2025&week=2",
    "https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get"
  ];
  for (const u of urls) {
    const data = await fetch(u).then(r => r.json());
    const charts = data.charts ?? data; // support both shapes
    console.log("\n===", u, "===");
    console.log("SEA.WR:", charts.SEA?.WR);
    console.log("PIT.WR:", charts.PIT?.WR);
    console.log("NE.WR :", charts.NE?.WR);
    // assertions
    const has = (arr, name) => Array.isArray(arr) && arr.includes(name);
    console.log("Expect SEA.WR has Cooper Kupp:", has(charts.SEA?.WR, "Cooper Kupp"));
    console.log("Expect SEA.WR NOT have DK Metcalf:", !has(charts.SEA?.WR, "DK Metcalf"));
    console.log("Expect PIT.WR has DK Metcalf:", has(charts.PIT?.WR, "DK Metcalf"));
    console.log("Expect NE.WR has Stefon Diggs:", has(charts.NE?.WR, "Stefon Diggs"));
  }
})();
```
Generated: 2025-09-10T17:24:24.455629Z
