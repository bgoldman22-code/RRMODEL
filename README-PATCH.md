# NFL Self-Heal Patch (Blobs write-back + Odds cache)

This patch makes your NFL predictions **self-healing** and removes the **placeholder odds** problem.

## What’s inside

- `netlify/functions/nfl-predictions-generate/index.mjs`
  - Writes `team_form.json` to **Blobs** whenever it had to compute ephemeral team form.
  - Joins cached odds when available; otherwise leaves odds `null` (no fake `+102/-120`).
  - Confidence is only price-calibrated when real odds exist.

- `netlify/functions/_lib/blobs.js`
  - Tiny helpers for JSON get/put with Netlify Blobs.

- `netlify/functions/_lib/schedule-source.mjs`
  - Replaces hard-coded odds with a soft lookup of `odds_week_<W>.json` from Blobs.
  - Sets `oddsSource: 'blobs:week' | 'none'`.

- `netlify/functions/_lib/pred-utils.mjs`
  - American↔implied converters and a simple confidence bucketer derived from **model edge**.

- `netlify/functions/odds-refresh/index.mjs`
  - **Write odds to Blobs** in two ways:
    1) `POST` custom odds JSON `{ week, rows: [{ gameId, ml_home, ml_away }] }`
    2) `GET ?week=#` stub for TheOddsAPI (extend to your mapping; limited usage recommended)
  - Writes `odds_week_<W>.json` → read by schedule source.

- `netlify/functions/odds-status/index.mjs` (extended)
  - Reports presence/last-modified for `team_form.json` and presence/count for `odds_week_<W>.json`.

## How to use

1) **Deploy** these files into your repo (preserving paths).

2) First run (bootstrap):
```
/.netlify/functions/nfl-predictions-generate?season=2025&week=1&force=1
```
- You should see `meta.teamForm.source` like `"ephemeral->blobs"` and future runs read from `blobs`.

3) **Hydrate odds cache** once per week:
- Manual (recommended to start):
```
POST /.netlify/functions/odds-refresh
Content-Type: application/json

{
  "week": 1,
  "rows": [
    { "gameId": "W1-G1", "ml_home": -135, "ml_away": +115 },
    { "gameId": "W1-G2", "ml_home": +105, "ml_away": -125 }
  ]
}
```
- Or expand the GET path to pull from TheOddsAPI sparingly and write to Blobs.

4) **Status check**
```
/.netlify/functions/odds-status?week=1
```
- Returns `hasTeamForm`, `teamFormUpdatedAt`, `hasOddsWeek`, `oddsUpdatedAt`, `oddsCount`.

## Notes

- The demo `computeEphemeralTeamForm` and `synthesizeGamesFromTeamForm` are stubs. Wire them into your existing builders/schedule sources.
- All MLB code paths remain untouched—NFL is **fully isolated**.
- No placeholder odds → no forced uniform `+102` picks or default "5" confidence.
