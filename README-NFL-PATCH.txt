NFL functions patch (Blobs + weekly roll-forward)

Files:
- netlify/functions/nfl-bootstrap.mjs      → bootstraps schedule + rosters, auto week with Tuesday 1am ET roll-forward
- netlify/functions/nfl-data.mjs           → serves schedule/depth from Blobs
- netlify/functions/nfl-td-candidates.mjs  → builds candidate list with real player names/why from roster blobs

Deploy steps:
1) Drop these files into your repo at the same paths (netlify/functions/*).
2) Commit & deploy (Netlify). Your package.json should already have "type": "module".
3) Hit:
   - /.netlify/functions/nfl-bootstrap?refresh=1&mode=auto&debug=1
   - /.netlify/functions/nfl-data?type=schedule
   - /.netlify/functions/nfl-td-candidates?debug=1

Notes:
- Week 2 begins Tuesday 01:00 ET following the last Week 1 game; each week rolls every 7 days thereafter.
- For 2025 Week 1, a fixed ESPN dates window is used as fallback: 20250904-20250910.