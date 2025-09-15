# NFL Predictions Patch

## Sanity / Debug URLs (your site)
- Train (multi-year): https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1
- Train (single week older param kept for compatibility): https://bgroundrobin.com/.netlify/functions/nfl-train?season=2025&force=1
- Generate predictions: https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?force=1

## Notes
- Blobs store fallback: `BLOBS_STORE_NFL` → `BLOBS_STORE` → **nfl-td**
- Server logs contain `[NFL-TRAIN]` and `[NFL-PICKS]` plus `[PREDICTION]` rows.
