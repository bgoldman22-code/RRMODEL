Patch: Stability v1 (tailored)
===============================

This patch replaces ONLY the following files under your repo's `src/` directory:
- MLB_SB.jsx
- MLB_Hits.jsx
- NFL.jsx
- Soccer.jsx

What it does (safe; does NOT touch MLB HR page):
- SB: fixes crash, renders names when odds exist, adds soft opponent-aware scoring,
      and handles missing markets without throwing.
- 2+ Hits: adds opponent-aware scoring + EV when odds exist; otherwise renders a calm empty state.
- NFL: default pick date to next Thursday; adds Neg-Correlation tool as a separate mode (no RR);
       keeps everything guarded if odds are off.
- Soccer: improved empty-state when odds are unavailable; no crashes.

General:
- Adds a safe odds loader that tries `window.__odds` first, then `/.netlify/functions/odds-get`.
- If neither exist or markets are off, pages still render gracefully.

How to apply:
1) Back up your existing files.
2) Copy the files from `patch-stability-v1/src/` into your repo's `src/` folder (replace same-named files).
3) Commit & deploy.
