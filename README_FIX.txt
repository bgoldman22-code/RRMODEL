PATCH: Ensure @netlify/blobs is installed and functions return JSON
=================================================================

WHAT THIS PATCH CONTAINS
------------------------
1) netlify/functions/_blobs.js
   - Lazy-loads @netlify/blobs and guards against missing deps.
   - Provides get/set/del helpers that never throw at import time.

2) netlify/functions/nfl-predictions-train/index.cjs
   - Mock TRAIN function. Returns JSON even on errors.
   - Accepts ?open=1 (tokenless) for quick testing.

3) netlify/functions/nfl-predictions-score/index.cjs
   - Mock SCORE function. Writes one demo row + parlay to the blobs store.

4) netlify/functions/nfl-predictions-get/index.cjs
   - GET function with safe empty fallback so UI never sees HTML error pages.

5) package.json.snippet
   - Minimal block to add "@netlify/blobs" to dependencies.

---

OPTION A (GitHub/Netlify web) — Step-by-step
--------------------------------------------

A) Upload/commit the patch files
   1. In GitHub, open your repo → Click "Add file" → "Upload files".
   2. Drag the *contents* of this patch into the repo root, keeping their folders:
      - netlify/functions/_blobs.js
      - netlify/functions/nfl-predictions-train/index.cjs
      - netlify/functions/nfl-predictions-score/index.cjs
      - netlify/functions/nfl-predictions-get/index.cjs
      - package.json.snippet (optional helper file)
      - README_FIX.txt (optional)
   3. Commit the upload to your default branch (usually main).

B) Add the dependency in package.json (no terminal needed)
   1. In GitHub, open your repo → Click "Code" → browse to package.json.
   2. Click the pencil (edit) icon.
   3. In the "dependencies" object, add this line (keep JSON commas correct):
         "@netlify/blobs": "^7.3.0"
      Example minimal block:
         "dependencies": {"@netlify/blobs": "^7.3.0"}
      If you already have other dependencies, add a comma before/after as needed.
   4. Scroll down → "Commit changes".

   NOTE: You do NOT need to change netlify.toml for this patch.

C) Trigger a new Netlify deploy
   - Netlify will detect the commit and build automatically.
   - Wait for the build to finish (should succeed if package.json was edited).

D) Sanity checks (Browser Console)
   Paste the following in your site (any page) DevTools Console:

   // 1) Train (open endpoint to avoid secrets while testing)
   fetch("/.netlify/functions/nfl-predictions-train?open=1")
     .then(r=>r.text())
     .then(t=>{ try { console.log('TRAIN:', JSON.parse(t)); } catch { console.warn('TRAIN raw:', t); } });

   // 2) Score (will fail if (1) didn't write artifact)
   fetch("/.netlify/functions/nfl-predictions-score?open=1")
     .then(r=>r.text())
     .then(t=>{ try { console.log('SCORE:', JSON.parse(t)); } catch { console.warn('SCORE raw:', t); } });

   // 3) Get predictions (should show mocked row + parlay from SCORE)
   fetch("/.netlify/functions/nfl-predictions-get")
     .then(r=>r.json()).then(j=>console.log('GET:', j));

   Expected:
     - TRAIN → { ok: true, wrote: "nfl/predictions/artifacts/latest.json", ... }
     - SCORE → { ok: true, scored: true, rows: 1, ... }
     - GET   → { ok: true, rows: [ ... ], parlay: {...} }

If TRAIN still returns an HTML page (starts with "Internal Error"):
   → The dependency likely didn't install. Double-check you edited package.json in the correct branch and that Netlify built after the change.

If GET returns { ok: true, rows: [], source: "empty" }:
   → TRAIN didn't run or SCORE didn't persist. Re-run steps D1 and D2 and check the console output for JSON, not HTML.

---

Notes
-----
- These functions are CJS (`index.cjs`) and live under `netlify/functions/<name>/` so Netlify will detect them automatically.
- The code uses your site's default blobs store name unless BLOBS_STORE_NFL or BLOBS_STORE is set.
- While testing we accept `?open=1` (no secret); remove when you lock down prod.
