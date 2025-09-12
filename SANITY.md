# SANITY & Debug

## Browser console (copy-paste)

// Train (open)
fetch("/.netlify/functions/nfl-predictions-train?open=1", {method:"POST"})
  .then(r=>r.json()).then(console.log).catch(console.error);

// Score (open)
fetch("/.netlify/functions/nfl-predictions-score?open=1", {method:"POST"})
  .then(r=>r.json()).then(console.log).catch(console.error);

// Get
fetch("/.netlify/functions/nfl-predictions-get")
  .then(r=>r.json()).then(j=>console.table(j.rows||[])).catch(console.error);

## curl

curl -s -X POST "https://YOUR_SITE/.netlify/functions/nfl-predictions-train?open=1" | jq .
curl -s -X POST "https://YOUR_SITE/.netlify/functions/nfl-predictions-score?open=1" | jq .
curl -s "https://YOUR_SITE/.netlify/functions/nfl-predictions-get" | jq .

## Expected
- Train: ok:true & wrote artifact key
- Score: ok:true & wrote current.json with rows
- Get: ok:true with same rows

If train 500s → check function logs; likely missing blobs context or syntax error.
If score shows "No artifact" → run train first or verify artifact key matches.
