NFL Predictions — Blobs bootstrap patch (v7)

WHAT THIS FIXES
---------------
• Eliminates HTML 500s by lazy‑requiring @netlify/blobs inside your handlers
  and returning JSON errors instead of crashing during module load.
• Provides a tiny mock TRAIN → SCORE → GET pipeline that writes/reads blobs.
• Uses a shared netlify/functions/_blobs.js wrapper so all three functions
  behave consistently and report clear, JSON‑encoded errors.

FILES IN THIS PATCH
-------------------
netlify/functions/_blobs.js
netlify/functions/nfl-predictions-train/index.cjs
netlify/functions/nfl-predictions-score/index.cjs
netlify/functions/nfl-predictions-get/index.cjs

REQUIRED package.json (already present in your repo — confirm)
-------------------------------------------------------------
  "dependencies": {
    "@netlify/blobs": "^7.3.0",
    ...
  }

NETLIFY UI — STEP‑BY‑STEP (web only, no CLI)
--------------------------------------------
1) In GitHub, create a new branch (e.g., preds-blobs-v7) and upload the four
   files exactly at the paths listed above (preserve folders). Commit & push.

2) In Netlify → Site settings → Build & deploy → Environment:
   Ensure you have at least these (values can be blank for now):
     • BLOBS_STORE_NFL = rrmodelblobs           (or your preferred name)
     • TRAIN_SECRET     = a-long-random-string  (temp; you can skip while using ?open=1)
     • SCORE_SECRET     = a-long-random-string  (temp; you can skip while using ?open=1)
   (No NETLIFY_BLOBS_TOKEN required for production functions.)

3) Trigger a deploy of your new branch and wait for success.

4) Open your site and run this EXACT sequence in the browser console:
     fetch("/.netlify/functions/nfl-predictions-train?open=1")
       .then(r=>r.json()).then(x=>console.log("TRAIN:",x));

     fetch("/.netlify/functions/nfl-predictions-score?open=1")
       .then(r=>r.json()).then(x=>console.log("SCORE:",x));

     fetch("/.netlify/functions/nfl-predictions-get")
       .then(r=>r.json()).then(x=>console.log("GET:",x));

   Expected:
     TRAIN → { ok:true, wrote:"nfl/predictions/artifacts/latest.json", ... }
     SCORE → { ok:true, scored:true, rows:1, ... }
     GET   → { ok:true, rows:[{ id:"mock-1", ... }], parlay:{...}, ... }

5) Once you see rows from GET, your UI page should populate.
   If not, the page may expect a slightly different shape — but the data is in blobs.

TROUBLESHOOTING
---------------
• If TRAIN still shows "Internal Error. ID: …":
    – Your deploy didn’t pick up these files OR
    – You don’t have @netlify/blobs in dependencies.
• If SCORE says "No artifact found", TRAIN didn’t run or couldn’t write.
• If GET returns source:"empty", SCORE didn’t write current.json.

NEXT
----
Replace the mock artifact and rows with your real trainer + scorer logic.
