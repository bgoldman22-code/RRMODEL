# NFL V4.1 Deployment Guide

**Status**: 🟡 Ready for Integration (Needs 2025 Features)  
**Date**: November 4, 2025  
**Current Week**: 9 (2025-2026 Season)

---

## ✅ What's Complete

### 1. ML Pipeline (Training & Validation)
- ✅ Direct ML Logistic Regression trainer (L2, time-aware CV)
- ✅ Stacking with spread prior (blend λ=0)
- ✅ Platt calibration (a=1.48, b=0.003)
- ✅ Holdout evaluation (2024: AUC 0.705, ROI +31%)
- ✅ **All acceptance gates passed**

### 2. Prediction Scripts (2025 Season Aware)
- ✅ `nfl-model-v4.1/scripts/04-predict-spread.mjs` - V3/V4 EPA spread model
- ✅ `nfl-model-v4.1/scripts/05-predict-total.mjs` - V3 pace+EPA total model
- ✅ `nfl-model-v4.1/scripts/12-predict-ml-direct.mjs` - Calibrated ML predictions
- ✅ `nfl-model-v4.1/scripts/12-make-public-bundle.mjs` - Schema merger (matches UI)
- ✅ `nfl-model-v4.1/scripts/_lib/schedule.mjs` - Week detection (matches existing system)

### 3. Netlify Functions (Independent Infrastructure)
- ✅ `netlify/functions/_lib/blobs-nfl-v41.mjs` - Blob storage helper (isolated bucket)
- ✅ `netlify/functions/nfl-v41-latest.mjs` - GET latest predictions
- ✅ `netlify/functions/nfl-v41-by-date.mjs` - GET historical predictions by date
- ✅ `netlify/functions/nfl-v41-refresh.mjs` - Scheduled daily refresh

### 4. Frontend
- ✅ `src/pages/nfl-v4.jsx` - New page (reuses NFLPredictionsTable component)
- ✅ Independent data loading from V4.1 endpoints
- ✅ Model metadata display (sources, performance, updated time)

---

## 🟡 What's Needed

### Critical: 2025 Season Features
**Problem**: V4.1 scripts look for `features_2025.json` but only 2020-2024 exist.

**Solutions** (choose one):

#### Option A: Generate 2025 Features (Recommended)
Run the existing feature generation pipeline for 2025:
```bash
# If using V3 pipeline
cd nfl-model-v3
node scripts/02-prepare-nflverse-data.mjs --season 2025
node scripts/03-generate-features.mjs --season 2025

# This creates:
# nfl-model-v3/data/processed-features/features_2025.json
# nfl-model-v3/data/nflverse/game_aggregates_2025.json
```

#### Option B: Live Feature Generation in Netlify Function
Modify `nfl-v41-refresh.mjs` to generate features on-demand:
```javascript
// Add before prediction steps
await $`node nfl-model-v3/scripts/02-prepare-nflverse-data.mjs --season 2025`;
await $`node nfl-model-v3/scripts/03-generate-features.mjs --season 2025`;
```

#### Option C: Use Existing R Pipeline Data
If your R pipeline already generates 2025 features, create a symlink:
```bash
ln -s /path/to/r/pipeline/features_2025.json nfl-model-v3/data/processed-features/
```

---

## 📋 Deployment Checklist

### Phase 1: Local Testing
- [ ] Generate 2025 features (see options above)
- [ ] Run full V4.1 pipeline locally:
  ```bash
  cd /Users/brentgoldman/Desktop/REPO33/RRMODEL
  node nfl-model-v4.1/scripts/04-predict-spread.mjs
  node nfl-model-v4.1/scripts/05-predict-total.mjs
  node nfl-model-v4.1/scripts/12-predict-ml-direct.mjs
  node nfl-model-v4.1/scripts/12-make-public-bundle.mjs
  ```
- [ ] Verify `nfl-model-v4.1/output/bundle.json` has correct schema
- [ ] Test bundle has current week games (Week 9/10 for 2025)

