PATCH: Opponent Pitcher Fix
=================================

What this does
--------------
- Ensures the **Why** column (and EV calcs) use the *opposing* probable pitcher,
  not a teammate, by correcting `pitcherName` per row client-side.
- Fetches probables from your existing `/.netlify/functions/mlb-schedule?date=YYYY-MM-DD` endpoint,
  and builds a map like `AWY@HOME -> (homeProbable, awayProbable)`.
- Uses the row's `team` field to pick the *other* side's probable.

Files included
--------------
- `src/MLB.jsx` (drop-in replacement; minimal changes but fully self‑contained)
- `src/utils/opponentPitchers.js` (new helper used by MLB.jsx)

How to install
--------------
1) Add both files to your repo, preserving paths.
2) Commit & deploy. No environment variables or function changes required.

Notes
-----
- If a row lacks a `team` abbreviation, we leave the original `pitcherName` untouched.
- This is front‑end only and **won't break** other pages.
- If you later want the *backend* to emit a corrected `pitcherName`, reuse the logic in
  `src/utils/opponentPitchers.js` server‑side where candidates are built.
