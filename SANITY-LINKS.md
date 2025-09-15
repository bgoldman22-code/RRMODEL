
# Patch HOWTO (bgroundrobin.com)

1) **Env (one time)**
   - BLOBS_STORE_NFL=nfl-td  (fallback chain: BLOBS_STORE_NFL → BLOBS_STORE → nfl-td)
   - Enable **Netlify Blobs** for the site.

2) **Deploy** the repo with these patch files.

3) **Train** (default last 4 seasons):
   https://bgroundrobin.com/.netlify/functions/nfl-train?force=1

   **Train specific years**:
   https://bgroundrobin.com/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1

4) **Generate predictions** (uses team_form.json from Blobs):
   https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate

   **Debug sample rows (no schedule wired)**:
   https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?debug=1
