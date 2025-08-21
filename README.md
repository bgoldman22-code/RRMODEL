# Netlify Blobs Fallback Patch

This patch prevents `MissingBlobsEnvironmentError` by:
- Trying the managed Blobs env first,
- Falling back to manual credentials via `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN` (if you set them),
- And finally using an in-memory no-op store (so functions never crash).

## What to set (recommended)
In Netlify → **Site settings → Environment variables**:

- `NFL_TD_BLOBS` (optional): name of your Blobs store (default `nfl-td`).
- *(Preferred)* Enable **Netlify Blobs** for the site (no extra env needed), **or** set:
  - `NETLIFY_SITE_ID` – find it in Site settings → General → Site details.
  - `NETLIFY_AUTH_TOKEN` – create a Personal Access Token in your Netlify User settings.

With those two set, Blobs will work even if the managed env isn’t detected.

## Files in this patch
- `netlify/functions/_shared/rosters-shared.cjs` — safe `getStoreSafe()` wrapper + shared updater code.

You do **not** need to change your scheduled or manual functions — they import `{ runUpdate }` from this file and will now work even if Blobs wasn’t configured yet.
