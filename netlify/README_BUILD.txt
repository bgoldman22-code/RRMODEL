# Build Script Notes

This build script is designed to avoid the common "exit code 2" failure by:
- Installing with `npm ci` for reproducible deps.
- Using your existing `npm run build` (Vite).
- Not executing any serverless function files during build.
- Verifying that `dist/` exists before exiting.

If your site still fails:
1) Check `package.json` has `"build": "vite build"` and the Vite config outputs to `dist/`.
2) Ensure no pre/post scripts run function code at build time.
3) Confirm Netlify settings:
   - Build command: `bash netlify/build-debug.sh`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

This patch does not modify your functions or MLB pipelines.
