# Straight EV Bets (Top 13 EV Picks) — Add-on

Add a second table under the existing "Straight HR Bets (Top 13 Raw Probability)" block.

- New block title: **Straight EV Bets (Top 13 EV Picks)**
- Filter: **HR probability ≥ 19%**
- Sort: by **EV (1u)** descending
- Show top 13

## Files
- `src/components/StraightTables.jsx`
- `src/utils/evMath.cjs`

## Usage
In the page that renders your Straight Bets section, import and render:

```jsx
import StraightTables from '@/components/StraightTables';
// ...
<StraightTables picks={picksToday} />
```

`picksToday` should be an array of objects with at least:
- `player` (string)
- `team` or `team_abbr` (string)
- `game` (string, optional)
- `model_hrp` (number, e.g., 0.312 for 31.2%)
- `odds` (American, e.g., 340 or -120)
- optional `ev` (number). If not provided, EV is computed from `model_hrp` and `odds`.
