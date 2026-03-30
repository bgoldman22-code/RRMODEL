# MLB F5 ML Live Feature Builder — Status Checkpoint

**Date:** March 25, 2026  
**Branch:** main42  
**Status:** SCALING FIX IN PROGRESS — Almost Production-Ready

---

## What Was Built

### 1. `scripts/mlb_f5/build_live_features.py` (NEW — ~1,150 lines)
Complete live feature builder that computes all 253 model features from real-time data:

- **Data Sources (all confirmed working):**
  - pybaseball Statcast: barrel%, EV, whiff%, chase%, hard_hit%, pitch-type breakdowns (673 batters, 873 pitchers)
  - pybaseball FanGraphs batting_stats: GB%, FB%, Contact% (493 ID mappings via playerid_reverse_lookup)
  - MLB Stats API: basic batting stats (AVG/OBP/SLG/ISO/K%/BB%/HR per PA)
  - MLB Stats API: pitcher game logs (for L2/L3/L5/L10/L20 rolling windows)
  - MLB Stats API: schedule, probable pitchers, lineups

- **Feature Name Match: 253/253 PERFECT** ✅
  - All feature names exactly match `ml/f5_ml/artifacts/features.json`
  - Verified via programmatic comparison

- **Coverage: 253/253 features with data, 100% cells filled** ✅
  - Tested on 2025-09-15 (9 games)
  - Total runtime: ~10-15 seconds (with cached Statcast profiles)
  - First run: ~30-60s (downloads Statcast leaderboards)

- **Caching:** 12-hour disk cache for Statcast profiles → `tmp/f5_ml_cache/`

### 2. `scripts/mlb_f5/generate_f5_ml.py` (MODIFIED)
- Added live feature builder fallback at line ~246
- Flow: Check cached live features → Try historical parquet → Invoke live builder
- Falls back to subprocess call if direct import fails
- `target_ts` properly defined before feature loading section

### 3. `.github/workflows/mlb-f5-ml-smart.yml` (MODIFIED)
- Added `pybaseball` to pip install step
- Added new "Build live features" step before "Generate picks"
- Runs: `python scripts/mlb_f5/build_live_features.py --date $TARGET_DATE --outdir tmp/f5_ml_cache`

---

## CURRENT ISSUE: Feature Value Scaling Mismatch

**Identified but NOT yet fixed.** Live feature values are systematically higher than historical:

| Feature | Live Mean | Historical Mean | Ratio |
|---------|-----------|-----------------|-------|
| barrel_pct | 0.1013 | 0.0337 | 3.0x |
| whiff_pct | 0.4375 | 0.2348 | 1.9x |
| chase_pct | 0.5153 | 0.2840 | 1.8x |
| ev_mean | 89.73 | 83.21 | +6.5 mph |
| hard_hit_pct | 0.5047 | 0.3340 | 1.5x |
| k_pct | 0.3698 | 0.2167 | 1.7x |
| bb_pct | 0.1469 | 0.0808 | 1.8x |

**Root Cause Analysis Needed:**
- The `_safe_pct()` function divides values > 1.0 by 100 (e.g., 10.13 → 0.1013)
- But the historical parquet stores barrel_pct as 0.0337 (3.37%)
- This suggests the historical features were computed differently — possibly:
  1. Different Statcast data source or different percentile encoding
  2. The historical pipeline aggregated stats differently
  3. The Statcast leaderboard returns per-batter rates while historical uses per-PA rates
  4. Some features in historical may use z-scores or percentile ranks instead of raw rates

**Next Step:** Investigate the historical feature pipeline (`ml/f5_ml/` training code) to understand exact computation methodology, then align the live builder to match.

---

## Files Modified (Uncommitted)

1. `scripts/mlb_f5/build_live_features.py` — NEW file, complete live builder
2. `scripts/mlb_f5/generate_f5_ml.py` — Added live builder integration
3. `.github/workflows/mlb-f5-ml-smart.yml` — Added pybaseball + build step

## Files Created (Cache — gitignored)

- `tmp/f5_ml_cache/statcast_profiles_2025.json` — 673 batter Statcast profiles
- `tmp/f5_ml_cache/pitcher_statcast_2025.json` — 873 pitcher profiles
- `tmp/f5_ml_cache/live_features_2025-09-15.parquet` — Test output (9 games)

---

## Architecture Summary

```
Game Day Flow:
1. GitHub Actions cron fires (every 30 min during baseball hours)
2. decide_run.mjs → determines TARGET_DATE and RUN_LABEL
3. fetch_odds_today.mjs → gets F5 odds from TheOddsAPI → uploads to Blobs
4. build_live_features.py → builds 253 features from Statcast + MLB API [NEW]
5. generate_f5_ml.py → loads live features, scores with frozen model, applies thresholds
6. upload_to_blobs.mjs → publishes picks to Netlify Blobs
7. f5-ml-latest.mjs serverless function → serves picks to frontend
8. MLBF5ML.jsx → displays picks

Live Feature Builder Data Flow:
  Schedule (MLB API) → game_pk, lineups, probable pitchers
  Statcast (pybaseball) → barrel%, EV, whiff%, chase%, hard_hit%, pitch arsenal
  FanGraphs (pybaseball) → GB%, FB%, Contact% (with ID mapping)
  MLB API batting → AVG, OBP, SLG, ISO, K%, BB%, HR/PA
  MLB API pitcher logs → L2/L3/L5/L10/L20 rolling ERA/FIP/WHIP/K-BB%/etc.
  → Assembles 253 features per game → parquet output
```

---

## What's Left Before Opening Day (March 26, 2026)

### CRITICAL (must fix)
- [ ] **Fix feature scaling mismatch** — Live values ~2-3x higher than historical
  - Need to investigate historical pipeline's exact computation
  - May need to adjust `_safe_pct()` or remove the division
  - OR the historical data may use different units

### IMPORTANT (should do)
- [ ] Run end-to-end test with scoring (generate_f5_ml.py with live features + odds)
- [ ] Verify ODDS_API_KEY is set in GitHub Secrets
- [ ] Verify NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in GitHub Secrets
- [ ] Run seed workflow for consensus parquets (if needed)
- [ ] Commit and push to main42

### MLB RR V2 (separate system)
- [ ] Verify mlb-rr-daily scheduled function fires after deploy
- [ ] Confirm ODDS_API_KEY env var on Netlify

---

## Key Technical Details

### Model Artifacts (Frozen — DO NOT MODIFY)
- `ml/f5_ml/artifacts/model.joblib` — LogisticRegression (C=0.01)
- `ml/f5_ml/artifacts/scaler.joblib` — StandardScaler
- `ml/f5_ml/artifacts/features.json` — 253 feature names
- `ml/f5_ml/artifacts/means.json` — 253 training-set means (NaN imputation)
- Frozen date: 2026-02-09
- Trained on: 8,201 games (2022-2025)
- Thresholds: EV≥10%, Edge≥7%, odds -200 to +300

### Feature Categories (253 total)
- 96 lineup features (48 unique × home/away)
- 92 SP rolling features (46 unique × home/away)
- 52 interaction features (26 unique × home/away)
- 13 diff features (3 team run diff + 10 SP ERA/FIP diff)

### Python Environment
- venv at `.venv/bin/python` (Python 3.13.6)
- Key packages: pandas, scikit-learn, joblib, numpy, pyarrow, pybaseball (2.2.7)
