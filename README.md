# NFL TD Patch — Step 3 & Candidates Fix

This patch does two things:

1. **Fixes** `netlify/functions/nfl-td-candidates.mjs` (template string typo + robust schedule consumption).
2. **Makes Step 3 changes** so CommonJS Netlify functions are valid under `"type": "module"`:
   - Renames `netlify/functions/mlb-preds-get.js` -> `.cjs` (if present)
   - Renames `netlify/functions/odds-diag.js` -> `.cjs` (if present)
   - Prints any other `exports.handler` files so you can rename them too

## Apply

```bash
# From your repo root
unzip patch-step3-and-candidates-fix-2025-08-25.zip -d .
bash scripts/apply-patch.sh
git push
```

## Verify

- `/.netlify/functions/nfl-bootstrap?refresh=1&mode=auto&debug=1` returns a schedule.
- `/.netlify/functions/nfl-td-candidates?debug=1` returns `{ ok:true, candidates:[...] }`.
- `/nfl` renders candidates (even if Blobs writes are still in-flight).

If Netlify logs still show CommonJS/ESM warnings for other files, either rename them to `.cjs` or convert to ESM (`export default async function handler(...) {}`).
