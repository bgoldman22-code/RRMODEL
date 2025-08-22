# MLB Page Patch (`src/mlb.jsx`)

This patch wires the new **Straight EV Bets (Top 13 EV Picks)** table (with a 19% HR probability floor) directly into your MLB page.

## Files
- `src/mlb.jsx` — page that renders both tables.
- `src/components/StraightTables.jsx` — component with both tables.
- `src/utils/evMath.cjs` — EV math helper.

## How it finds data
The page looks for today's picks in this order:
1. `props.picks` (if your framework passes data as props)
2. `window.__PICKS__` (assign your picks to a global in a prior script)
3. otherwise uses an empty array

## What you need to do
- If your site already has the picks array available, expose it as `window.__PICKS__` before this page runs, or pass it as a prop.
- Deploy and visit `/mlb` — you’ll see:
  - Straight HR Bets (Top 13 Raw Probability)
  - Straight EV Bets (Top 13 EV Picks, HR prob ≥ 19%)
