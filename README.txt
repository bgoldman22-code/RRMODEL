# patch-step1k-packagejson-override

This patch makes the **permanent fix** for the bad `debug` package version:

- Updates `package.json` to include:
  ```json
  "overrides": {
    "debug": "4.3.4"
  }
  ```
  and ensures no dependency is pinned to 4.4.2.

- Adds `scripts/preinstall-fix.js` as a safety net to keep it pinned.

- Provides `netlify/build-debug.sh` to clean cache, reinstall, and build.

## How to apply
1) Apply this patch to your repo root. Commit the new files and the edited `package.json`.
2) Verify your `package.json` now shows `"overrides": { "debug": "4.3.4" }` near the top-level.
3) Update Netlify build settings:
   - Build command: `bash netlify/build-debug.sh`
   - Functions directory: `netlify/functions`
   - Publish directory: `dist`
4) Trigger "Clear cache and deploy site" on Netlify.

This combination is clean (override visible in repo) and robust (preinstall keeps it sane).
