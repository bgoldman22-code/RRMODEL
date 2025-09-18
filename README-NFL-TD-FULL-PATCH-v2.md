# NFL Anytime TD — Full Patch v2 (drop-in)

This bundle combines the complete TD backend + UI from v1 AND the updated routes/nav/breadcrumb polish from routes v2.

## What's inside (relative to repo root)

### Netlify Functions (backend)
- `netlify/functions/nfl-td-model/index.cjs` — core two-path model
- `netlify/functions/nfl-td-predictions/index.mjs` — builds predictions and caches to Blobs

### Frontend (UI + routing)
- `src/pages/NflTd.jsx` — Anytime TD page (with breadcrumb + title)
- `src/components/NflTdTable.jsx` — table component
- `src/config/features.js` — `ENABLE_NFL_TD = true`
- `src/App.jsx` — merge-friendly template including the **two new routes**
- `src/Header.jsx` — merge-friendly template including the **NFL TD nav link** (+ optional mobile example)

## How to apply (no manual merging — just overwrite)
1) **Extract this zip at your repo root** and **allow overwrite** when prompted.
2) If your project already has larger `App.jsx`/`Header.jsx` files and you do NOT want templates:
   - Keep your originals and just ensure the import + routes and nav link are present.
   - Otherwise, letting these files overwrite is safe if you want the minimal working defaults.
3) Deploy to Netlify.
4) Visit `/nfl-td` (or `/nfl`) to confirm.

## Notes
- The feature flag is enabled by default. If you centrally manage flags, keep your system and remove `src/config/features.js`.
- Odds are **cached-per-week** via Blobs at `odds/anytime_td/{season}/week-{week}.json`. Without that cache, the page still runs in odds-agnostic mode.
