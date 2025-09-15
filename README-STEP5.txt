RRModel Step 5 Patch (minimal files only)

WHAT THIS PATCH DOES
- Adds a tiny build script so Netlify will create a dist/ folder.
- Declares @netlify/blobs and csv-parse deps (required by your functions).
- Configures Netlify bundler + externals.
- Provides a CommonJS odds-status shim to avoid ESM require() crashes.

DROP-IN INSTRUCTIONS
1) Unzip contents at the repo root (this will ADD/MERGE only a few files):
   - package.json
   - netlify/build-debug.js
   - netlify.toml
   - dist/index.html
   - netlify/functions/odds-status/index.cjs
   - README-STEP5.txt

2) If you previously had `netlify/functions/odds-status/handler.mjs` or
   `odds-status.mjs`, rename or delete it to avoid function routing conflicts.

3) In the Netlify UI, ensure your build command is:
     node netlify/build-debug.js
   (or commit netlify.toml from this patch and let it drive the build)

4) ENV sanity (set in Netlify > Site settings > Environment):
   - BLOBS_STORE_NFL = nfl-td
   - BLOBS_STORE     = nfl-td (optional fallback)
   - Any sportsbook envs you use (BOOKMAKERS, etc.)

5) Deploy, then run sanity checks (copy/paste):
   - https://bgroundrobin.com/.netlify/functions/odds-status
   - https://bgroundrobin.com/.netlify/functions/nfl-schedule-get?force=1
   - https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
   - https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

NOTES
- This patch does not remove your existing files; it only adds/overwrites the above.
- If you already have a richer build, keep it and just ensure a dist/ exists.
