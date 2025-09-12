PATCH: Netlify Blobs-based NFL Predictions (GET / TRAIN / SCORE)

Files in this patch (drop-in):
- netlify/functions/_blobs.js
- netlify/functions/nfl-predictions-get/index.cjs
- netlify/functions/nfl-predictions-train/index.cjs
- netlify/functions/nfl-predictions-score/index.cjs

WHAT THIS FIXES
- Replaces legacy Blobs usage ("Blobs is not a constructor", "store.put is not a function")
  with the stable getStore() API from @netlify/blobs.
- Ensures every function returns JSON on error to avoid HTML 500 pages in the UI.

ENV VARS (in Netlify UI → Site settings → Environment):
- NETLIFY_BLOBS_TOKEN   (required for server-side Blobs access)
- NETLIFY_SITE_ID       (your site ID)
- BLOBS_STORE_NFL=rrmodelblobs   (optional; defaults to rrmodelblobs if unset)

OPTIONAL (for locking down endpoints later):
- TRAIN_SECRET, SCORE_SECRET
  (for now, endpoints accept ?open=1 to run without secrets)

TEST FLOW (from browser console):
fetch('/.netlify/functions/nfl-predictions-train?open=1').then(r=>r.json()).then(console.log);
fetch('/.netlify/functions/nfl-predictions-score?open=1').then(r=>r.json()).then(console.log);
fetch('/.netlify/functions/nfl-predictions-get').then(r=>r.json()).then(console.log);

Expected:
- TRAIN returns { ok:true, wrote:'nfl/predictions/artifacts/latest.json', ... }
- SCORE returns { ok:true, scored:true, rows: 1, ... }
- GET returns { ok:true, rows:[...], parlay:{...}, ... } (from blobs)

Notes:
- TRAIN and SCORE contain mocked logic — replace with your real ingestion/model later.
- Keep the paths/filenames exactly as in this patch.
