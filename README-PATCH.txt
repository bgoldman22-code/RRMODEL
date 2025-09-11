Patch contents:
- src/pages/Predictions.jsx : new columns (Kickoff, Matchup, single Lines column, and Picks column with confidence bars).
- src/components/ConfidenceBar.jsx : small reusable progress bar.
- src/lib/nfl/predictionFormats.js : helpers for formatting and simple confidence heuristics.

How to apply:
1) Place these files into your repo at the indicated paths.
2) Commit and deploy.

Notes:
- Moneyline confidence comes from your function response (ml_*_imp).
- Spread/Total confidences use simple heuristics until you augment the function to return model confidences.
- The page also renders 3 x 3-leg and 3 x 5-leg parlay suggestions at the bottom.
