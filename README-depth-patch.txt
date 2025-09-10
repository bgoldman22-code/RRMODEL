Depth chart patch (2025 week 2)

Files included (overwrite in your repo):
- netlify/functions/nfl-depthcharts-get/_data/nfl/current.json
- netlify/functions/nfl-depthcharts-get/_data/nfl/depth-charts.json
- netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week2/depth-charts.json
- netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week1/depth-charts.json

After committing, bump your function to force a fresh bundle. At the top of
the function handler add/modify a constant (any value change works):

  const BUNDLE_VERSION = "20250910184456"; // force new deploy

Also consider returning no-store headers from your function:
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"

Sanity test (DevTools Console) after deploy:
(async () => {
  const W2  = await fetch("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get?season=2025&week=2&cb="+Date.now()).then(r=>r.json());
  const CUR = await fetch("https://bgroundrobin.com/.netlify/functions/nfl-depthcharts-get?cb="+Date.now()).then(r=>r.json());
  const wantSEA = ["Jaxon Smith-Njigba","Cooper Kupp","Tory Horton","Cody White"];
  console.log("W2 SEA.WR:", W2?.SEA?.WR);
  console.log("CUR SEA.WR:", CUR?.SEA?.WR);
  console.log("OK SEA updated:", JSON.stringify(W2?.SEA?.WR)===JSON.stringify(wantSEA) && JSON.stringify(CUR?.SEA?.WR)===JSON.stringify(wantSEA));
})();
