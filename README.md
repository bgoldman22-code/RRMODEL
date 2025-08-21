# NFL TD Drop-in (Week 1, 2025)

This package adds a fully isolated NFL Anytime TD route powered by a local Week 1 schedule.

## Files
- `data/nfl-schedule-2025.json` — 2025 Week 1 (Thu–Mon) schedule
- `src/config/features.js` — feature flag toggle (`ENABLE_NFL_TD`)
- `src/utils/nflSchedule.js` — date windowing + schedule loader
- `src/pages/NflTd.jsx` — React route at `/nfl-td`
- `src/components/Nav.jsx.snippet.txt` — one-line snippet to add nav link

## Install
1. Copy the `data/` folder to your project root (next to `src/`).
2. Copy `src/` contents into your project `src/`.
3. Add the nav link in your `Nav` component:
   ```jsx
   import { ENABLE_NFL_TD } from '../config/features';
   // ...
   {ENABLE_NFL_TD && <a href="/nfl-td" className="px-3 py-2">NFL TD</a>}
   ```
4. Add a route for `/nfl-td` in your router (if needed), or ensure your router auto-loads pages in `src/pages/`.

## Notes
- Odds are disabled by design for the first pass.
- The schedule loader shows games in the Thu–Mon window around the selected date.
- To hide the page without code removal, set `ENABLE_NFL_TD = false`.
