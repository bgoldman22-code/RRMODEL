# patch-mlb-v5

This bundle includes BOTH the latest algo tweaks and a build-stability sweep.

## Files
- src/MLB.jsx — drop-in, includes Pure EV table + column alignment + new multipliers.
- src/lib/hr-factors_v4.js — helper module imported by MLB.jsx.
- docs/netlify-notes.md — small checklist for Netlify build stability.
- docs/package.json.merge.json — safe merge fields to ensure scripts/deps exist (do not replace your whole package.json; merge).

## Apply
1) Copy `src/MLB.jsx` over your repo's `src/MLB.jsx`.
2) Copy `src/lib/hr-factors_v4.js` to `src/lib/hr-factors_v4.js`.
3) (Optional but recommended) Review `docs/netlify-notes.md` and ensure your `package.json` has the listed scripts.
