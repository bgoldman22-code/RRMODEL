Patch: Blobs self-test + netlify.toml fragment
=============================================
Generated: 2025-09-09T15:18:39.848833Z

What this adds
--------------
1) netlify/functions/health-blobs/index.cjs
   - Tiny function that writes & reads a JSON blob to the 'nfl-td' store.
   - Returns { ok:true } if credentials are properly injected / passed.
   - Also reports whether NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are present.

2) netlify.toml.fragment
   - Canonical [functions] block. Ensure your real netlify.toml contains **one** block like this.
   - Avoid duplicate [functions] sections or duplicate external_node_modules keys.

How to apply
------------
1) Drop the 'netlify/functions/health-blobs' folder into your repo.
2) Merge 'netlify.toml.fragment' into your real netlify.toml, keeping a single [functions] block.
3) Commit + deploy.
4) Hit: /.netlify/functions/health-blobs
   - Expect: { ok: true, info: ... }
   - If { ok:false }, the 'info.tests[0].error' will show the exact thrown error.

If ok:false: checklist
----------------------
- Verify your site runs **Functions** (not Edge) and uses node_bundler="esbuild".
- Confirm @netlify/blobs is in package.json dependencies (not just devDependencies).
- Ensure NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are set in Site > Settings > Environment.
- Remove duplicate [functions] blocks in netlify.toml.
- Redeploy with cache cleared if needed (Deploys > Trigger deploy > Clear cache and deploy).
