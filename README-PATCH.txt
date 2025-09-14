PATCH: NFL model feature wiring (EPA-lite)
-----------------------------------------

What’s included
- netlify/functions/_lib/feature-engineering.mjs
  Builds rolling team-week features from nflverse games CSVs (no external deps).

- netlify/functions/nfl-train/index.mjs
  New ESM function that computes features for the requested years and persists
  them to Netlify Blobs as `team_form.json` (best-effort; continues if blobs
  env is missing). Returns logs so you can see progress.

- netlify/functions/nfl-predictions-generate/index.cjs
  Updated to dynamically import the feature module and consume `team_form.json`.
  Produces moneyline/spread/total picks with confidences derived from the model
  probabilities (odds only used for formatting lines & thresholds). Includes a
  runtime log sample of the first few rows.

Endpoints (after deploy)
- /.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
- /.netlify/functions/nfl-predictions-generate?force=1

Notes
- This is an EPA-lite baseline. Replace the weights in scoreMatchup() with
  learned weights when you’re ready.
- If `team_form.json` isn’t in blobs, predictions will fall back to 50%.
