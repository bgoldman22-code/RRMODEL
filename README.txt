NFL Depth Charts — FantasyPros CSV Import Function
======================================================

What this is
------------
A Netlify Function that ingests a FantasyPros depth chart CSV and writes
normalized depth charts into your Netlify Blobs store so the rest of your
Anytime TD pipeline can read them.

Files included
--------------
- netlify/functions/nfl-depthcharts-import-fantasypros/index.cjs

How to use
----------
1) Deploy the function (unzip at repo root, commit, redeploy).
2) POST your FantasyPros CSV to the function:

   curl -X POST \
     -H "Content-Type: text/csv" \
     --data-binary @FantasyPros_Fantasy_Football_2025_Depth_Charts.csv \
     "https://YOUR_SITE/.netlify/functions/nfl-depthcharts-import-fantasypros?season=2025&week=1"

3) Verify it wrote to Blobs:
   https://YOUR_SITE/.netlify/functions/nfl-depthcharts-get?season=2025&week=1

Notes
-----
- Writes two keys:
  depth/season/{season}/week{week}.json
  depth/season/{season}/current.json

- It is tolerant of common FantasyPros header variations.
- Team names are mapped to standard 3-letter aliases (ARI, ATL, ... WAS).
