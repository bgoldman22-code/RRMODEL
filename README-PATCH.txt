# Patch for main31 — odds-status ESM fix, Blobs helper, train wrapper, build script

## What this fixes
1) **ERR_REQUIRE_ESM** on `odds-status.mjs` (Netlify was requiring an ESM file)
2) Missing/legacy Blobs helper features (`makeStore`, env fallbacks incl. `BLOBS_STORE_NFL` → `BLOBS_STORE` → `nfl-td`)
3) Similar ESM/CJS bootstrap for `nfl-train`
4) Build pipeline resilience (no lockfile → falls back to `npm install`; missing build script won’t fail)

## Files to drop in (preserve tree)
```
netlify/functions/odds-status/index.cjs          <-- CJS wrapper
netlify/functions/odds-status/handler.mjs        <-- your ESM logic lives here
netlify/functions/_lib/blobs-helper.mjs          <-- updated helper with makeStore + fallbacks
netlify/functions/nfl-train/index.cjs            <-- CJS wrapper
netlify/functions/nfl-train/handler.mjs          <-- lightweight trainer (writes team_form.json)
netlify/build-debug.sh                           <-- tolerant build
netlify.toml                                     <-- external_node_modules includes csv-parse
package.json                                     <-- adds @netlify/blobs and csv-parse
```

> Replace/rename any existing `netlify/functions/odds-status.mjs` entry file. The wrapper now lives at `odds-status/index.cjs` and dynamically imports `handler.mjs`.

## Environment variable fallback
- Uses **BLOBS_STORE_NFL** first
- Then **BLOBS_STORE**
- Then hard-defaults to **"nfl-td"**

## Sanity / debug URLs (copy & paste, your domain)
- Schedule (odds fallback):
  https://bgroundrobin.com/.netlify/functions/nfl-schedule-get?force=1
- Generate predictions (uses model + form if present):
  https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1
- Train (lightweight decay-only form; safe until full-history fetch is patched):
  https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
  https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1

## Notes
- This patch doesn’t change your UI. It just stabilizes function bootstrapping and Blobs usage.
- The included `nfl-train/handler.mjs` writes a minimal **team_form.json** even without nflfastR URLs. You can swap it later for the full historical trainer.
