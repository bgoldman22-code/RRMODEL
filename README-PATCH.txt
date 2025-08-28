PATCH CONTENTS
- netlify/functions/_blobs.js        (canonical helper using getStore with explicit siteID/token)
- netlify/functions/env-dump.mjs     (diagnostic; safe to include)
- scripts/apply-mlb-blobs-patch.sh   (search/replace + rename helper)
HOW TO USE
1) Extract this zip into your repo root (same folder that has package.json).
2) Copy netlify/functions/_blobs.js and netlify/functions/env-dump.mjs into your repo (they will overwrite if present).
3) Run:
   bash scripts/apply-mlb-blobs-patch.sh .
   (It will rewrite imports, rename CJS handlers to .cjs when needed, and patch package.json dev script.)
4) Commit, push, and deploy.
SANITY TESTS
- Open /.netlify/functions/env-dump  (expect ok: true and blobsProbe.ok: true)
- Open /.netlify/functions/props-diagnostics?model=mlb_hits2&date=YYYY-MM-DD (expect ok: true)
- Open /.netlify/functions/mlb-preds-get?date=YYYY-MM-DD (should return JSON without Blobs errors)
