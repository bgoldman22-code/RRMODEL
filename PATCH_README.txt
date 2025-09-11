Patch: MLB HR frontend page & App routing
Date: 2025-09-11T18:02:00.087902Z

Files included:
- src/pages/MLBHR.jsx   → robust table that fetches from /.netlify/functions/mlb-hr-get (with fallbacks)
- src/App.jsx           → adds /mlb-hr route and a simple nav

How to apply:
1) Drop `src/pages/MLBHR.jsx` into your repo.
2) Merge `src/App.jsx` changes into your existing App.jsx (or replace if you prefer).
3) Deploy.

Notes:
- MLBHR.jsx will look for any of these endpoints (first that returns JSON OK):
    /.netlify/functions/mlb-hr-get
    /.netlify/functions/mlb_hr_get
    /.netlify/functions/hr-get
  If your old function used a different path, update PRIMARY_ENDPOINTS at the top of MLBHR.jsx.

- The component is tolerant to legacy field names and will auto-normalize most common keys.
- Use the Min edge slider, book toggles, and search to filter the table.