
# RRModel NFL Predictions – Patch

This patch fixes:
- **Blobs** helper now CommonJS; uses `BLOBS_STORE_NFL` with fallback to `BLOBS_STORE` then **`nfl-td`**.
- Adds **nfl-train** (`netlify/functions/nfl-train/index.cjs`) and **nfl-predictions-generate** (`netlify/functions/nfl-predictions-generate/index.cjs`) implemented in CommonJS to avoid ESM require errors.
- Adds `netlify/build-debug.sh` so your Netlify UI's build command works even if `npm run build` is missing.

## ENV expected

- `BLOBS_STORE_NFL` (optional) → name of Blobs store for NFL model. If unset, falls back to `BLOBS_STORE`, else `nfl-td`.
- Ensure **Netlify Blobs** is enabled for the site.

## Sanity / Debug URLs (for bgroundrobin.com)

1) **Train (default last 4 seasons):**  
https://bgroundrobin.com/.netlify/functions/nfl-train?force=1

2) **Train specific years:**  
https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1

3) **Generate Predictions (stub unless schedule wired):**  
https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate

4) **Generate Predictions with debug sample rows:**  
https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?debug=1

## Notes

- `nfl-train` fetches CSV from: `https://raw.githubusercontent.com/nflverse/nflverse-data/releases/download/games/games_<YEAR>.csv` with fallbacks.
- Features are a minimal **team MOV per game**; extend in future as needed.
- `nfl-predictions-generate` will return empty `rows` until you provide a schedule/odds feed, but `?debug=1` shows example output using the trained features.

