Apply these files atop your repo (paths preserved). Only updated files are included.

Sanity checks (copy‑paste):
1) Function health:
   - GET /.netlify/functions/nfl-predictions-generate?force=true
   Expect: { ok: true, usingModel: true, rows: [...] }

2) Verify model vs odds:
   - Confirm some away picks appear when model favors away based on team form:
     Look at any row where odds.ml_away < 0 (away favorite) and the model form for away >> home.
     The 'moneyline.team' may be away and confidence not constant (varies 50–90%).

3) Frontend table:
   - Route to your NFL Predictions page; ensure it renders the 6 columns.
   - If your app routes via components, import src/components/NFLPredictionsTable.jsx into the live page/container.

4) Quick cURL (local dev with Netlify CLI):
   netlify dev
   curl -s http://localhost:8888/.netlify/functions/nfl-predictions-generate | jq '.ok, .rows[0]'
