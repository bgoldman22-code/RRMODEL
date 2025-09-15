# NFL Predictions — Train Function Patch

This patch adds the missing **`netlify/functions/nfl-train/index.mjs`** and small helpers, so the
predictions generator can find `team_form.json` in Netlify Blobs.

## What’s included
- `netlify/functions/nfl-train/index.mjs` — pure ESM, Node 18+, Netlify Blobs v5.
- `netlify/functions/_lib/blobs-helper.mjs` — thin wrapper around `@netlify/blobs` v5.
- `netlify/functions/_lib/fastr-sources.mjs` — resilient fetcher for nflverse game CSVs (multiple fallbacks).
- `netlify/functions/_lib/csv.mjs` — tiny CSV parser (no deps).

## Usage (after deploy)
1. (Optional) Set env vars in Netlify:
   - `BLOBS_STORE_NFL=nfl-model` (or your chosen store name)
   - Ensure Site has **Blobs enabled** (Netlify Dashboard → Storage → Blobs).
2. Trigger train (builds features and writes `team_form.json`):
   - `/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1`
     - You can also do: `?season=2025&week=1&force=1` (season/week is ignored for training, here for symmetry).
3. Generate predictions for UI:
   - `/.netlify/functions/nfl-predictions-generate?force=1`

## Notes
- If nflverse moves files again, the train function cycles through several known URL patterns.
- If all sources fail for a year, you’ll still get a JSON `logs` array explaining which URLs failed.
- Stored key is `team_form.json` in store `${process.env.BLOBS_STORE_NFL || 'nfl-model'}`.

