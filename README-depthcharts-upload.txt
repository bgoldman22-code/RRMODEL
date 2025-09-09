NFL Depth Charts (Weeks 1 & 2 + current)
----------------------------------------
Upload these paths into your repo with the same structure:

  netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week1/depth-charts.json
  netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week2/depth-charts.json
  netlify/functions/nfl-depthcharts-get/_data/nfl/current.json

After committing, run the seed function to push to Blobs:
  /./netlify/functions/nfl-depthcharts-seed?season=2025&week=1
  /./netlify/functions/nfl-depthcharts-seed?season=2025&week=2