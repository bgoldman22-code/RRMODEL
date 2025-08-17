Patch: switch Netlify build from `npm ci` to `npm install`
=========================================================

Why this fixes your error
-------------------------
`npm ci` *requires* a committed package-lock.json (or npm-shrinkwrap.json). Your repo
doesn't have one, so Netlify exits with EUSAGE before building.

This patch updates `netlify.toml` to run:
  npm install --no-audit --no-fund && npm run prebuild && npm run build

That works **without** a lockfile. Later, if you want reproducible builds, run `npm install`
locally to generate a package-lock.json, commit it, and then change the command back to `npm ci`.

What to do
----------
1) Drop this `netlify.toml` into your repo root (overwrite the existing one).
2) Ensure your package.json has scripts:
   {
     "scripts": {
       "prebuild": "node ./scripts/prebuild-check.mjs",
       "build": "vite build",
       "dev": "vite",
       "preview": "vite preview --port 4173"
     }
   }
3) Commit to main and let Netlify redeploy.

Optional (recommended later)
----------------------------
- After this succeeds, run `npm install` locally and commit the generated `package-lock.json`.
- Then you can flip Netlify's build back to `npm ci && npm run prebuild && npm run build` for locked installs.
