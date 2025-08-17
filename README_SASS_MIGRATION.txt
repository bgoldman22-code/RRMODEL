Sass Fix Patch (node-sass → sass)
=================================

Why you're failing:
- Your Netlify build uses Node 20. The `node-sass` package is deprecated and does not support Node 20 (it needs native bindings).
- Vite/modern bundlers use **Dart Sass** via the `sass` npm package. Once `sass` is installed, .scss/.sass files work automatically.

Two safe fixes (pick ONE):

Option A — Recommended (switch to `sass`)
----------------------------------------
1) Edit your package.json:
   - REMOVE "node-sass" from dependencies/devDependencies (if present).
   - ADD "sass" to devDependencies (or dependencies). For example:

   {
     "devDependencies": {
       "sass": "^1.77.6"
     }
   }

2) Commit package.json and re-deploy.

3) No code changes needed for Vite: keep your `import "./styles.scss"` etc.

Option B — Keep node-sass (NOT recommended)
-------------------------------------------
- Pin Node 16 in Netlify (Site settings → Build & deploy → Environment → add `NODE_VERSION=16`).
- Install a node-sass version compatible with Node 16.
- This is legacy and may break later; use only if you cannot switch right now.

Included files in this patch
----------------------------
- PACKAGE_JSON_PATCH.json   → a minimal merge snippet adding "sass" to devDependencies
- scripts/check-sass.mjs    → optional prebuild checker to ensure 'sass' is installed and 'node-sass' isn't blocking the build

How to use the checker (optional)
---------------------------------
1) Put scripts/check-sass.mjs into your repo.
2) In package.json, add:
   "scripts": {
     "prebuild:sass": "node ./scripts/check-sass.mjs"
   }
3) Run `npm run prebuild:sass` locally or add it to your Netlify build command before `vite build`.
