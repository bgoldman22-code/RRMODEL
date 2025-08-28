Patch: Netlify Blobs helper + env-dump
======================================

WHAT THIS DOES
--------------
- Adds a unified helper for @netlify/blobs that works across versions.
- Provides back-compat exports (getSafeStore/openStore/makeStore) that some of your functions expect.
- Adds a safe env-dump function to sanity-check masked envs and Blobs connectivity.

FILES TO DROP IN (keep paths exactly):
  netlify/functions/_blobs.js
  netlify/functions/_lib/blobs-helper.mjs
  netlify/functions/_blobs-helper.mjs
  netlify/functions/env-dump.mjs

AFTER COMMITTING
----------------
1) Deploy, then test:
   - https://YOUR_SITE/.netlify/functions/env-dump
     Expect { ok:true, probe:..., blobsProbe:{ ok:true } } (ok:true means we can read/write Blobs)

2) Re-test any functions that previously complained
   (e.g. props-diagnostics, mlb-preds-get). They should now find a working store.

NOTES
-----
- The helper prefers createClient({ siteID, token }) when NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are present,
  but will fall back to createClient() if the runtime injects credentials for you.
- If you have any functions that still import '@netlify/blobs' directly, switch that import to:
    import { getBlobsStore } from './_blobs.js';
  or update them to import from './_lib/blobs-helper.mjs' if they expect makeStore/openStore/getSafeStore names.
