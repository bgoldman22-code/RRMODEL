NFL Blobs + Depth Charts Patch
==============================

What's included
---------------
- netlify/functions/_blobs.js
  Robust helper that gets a named Blobs store. If NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN
  are present in the environment, it passes them explicitly to avoid MissingBlobsEnvironmentError.

- netlify/functions/_lib/blobs-helper.mjs
  Same logic for ESM callers (some of your functions use ESM).

- netlify/functions/health-blobs/index.cjs
  Diagnostic endpoint: /.netlify/functions/health-blobs
  Writes & reads a blob from store 'nfl-td' to verify wiring.

- netlify/functions/nfl-depthcharts-get/index.cjs
  Reads depth charts from Blobs 'nfl-td' store at key depth/current.json,
  falls back to embedded local JSON at netlify/functions/_data/nfl/current.json.

- netlify/functions/_data/nfl/current.json
  Baseline scaffold with all 32 teams and empty position arrays.

- netlify/build-debug.sh
  Uses `npm install` (not `npm ci`) to avoid lockfile requirement in Netlify.
  Then runs your Vite build.

- netlify.toml
  Bundles @netlify/blobs for functions, includes local _data/** in the function bundle.

How to apply
------------
1) Commit all files preserving paths.
2) In Netlify > Site settings > Build & deploy:
   - Build command: bash netlify/build-debug.sh
   - Publish directory: dist
   - Functions directory: netlify/functions
3) Ensure environment variables exist:
   - NETLIFY_SITE_ID         (already present on build machines)
   - NETLIFY_BLOBS_TOKEN     (Team > Access tokens > Blobs; add as env var)
4) Deploy.
5) Sanity checks:
   - /.netlify/functions/health-blobs  (should return ok:true)
   - /.netlify/functions/nfl-depthcharts-get?season=2025&week=1

Notes
-----
- We avoided generating package-lock.json here (no registry access). If you prefer npm ci,
  generate a lockfile locally (npm v10) and commit it. Otherwise this patch works with npm install.
- To keep MLB separate, just use a different store name (e.g., 'mlb-hr') in those functions.
