Vite Verbose Build Patch
========================
Purpose: make Netlify print the *real* Vite error instead of a generic exit code.

What this patch changes
-----------------------
- netlify.toml build command:
    npm install --no-audit --no-fund && npm run prebuild && node ./scripts/run-vite-build.mjs
- Enables Vite internals logging via DEBUG=vite:*.
- Replaces prebuild with a **safe** checker that doesn't import JSX (Node cannot parse JSX).

How to apply
------------
1) Copy these files into your repo (overwrite if prompted):
   - netlify.toml
   - scripts/prebuild-check.mjs
   - scripts/run-vite-build.mjs
2) Ensure your package.json has scripts:
   {
     "scripts": {
       "prebuild": "node ./scripts/prebuild-check.mjs",
       "build": "vite build"
     }
   }
3) Commit and push. Netlify will redeploy and show detailed error logs.

What you'll see on failure
--------------------------
- File path (err.id), plugin, stack, and a code frame (err.frame) from Vite/esbuild.
- From there we can patch the exact file/line causing the build to exit 2.
