Patch: NFL Predictions page + nav update
Files:
- src/pages/Predictions.jsx (NEW)
- src/App.jsx (UPDATED) — removed NFL NegCorr link, added Predictions route/nav

This page expects the Netlify functions:
- /.netlify/functions/nfl-predictions-get  (GET)
- /.netlify/functions/nfl-predictions-generate (POST, optional)

It renders the weekly table and auto-built 3- and 5‑leg parlays. A Generate button forces a rebuild.
