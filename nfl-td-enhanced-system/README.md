# NFL TD Enhanced — Netlify + R Pipeline

This package gives you a ready-to-deploy Netlify Function that serves **Anytime TD predictions**.
Predictions are generated **offline** by an R pipeline (using `nflreadr`) and stored either in:
- Netlify **Blobs** (recommended), or
- committed JSONs under `data/nfl_r_pipeline/output/`

## Deploy summary
- **Function endpoint:** `/.netlify/functions/nfl-td-predictions-enhanced?type=lite|enhanced`
- **Optional admin upload:** `/.netlify/functions/td-upload-from-disk` (POST), then delete/disable
- **Env vars (optional):** `BLOBS_STORE_TD` or `BLOBS_STORE_NFL`

## Quick start

### 1) Generate predictions (locally with R)
```bash
Rscript scripts/nfl-td-r-pipeline/setup.R
Rscript scripts/nfl-td-r-pipeline/build_td_predictions.R --season 2025
```
This writes:
- `data/nfl_r_pipeline/output/nfl_td_predictions_lite.json`
- `data/nfl_r_pipeline/output/nfl_td_predictions_enhanced.json`

### 2a) (Recommended) Upload to Netlify Blobs
Temporarily deploy with `netlify/functions/td-upload-from-disk.js` included, then:
```bash
curl -X POST https://YOUR_SITE.netlify.app/.netlify/functions/td-upload-from-disk
```
Then remove/disable that function.

**OR**

### 2b) Commit JSONs
Commit the two JSON files to GitHub so the serving function can read from disk.

### 3) Consume from the web
Your frontend can fetch either variant:
```http
/.netlify/functions/nfl-td-predictions-enhanced?type=lite
/.netlify/functions/nfl-td-predictions-enhanced?type=enhanced
```

## Notes on accuracy
- The included model is a **strong baseline**: it uses team TD rate, player red-zone share, and recent TD form.
- You can improve accuracy by enriching with roster positions and opponent adjustments (join `nflreadr::load_player_stats` / schedules).
