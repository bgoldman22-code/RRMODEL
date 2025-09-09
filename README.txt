Blobs Simple Patch — 2025-09-09T15:49:29.044167Z

This patch replaces helper code to always use:
  getStore(name, { siteID: NETLIFY_SITE_ID, token: NETLIFY_BLOBS_TOKEN })
when creds exist, else falls back to getStore(name).

Files:
- netlify/functions/_blobs.js                (CJS helper)
- netlify/functions/_lib/blobs-helper.mjs    (ESM helper)
- netlify/functions/health-blobs/index.cjs   (diagnostic, write+read self test)
- netlify/functions/nfl-depthcharts-seed/index.cjs (writes depth/current.json)

After deploying:
1) Open /.netlify/functions/health-blobs  -> expect ok:true
2) Open /.netlify/functions/nfl-depthcharts-seed -> expect ok:true

Ensure netlify.toml has:
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
  external_node_modules = ["@netlify/blobs","csv-parse"]
  included_files = ["netlify/functions/**/_data/**"]

Env vars present:
- NETLIFY_SITE_ID
- NETLIFY_BLOBS_TOKEN
