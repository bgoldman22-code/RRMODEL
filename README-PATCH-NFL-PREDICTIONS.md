
# RRModel NFL Predictions – Patch v3

- CommonJS functions (avoid ESM require errors)
- Blobs fallback: `BLOBS_STORE_NFL` -> `BLOBS_STORE` -> `nfl-td`
- Build script guard: uses `npm ci` if `package-lock.json` exists, else `npm install`
- Sanity links for **bgroundrobin.com**

## Sanity / Debug Links

- Train (last 4 seasons):  
  https://bgroundrobin.com/.netlify/functions/nfl-train?force=1

- Train specific years:  
  https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1

- Generate predictions:  
  https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate

- Generate predictions (debug):  
  https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?debug=1

