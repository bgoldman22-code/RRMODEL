# NFL Predictions Patch (frontend + function fixes)

This patch adds/repairs the **NFL Predictions** page and fixes Netlify Function issues reported earlier:

- Adds `src/pages/NFLPredictions.jsx` — full table view (Kickoff, Matchup, Lines, ML/Spread/OU picks with confidence) plus parlay blocks.
- Adds `src/components/NFLPredictionsActions.jsx` — green buttons to trigger training/rescoring. Also shows raw JSON from the functions.
- Fixes `/.netlify/functions/nfl-predictions-score` by exporting **both** `handler` and `scorePredictions` (prevents `TypeError: scorePredictions is not a function`).
- Adds `/.netlify/functions/nfl-predictions-train` that **always** responds with JSON and allows an **open trigger** via `?open=1`, so you can run it without a secret.

## Manual test URLs

- Predictions (GET): `/.netlify/functions/nfl-predictions-get`
- Train (POST / open): `/.netlify/functions/nfl-predictions-train?open=1`
- Score (POST): `/.netlify/functions/nfl-predictions-score`

You can also use the green buttons on the page itself.

## Notes

These function implementations are **placeholders** so your UI and buttons stop erroring and always receive JSON. Replace the internals with your real learning/scoring logic as needed; keep the same export shape to avoid breaking the UI.