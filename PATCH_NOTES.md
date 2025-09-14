# RRM Patch – 2025‑09‑14

**What’s included (updated files only):**
- `netlify/functions/_lib/blobs-helper.mjs` – removes `createClient` usage, adds `openStore()` compatible with current `@netlify/blobs`.
- `netlify/functions/_lib/logger.cjs` – simple LOG_LEVEL logger (`error|warn|info|debug|trace`).
- `netlify/functions/nfl-depthcharts-import-sportsdataio/index.cjs` – fixes duplicate `"NYG"` key.
- `netlify/functions/nfl-predictions-generate/index.cjs` – defines `rows`, fixes `finally` syntax error, adds odds-fallback builder and debug logging, supports `?source=odds&limit=&log=`.
- `netlify/functions/nfl-rosters-run.mjs` – imports `openStore` from the new helper and adds a heartbeat write.

**Sanity checks (copy/paste):**
- Odds bridge: `/.netlify/functions/nfl-odds-bridge`
- Force odds-only: `/.netlify/functions/nfl-predictions-generate?force=true&source=odds&limit=5&log=debug`
- Default (schedule if present else odds): `/.netlify/functions/nfl-predictions-generate?force=true&log=debug`

**Env (optional):**
- `NETLIFY_BLOBS_SITE_ID`, `NETLIFY_BLOBS_TOKEN` – only needed if your env requires explicit creds.
- `SCHEDULE_URL`, `ODDS_URL`, `TEAM_FORM_URL` – override endpoints if desired.
