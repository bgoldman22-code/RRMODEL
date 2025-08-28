# Blobs Helper + Props Codemod Patch

This patch gives you:
- A robust Netlify Blobs helper at `netlify/functions/_blobs.js` (ESM).
- A diagnostic function `netlify/functions/env-dump.mjs` to verify env + blobs.
- A codemod script `patch/patch-props-blobs.js` that injects safe blobs usage into:
  - props-get.mjs
  - props-get-raw.mjs
  - props-prob.mjs
  - props-refresh.mjs
  - props-stats.mjs
  - (optionally) props-diagnostics.mjs

## How to apply

1. Copy the files into your repo, preserving paths:
   - `netlify/functions/_blobs.js`
   - `netlify/functions/env-dump.mjs`
   - `patch/patch-props-blobs.js`

2. Run the codemod from the repo root:
   ```bash
   node patch/patch-props-blobs.js
   git add netlify/functions/*.mjs netlify/functions/_blobs.js
   git commit -m "Use shared _blobs helper in props functions + add env-dump"
   git push
   ```

3. Sanity test (after deploy):
   - Env probe:
     `https://<yoursite>/.netlify/functions/env-dump`
   - Props diagnostics (should *not* say “environment not configured”):
     `https://<yoursite>/.netlify/functions/props-diagnostics?model=mlb_hits2&date=2025-08-27`
   - Predictions endpoint:
     `https://<yoursite>/.netlify/functions/mlb-preds-get?date=2025-08-27`

If any of the props functions still initialize their own Blobs client, re-run the codemod. It's idempotent.
