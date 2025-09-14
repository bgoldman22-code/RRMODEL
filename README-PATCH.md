# Patch: NFL frontend table (three markets)

Files included (drop into your repo root):
- `src/components/NFLPredictionsTable.jsx`
- `src/pages/NFL.jsx` (use if you don't already have an NFL page; otherwise copy the table component and integrate)

Assumptions:
- Tailwind (or similar utility classes). If not using Tailwind, classes are harmless.
- Backend endpoint `/.netlify/functions/nfl-predictions-generate?mode=hybrid&v=2` returns either:
  - `{ picks: [ { matchup, home, away, kickoff, markets: { moneyline:{pick, price, line, confidence}, spread:{...}, total:{...} } } ] }`
  - or `{ rows: [ flat odds fields + pick_ml/conf_ml, pick_spread/conf_spread, pick_total/conf_total ] }`

The component normalizes both shapes.
