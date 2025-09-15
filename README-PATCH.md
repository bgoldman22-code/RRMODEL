# Netlify Blobs Context Hotfix

**Fixes:** `SyntaxError: '@netlify/blobs' does not provide an export named 'createClient'`

## What changed
- Removed **all** imports from `@netlify/blobs` in your functions.
- Added a context-aware helper that uses **`context.blobs`** (available inside Netlify Functions).
- Updated `odds-refresh` and `odds-status` to use the helper.

## Usage
1. Deploy these files.
2. Ensure env var `ODDS_API_KEY` (or `THEODDSAPI_KEY`) is set.
3. Seed odds:
   ```
   https://bgroundrobin.com/.netlify/functions/odds-refresh?week=1&bookmaker=fanduel
   ```
4. Status:
   ```
   https://bgroundrobin.com/.netlify/functions/odds-status?week=1
   ```

No other changes required.
