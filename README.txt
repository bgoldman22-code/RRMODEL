NFL Blobs Async Patch — 2025-09-09T15:40:48.375268Z

What’s included:
- netlify/functions/_blobs.js
  Async, cross-version helper for Netlify Blobs. Uses dynamic import and
  supports both createClient(...).getStore(name) and getStore(name, opts).

- netlify/functions/health-blobs/index.cjs
  Diagnostic function that uses the shared helper and performs a write-read
  cycle in the 'nfl-td' store.

HOW TO APPLY
1) Unzip these files into your repo root, preserving paths.
2) Ensure netlify.toml has:

   [functions]
     directory = "netlify/functions"
     node_bundler = "esbuild"
     external_node_modules = ["@netlify/blobs","csv-parse"]
     included_files = ["netlify/functions/**/_data/**"]

3) Confirm env vars are set at the Site level:
   - NETLIFY_SITE_ID
   - NETLIFY_BLOBS_TOKEN

4) Redeploy, then sanity-check:
   - /.netlify/functions/health-blobs
     Expect ok:true and a write-read test = true.

IMPORTANT
- Do NOT hardcode sensitive tokens into source files. Keep them in Netlify
  environment variables.
- Any function calling getBlobsStore(...) must now await it:
    const store = await getBlobsStore('nfl-td')
