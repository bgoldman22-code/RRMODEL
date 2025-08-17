README — Build Fix Bundle (backend-only)
=======================================

This bundle adds:
1) scripts/prebuild-check.mjs — verifies required deps without touching JSX
2) netlify.toml — ensures functions bundle and includes external node modules
3) netlify/functions/fd-proxy.cjs — CommonJS-safe proxy (replaces fd-proxy.js)
4) netlify/functions/mlb-slate-lite_orig.mjs — shim to satisfy wrapper import
5) netlify/functions/_lib/_orig/lib/*.js — neutral stubs for missing local libs

You STILL need these in package.json (add if missing):
------------------------------------------------------
"scripts": {
  "prebuild": "node --experimental-modules ./scripts/prebuild-check.mjs",
  "build": "vite build"
},
"dependencies": {
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "@netlify/blobs": "^6.4.0",
  "node-fetch": "^3.3.2"
}

After committing these files and the package.json edits, deploy on Netlify.
If any function later imports the real lib files, replace the stubs with
your actual implementations (these return neutral 1.0 scalers).
