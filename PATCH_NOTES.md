# Patch: Fix invalid lambda status code + safer responses & logging

**Why you saw** `error decoding lambda response: invalid status code returned from lambda: 0`  
Netlify reports status code 0 when your function throws *before* returning a valid object shaped like:
`{ statusCode, headers, body }`. Common culprits:
- Uncaught exception (e.g., `rows` not defined)
- Returning a plain object/Response that esbuild didn't polyfill
- Non-JSON body or non-string `body`
- Large/circular logs crashing serialization

## What this patch adds
1. `netlify/functions/_lib/http.cjs`  
   Helpers to always return valid responses (`ok`, `badRequest`, `internalError`), with JSON serialization guards and CORS headers.
2. `netlify/functions/_lib/logger.cjs`  
   Small logger that truncates huge payloads and honors `LOG_LEVEL` (override with `?log=debug`).
3. `netlify/functions/nfl-predictions-generate/index.cjs`  
   Wrapped in `try/catch`, uses the helpers to **always** return `{statusCode, headers, body}`.  
   It logs the row count and a sample but will not crash if rows are missing.

## Sanity checks (after deploy)
- Basic ping:  
  `/.netlify/functions/nfl-predictions-generate`
- With debug logs:  
  `/.netlify/functions/nfl-predictions-generate?log=debug`
- Limit rows (without crashing):  
  `/.netlify/functions/nfl-predictions-generate?limit=5&log=debug`

> Integrate your actual generation logic inside `generatePredictions()` or keep your existing pipeline and only retain the **response pattern** and **try/catch** from this file.

