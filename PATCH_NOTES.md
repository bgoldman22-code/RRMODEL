# NFL Blobs Patch – Fixed v3

This patch aligns the NFL functions' Blobs usage with MLB and prevents the
`MissingBlobsEnvironmentError` by introducing a shared helper that gracefully
falls back to env-supplied credentials when Netlify's auto context isn't
present.

## Included files
- `netlify/functions/_lib/blobs-helper.mjs`
- `netlify/functions/_lib/respond.js` (tiny JSON response helper)

### How to use

1) **Import the helper in NFL functions** that read/write Blobs:
```js
// before
// import { getStore } from '@netlify/blobs';

// after
import { blobsStore, blobsGetJSON, blobsSetJSON } from './_lib/blobs-helper.mjs';
```

2) **Create/read the NFL store** consistently (same as MLB):
```js
const STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl';
const store = await blobsStore(STORE_NAME);

// read JSON
const schedule = await blobsGetJSON(store, 'weeks/2025/1/schedule.json');

// write JSON
await blobsSetJSON(store, 'weeks/2025/1/schedule.json', scheduleObj);
```

3) **Optional env safety-net (recommended):**
Add these in Netlify → Site settings → Build & deploy → Environment:
- `NETLIFY_BLOBS_SITE_ID` = your Site ID
- `NETLIFY_BLOBS_TOKEN`   = a Personal Access Token with Blobs access

These are only used if the platform doesn’t inject credentials at runtime.

---

## Semicolon error in `nfl-td-candidates.mjs`

Netlify/esbuild reported:

```
ERROR: Expected ";" but found "$"
netlify/functions/nfl-td-candidates.mjs:95:14
   why: `${pos} • depth ${idx+1} • vs ${opp||"?"}`
```

**Fix:** end the property with a comma (inside an object literal) or close the
object and add a semicolon. Example inside an object literal:

```js
const row = {
  player: fullName,
  pos,
  modelTD: pct,
  rz: rzPct,
  exp: expPct,
  why: `${pos} • depth ${idx+1} • vs ${opp || "?"}`,
};
```

If it was the final statement in a block (rare), end with `;`.

---

## Make sure all serverless files match the module type

Your `package.json` sets `"type": "module"`. Any CommonJS handlers should use
the `.cjs` extension, or convert them to ESM:

- If you see `exports.handler = async (event) => { ... }` in a `.js` file,
  either rename the file to `.cjs`, or rewrite as ESM:

```js
export const handler = async (event, context) => {
  // ...
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
```

Keep consistency across `netlify/functions/**` to avoid the esbuild warnings.

---

## Where to check after patch

- `/._netlify/functions/nfl-bootstrap?refresh=1&mode=auto&debug=1` should return schedule JSON.
- `/._netlify/functions/nfl-rosters-list` should list `weeks/{season}/{week}/depth/*.json` and `weeks/{season}/{week}/schedule.json`.
- `/._netlify/functions/nfl-data?type=schedule&season=2025&week=1` should return schedule from Blobs.
- `/._netlify/functions/nfl-td-candidates?debug=1` should progress beyond the earlier “schedule unavailable”.

If `nfl-data?type=schedule` still returns `{"ok":false,"error":"no data"}` while
`nfl-rosters-list` clearly shows the key, it means the function isn't connected
to the same store at runtime. Setting the two env vars above resolves it.
