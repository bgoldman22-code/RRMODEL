# NFL TD — Routes Patch v2 (merge-first)
This is an updated, merge-friendly patch that:
- Adds the `/nfl-td` route (+ `/nfl` alias) with minimal file edits
- Adds a desktop nav link and an optional mobile menu example (commented)
- Enables the feature flag
- Polishes the TD page with a breadcrumb/title

## Files
- `src/App.jsx` — **template** showing the import + two routes. Copy those lines into your existing file.
- `src/Header.jsx` — **template** that shows where to add the new nav link. Copy the link into your header (and optionally the mobile example).
- `src/config/features.js` — sets `ENABLE_NFL_TD = true`.
- `src/pages/NflTd.jsx` — updated with breadcrumb/title polish. If you already customized this page, only copy the breadcrumb/title bits.

## Quick steps
1. Copy `src/config/features.js` if you don't already manage flags.
2. In your own `src/App.jsx`, **add**:
   - `import NflTd from './pages/NflTd'`
   - The two `<Route>` lines shown in the template.
   - Remove any legacy TD routes.
3. In your header (desktop + mobile), add the `NFL TD` link.
4. Optional: replace your `src/pages/NflTd.jsx` with this one (or add the breadcrumb/title manually).

## Smoke test
- `/nfl-td` and `/nfl` both render
- Header link navigates to `/nfl-td`
- If odds cache exists at `odds/anytime_td/{season}/week-{week}.json`, Edge/Best Book columns fill in automatically.
