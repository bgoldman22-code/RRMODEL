# Patch: health-blobs Fix

This patch replaces `netlify/functions/health-blobs/index.cjs`.

## What Changed
- Removed invalid `check.blob(...)` call.
- Uses only `store.set()` and `store.get()` from Netlify Blobs.
- Reuses `_blobs.js` helper for credentials.

## Next Steps
1. Replace the file in your repo with this patched version.
2. Commit and redeploy on Netlify.
3. Test with:
   - /.netlify/functions/health-blobs-min
   - /.netlify/functions/health-blobs
   - /.netlify/functions/nfl-depthcharts-seed
   - /.netlify/functions/nfl-depthcharts-get?season=2025&week=1
