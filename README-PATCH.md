# NFL Predictions — AI Learning (Elo-based) Patch

This patch adds a lightweight **learning** loop (Bayesian-style Elo) using public NFL historical data
(nflverse games). The trainer computes team ratings and stores them in **Netlify Blobs**; the
predictions function then **blends** model win probabilities with market implied percentages from TheOddsAPI.

It does NOT remove your existing functionality. If the model is missing, predictions still work as before.

## New pieces
- `netlify/functions/nfl-train/index.cjs` — on-demand (or scheduled) trainer that pulls nflverse history and saves Elo weights to Blobs.
- `netlify/functions/lib/elo.js` — reusable Elo model helpers.
- `netlify/functions/nfl-predictions-get/index.cjs` — **augmented** to load Elo weights (if present) and blend with market.
- `src/components/ConfidenceBar.jsx` — tiny UI element (already used) unchanged.
- `README-PATCH.md` — this file.

## How to run training (manual)
```bash
# trigger training for current season (uses previous 10 seasons to warm start)
curl -sS "https://YOUR_SITE/.netlify/functions/nfl-train?season=2025&rebuild=1"
```

You should see `{ ok: true, season: 2025, teams: 32, wrote: "models/nfl/2025/elo.json" }`

## Schedule it (GitHub Actions)
Create `.github/workflows/nfl-train.yml` (Mon 7:30am ET):
```yaml
name: nfl-train
on:
  schedule: [{ cron: "30 11 * * 1,2" }]  # Mon & Tue 11:30 UTC ~ 7:30am ET
  workflow_dispatch: {}
jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - name: Kick trainer
        run: |
          curl -sS --fail "https://YOUR_SITE/.netlify/functions/nfl-train?season=$(date +%Y)&rebuild=1"
```

## Env vars
Uses the same **Netlify Blobs** configuration you already set (`NETLIFY_SITE_ID`, `NETLIFY_BLOBS_TOKEN`).
No new secrets are required for the trainer.

## What the trainer does
- Fetches `games.csv.gz` from nflverse (completed games only).
- Iterates chronologically and updates **Elo ratings** with home-field advantage.
- Stores: `{ season, trained_at, elo: { ratings: { TEAM: rating }, k, hfa } }`
  at `models/nfl/<season>/elo.json` in Blobs.

## How predictions change
- Loads Elo (if available) and computes **model win probability** for each game using Elo logistic.
- Blends with **market implied** (60% model / 40% market by default) for moneyline pick & confidence.
- Spread/Total picks keep existing behavior until we add ATS/OU confidences.

You can adjust blend in `nfl-predictions-get/index.cjs` (see `MODEL_BLEND_ALPHA`).
