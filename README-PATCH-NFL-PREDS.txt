NFL Predictions: On-Demand Train/Score Patch

Files added:
- netlify/functions/nfl-predictions-train/
- netlify/functions/nfl-predictions-score/
- netlify/functions/nfl-predictions-meta/
- lib/nfl/{util.js,model.js,score.js,meta.js}
- src/pages/NFLPredictions.jsx
- netlify/ADD_TO_netlify.toml.txt

Env required:
- TRAIN_SECRET (set a long random string)
- Optional for diagnostics persistence:
  - NETLIFY_SITE_ID
  - NETLIFY_BLOBS_TOKEN (or NETLIFY_AUTH_TOKEN / NETLIFY_API_TOKEN)
  - BLOBS_STORE_NFL (default "predictions-nfl")

Usage:
- Trigger training: /.netlify/functions/nfl-predictions-train?key=TRAIN_SECRET
- Trigger scoring:  /.netlify/functions/nfl-predictions-score?key=TRAIN_SECRET
- Diagnostics:      /.netlify/functions/nfl-predictions-meta

UI route: /nfl/predictions
Includes green "Train Now" and "Score Now" buttons and diagnostics.
