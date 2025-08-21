# Netlify CORS + Connectivity Patch

This patch adds:
- `netlify/functions/ping.cjs` — simple GET/POST/OPTIONS endpoint to verify your functions work and CORS is open.
- `netlify/functions/mlb-hr-generate-exp.cjs` — the POST endpoint with full CORS handling (OPTIONS + headers on every response).

## Test connectivity (no middleware needed)

1) Deploy the repo.
2) Visit in your browser (GET):
   - `https://YOUR_SITE/.netlify/functions/ping` → should return `{ ok: true, message: "pong" }`
3) Test POST from Hoppscotch/ReqBin:
   - URL: `https://YOUR_SITE/.netlify/functions/mlb-hr-generate-exp`
   - Method: POST
   - Header: `Content-Type: application/json`
   - Body (example):
     ```json
     { "picks":[ { "player":"Aaron Judge", "model_hrp":0.40, "odds":215 } ], "known_out":[] }
     ```

If `ping` works but `mlb-hr-generate-exp` fails, the issue is likely JSON/body formatting. If neither works, check your site URL (use the `*.netlify.app` URL) and Netlify deploy logs.
