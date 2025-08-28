PATCH CONTENTS

1) netlify/functions/env-dump.mjs
   - Uses store.get(key, { type: 'json' }) instead of store.getJSON.
   - Opens the blob store via getStore({ name }) from your _blobs.js so credentials are passed.
   - Returns blobsProbe.ok once the round-trip succeeds.

2) netlify/functions/props-diagnostics.mjs
   - Exports `export async function handler(event) { ... }` (ESM) to satisfy Netlify runtime.
   - Uses getStore({ name }) and does a write/read probe plus lists up to 1000 keys.

3) scripts/patch-mlb-preds-get.cjs
   - One-time helper to guarantee `exports.handler` exists in mlb-preds-get.cjs (or .js).
   - Run: `node scripts/patch-mlb-preds-get.cjs`
   - If your file had `export default async (...)`, it converts it to a CJS handler.
   - If no handler is found, it appends a minimal stub (you can then replace with your real logic).

HOW TO APPLY

A) Drop these files into your repo at the same paths:
   netlify/functions/env-dump.mjs
   netlify/functions/props-diagnostics.mjs
   scripts/patch-mlb-preds-get.cjs

B) Commit and push.

C) (Optional but recommended) Run locally before deploy:
   node scripts/patch-mlb-preds-get.cjs

D) Deploy, then sanity-check:
   1. /._netlify/functions/env-dump  -> blobsProbe.ok should be true
   2. /._netlify/functions/props-diagnostics?model=mlb_hits2&date=2025-08-27 -> ok:true
   3. /._netlify/functions/mlb-preds-get?date=2025-08-27 -> should respond (now that handler is exported)
