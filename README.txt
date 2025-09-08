# patch-step1j-permanent-deps-fix

This patch makes the **permanent** fix for the bad `debug` package version:

- Adds `scripts/preinstall-fix.js` which:
  - Ensures `package.json` has `"overrides": { "debug": "4.3.4" }`
  - Normalizes any direct `"debug"` dep to `"4.3.4"`
  - Ensures `"scripts.preinstall"` runs this fixer each build

- Replaces `netlify/build-debug.sh` with a lean script that:
  - Forces the npm registry
  - Clears npm cache and removes `package-lock.json` + `node_modules`
  - Runs `npm install` (which triggers the preinstall hook)
  - Builds your site

## How to apply
1) Upload this entire folder to your repo root and commit:
   - `patch-step1j-permanent-deps-fix/scripts/preinstall-fix.js`
   - `patch-step1j-permanent-deps-fix/netlify/build-debug.sh`

2) **Delete** `package-lock.json` from the repo (in GitHub UI, remove the file and commit).

3) Ensure Netlify settings:
   - Build command: `bash netlify/build-debug.sh`
   - Functions directory: `netlify/functions`
   - Publish directory: `dist`

This is permanent because the preinstall hook runs on every install and keeps `overrides.debug = "4.3.4"` in `package.json` (and fixes any accidental reintroduction).