### Phase 2: Netlify Configuration
- [ ] Add to `netlify.toml`:
  ```toml
  [functions]
    included_files = ["nfl-model-v4.1/**", "nfl-model-v3/data/**"]
  
  [[scheduled]]
    path = "/.netlify/functions/nfl-v41-refresh"
    schedule = "0 9 * * *"  # 09:00 UTC daily
  ```
- [ ] Deploy functions
- [ ] Test endpoints:
  - `/.netlify/functions/nfl-v41-latest` (should return bundle)
  - `/.netlify/functions/nfl-v41-by-date?date=2025-11-04`

### Phase 3: Frontend Integration
- [ ] Add navigation link to V4 page (in your nav/menu component)
- [ ] Test `/nfl-v4` route renders correctly
- [ ] Verify table displays games with ML/spread/total picks
- [ ] Check mobile responsive design

### Phase 4: Production Validation
- [ ] Monitor first scheduled run (check Netlify function logs)
- [ ] Verify blob storage populated:
  - `nfl-v41/predictions/latest.json`
  - `nfl-v41/predictions/YYYY-MM-DD/bundle.json`
  - `nfl-v41/predictions/summary.json`
- [ ] Compare V4.1 picks vs existing NFL page (expect differences due to new ML)
- [ ] Track performance over first 2 weeks

---

## 🔧 Troubleshooting

### "Missing features_2025.json"
**Fix**: Run feature generation for 2025 (see Option A above)

### "No games in bundle"
**Check**:
1. Are features generated for current week?
2. Does `game_aggregates_2025.json` have upcoming games?
3. Are games filtered by date (only future/current week)?

### "Function timeout"
**Solutions**:
- Increase function timeout in `netlify.toml`: `functions.timeout = 30`
- Pre-generate features (don't run 02/03 scripts in function)
- Use background function for refresh

### "Schema mismatch in UI"
**Fix**: Check `12-make-public-bundle.mjs` output matches:
```javascript
{
  matchup: string,
  homeTeam: string,
  awayTeam: string,
  kickoff: ISO date string,
  moneyline: { team, price, confidence },
  spread: { side, team, line, price, confidence },
  total: { side, total, price, confidence }
}
```

---

## 📊 Architecture: V4.1 vs Legacy NFL

| Component | Legacy NFL | V4.1 | Independence |
|-----------|------------|------|--------------|
| **Blobs Bucket** | `nfl` | `nfl-v41` | ✅ Isolated |
| **Functions** | `nfl-predictions-*` | `nfl-v41-*` | ✅ Independent |
| **Frontend** | `/nfl` | `/nfl-v4` | ✅ Separate routes |
| **Schedule Data** | Shared JSON | Shared JSON | ⚠️ Shared (read-only) |
| **Features** | `nfl-model-v2/v3` | `nfl-model-v3` | ⚠️ Shared (read-only) |
| **Models** | R Pipeline | V4.1 Node scripts | ✅ Independent |

**Key Point**: V4.1 can read shared schedule/features but operates independently. Deleting legacy functions won't break V4.1.

---

## 🎯 Next Steps After Deployment

### Week 1-2: Monitor & Compare
- Track V4.1 picks vs actual outcomes
- Compare V4.1 ML picks vs legacy spread-based ML
- Log any discrepancies or errors

### Week 3-4: Tuning
- Adjust confidence thresholds if needed
- Calibrate EV filters based on real betting results
- Consider enabling A/B test (50% users see V4, 50% see legacy)

### Month 2+: Full Migration
- Once V4.1 proven stable and profitable
- Redirect `/nfl` to `/nfl-v4`
- Archive legacy functions
- Celebrate! 🎉

---

## 📞 Support Commands

```bash
# Test current week detection
node -e "import('./_lib/schedule.mjs').then(m=>console.log('Week:',m.detectCurrentWeek()))"

# Check available features
ls nfl-model-v3/data/processed-features/

# Manually trigger refresh (local)
node netlify/functions/nfl-v41-refresh.mjs

# Check blob storage
netlify blobs:list nfl-v41

# Tail function logs (live)
netlify functions:log nfl-v41-refresh --follow
```

---

**Author**: GitHub Copilot  
**Last Updated**: November 4, 2025  
**Status**: Ready pending 2025 feature generation
