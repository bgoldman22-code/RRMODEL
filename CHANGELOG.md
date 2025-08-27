# CHANGELOG — rr-full-checklist-patch (2025-08-27)

## Netlify functions
- **lib/blobs.js**: Added `getSafeStore()` — bound → env → null (no-throw).
- **lib/bvp.js**: Added `fetchBvP(batterId, pitcherId)` using `opposingPlayerId`.
- **mlb-preds-get.js**: Replaced with proxy to `mlb-metrics` + safe Blobs caching.

## Frontend
- **src/MLB.jsx**: WHY+ (causal) with **★ biggest positive factor**, cold-bat suppression, season baseline cap, restored **Pure EV** table.

## Notes
- This patch assumes you have a `netlify/functions/mlb-metrics.js` function that returns the slate JSON.
- If you do not, `mlb-preds-get` proxy will return a soft error (`metrics-unavailable`).
