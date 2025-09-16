# Patch: Switch NFL blobs helper to getStore()

This patch provides a safe `blobs-nfl.js` that uses **`@netlify/blobs` `getStore()`**
and does **not** rely on `context.blobs` or per-function TOML bindings.

## Files in this patch
- `netlify/functions/_lib/blobs-nfl.js`

## Why this change
- Your previous deploys failed with `[[functions.blobs]]` array-of-tables.
- Using `getStore()` avoids special `netlify.toml` bindings. It works as long as
  `@netlify/blobs` is installed and your site is running on Netlify Functions.

## Environment
Ensure you have this env var set (Netlify UI → Site settings → Environment):
```
BLOBS_STORE_NFL = "nfl-td"
```
If not set, the helper defaults to `nfl-td`.

## No netlify.toml changes required
Keep your existing `netlify.toml` as-is (build dir, bundler, etc.).
Do **not** add `[[functions.blobs]]` blocks unless you intentionally want the
context-binding path. This helper **does not** use `context.blobs`.

## Quick smoke
- `/.netlify/functions/teamform-refresh?force=1`
- `/.netlify/functions/odds-refresh?week=1&bookmaker=fanduel&force=1`
- `/.netlify/functions/odds-status?week=1`
- `/.netlify/functions/nfl-predictions-generate?season=2025&week=1`
