# NFL Predictions — URL-only triggers

This patch removes the React "actions" component and switches to URL-only triggers for training and rescoring.

## Endpoints
- Train (no secret): `/.netlify/functions/nfl-predictions-train?open=1`
- Rescore (no secret): `/.netlify/functions/nfl-predictions-score?open=1`
- Get predictions: `/.netlify/functions/nfl-predictions-get`

## Notes
- Data is persisted in Netlify Blobs at key: `nfl/predictions/current.json`
- Ensure env vars are set for Blobs if needed: `NETLIFY_SITE_ID`, `NETLIFY_BLOBS_TOKEN` (or rely on Netlify runtime).
