NFL Blobs Bulletproof Patch
===========================

What this patch does
--------------------
1) Provides a robust helper for Netlify Blobs that always passes credentials when available:
   - netlify/functions/_blobs.js      (CJS)
   - netlify/functions/_lib/blobs-helper.mjs  (ESM)

2) Adds two diagnostics functions:
   - /.netlify/functions/blobs-introspect  -> shows what @netlify/blobs exports at runtime
   - /.netlify/functions/health-blobs      -> attempts a write+read in store 'nfl-td'

3) Adds package.json.addon.json with a pinned @netlify/blobs version:
   { "dependencies": { "@netlify/blobs": "7.3.0" } }

How to apply
------------
1. Unzip into your repo root (preserve folders).
2. Merge dependencies from package.json.addon.json into your root package.json:
   - Ensure "@netlify/blobs": "7.3.0" (pinned, no caret).
   - Commit package-lock.json too.
3. Confirm netlify.toml includes:
   [functions]
     directory = "netlify/functions"
     node_bundler = "esbuild"
     external_node_modules = ["@netlify/blobs","csv-parse"]
     included_files = ["netlify/functions/_data/**"]
4. In Netlify, trigger **Clear cache and deploy site**.

Sanity checks
-------------
- /.netlify/functions/blobs-introspect
- /.netlify/functions/health-blobs
- (then) your depth charts functions as needed.
