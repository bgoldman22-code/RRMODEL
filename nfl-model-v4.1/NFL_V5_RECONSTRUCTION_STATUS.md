# NFL V5 Reconstruction - Current Status
**Last Updated:** November 14, 2025  
**Status:** ✅ Phase 1 Complete | ⚠️ Phase 2 In Progress

---

## 🎯 Project Overview

### What We're Doing
Reconstructing the NFL V5 ensemble prediction system that was **supposed** to exist but never actually deployed. V5 was advertised as using separate best-of-breed models:
- **Spread Model:** "V3 Multi-Feature EPA" (claims 71.2% WR, +37% ROI on 2020-2024 backtest)
- **Total Model:** "V5 Quantile Blend" (claims +18% ROI on 2020-2024 backtest)

### The Problem
Current "V5" endpoint (`nfl-v5-refresh-now.mjs`) just caches V1 predictions. The real V5 ensemble was never deployed to production.

### The Solution
Train **actual** separate models on multi-season historical data (2020-2024), using:
1. **1,543 games** of pre-aggregated NFLverse data already in repo
2. Time-causal rolling window features (no future data leakage)
3. V1's exact metric definitions (no training/serving skew)
4. OLS regression for coefficient fitting

---

## 📊 Data Inventory

### Primary Data Source
**Location:** `nfl-model-v3/data/nflverse/`

All data is **already collected and pre-processed**. No new data collection needed.

### Available Files

| Season | File | Games | Weeks | Size | Status |
|--------|------|-------|-------|------|--------|
| 2020 | `game_aggregates_2020.json` | 269 | 1-21 | 175 KB | ✅ Ready |
| 2021 | `game_aggregates_2021.json` | 285 | 1-22 | 185 KB | ✅ Ready |
| 2022 | `game_aggregates_2022.json` | 284 | 1-22 | 184 KB | ✅ Ready |
| 2023 | `game_aggregates_2023.json` | 285 | 1-22 | 185 KB | ✅ Ready |
| 2024 | `game_aggregates_2024.json` | 285 | 1-22 | 185 KB | ✅ Ready |
| 2025 | `game_aggregates_2025.json` | 135 | 1-9 | 87 KB | ✅ Ready |

**Total: 1,543 games**

### Game Data Structure
Each game has:
```json
{
  "game_id": "2024_01_ARI_BUF",
  "season": "2024",
  "week": "1",
  "home_team": "BUF",
  "away_team": "ARI",
  "home_score": 34,
  "away_score": 28,
  "home_epa_per_play": 0.094,
  "away_epa_per_play": 0.066,
  "home_success_rate": 0.301,
  "away_success_rate": 0.209,
  "home_explosive_rate": 0.018,
  "away_explosive_rate": 0.025,
  "plays": 163
}
```

### Training/Validation Split

**Training Set:**
- **2020-2024 regular season** (weeks 1-18 only)
- Estimated **~1,280 games** (256 games/year × 5 years)
- Playoff games excluded by default

**Validation Set:**
- **2025 weeks 1-9** (135 games)
- Out-of-sample validation

**Spot Check:**
- **Week 10 2025** (14 games)
- Compare vs `bundle_v5_week10_real.json`

---

## 🏗️ Implementation Status

### ✅ Phase 1: Foundation (COMPLETE)

#### 1. Data Discovery & Documentation
- ✅ Located 1,543 games of NFLverse data in repo
- ✅ Verified data structure has all needed features
- ✅ Created `NFL_V5_DATA_INVENTORY.md` (294 lines)
- ✅ Documented training/validation split strategy

#### 2. Feature Engineering Library
**File:** `nfl-model-v4.1/scripts/_lib/v1-feature-loader.mjs` (✅ COMPLETE - 450+ lines)

**What It Does:**
- Loads all `game_aggregates_*.json` files from 2020-2025
- Filters to regular season only (weeks 1-18)
- Computes **time-causal rolling window features**:
  - For each game, uses ONLY prior games
  - Early season (weeks 1-4): Use all available prior games
  - Mid-season (weeks 5-9): Rolling 5-game window
  - Late season (weeks 10+): Rolling 8-game window
  - Week 1: Seeds with prior season's final 8 games

**Features Computed Per Team:**
- Offensive EPA per play (rolling avg)
- Defensive EPA per play allowed (rolling avg)
- Offensive success rate
- Defensive success rate
- Offensive explosive rate
- Defensive explosive rate
- Plays per game (pace)

**Game-Level Features:**
For Spread Model:
- `epa_diff` = (home net EPA) - (away net EPA)
- `success_diff` = (home success rate - away success rate) × 100
- `explosive_diff` = (home explosive rate - away explosive rate) × 100
- `hfa` = venue-based constant (2.0-3.0)

For Total Model:
- `pace_combined` = average of both teams' pace
- `epa_off_sum` = sum of both offensive EPA ratings
- `epa_def_sum` = sum of both defensive EPA ratings
- `success_sum` = combined success rates
- `explosive_sum` = combined explosive rates

**Exported Functions:**
```javascript
loadTrainingDataset()       // 2020-2024 regular season
loadValidationDataset2025() // 2025 weeks 1-9
loadWeek10SpotCheck()       // Week 10 2025 bundle games
```

#### 3. Regression Module
**File:** `nfl-model-v4.1/scripts/_lib/regression.mjs` (✅ COMPLETE - 200+ lines)

**What It Does:**
- OLS (Ordinary Least Squares) regression
- Matrix operations for coefficient fitting
- Diagnostic calculations:
  - R² (coefficient of determination)
  - MAE (Mean Absolute Error)
  - RMSE (Root Mean Squared Error)
  - Residual analysis
  - Per-season breakdowns

**Exported Functions:**
```javascript
linearRegression(X, y)     // Fits coefficients via OLS
calculateDiagnostics()     // Returns R², MAE, RMSE
residualAnalysis()         // Distribution stats
```

---

### ⚠️ Phase 2: Model Training (IN PROGRESS)

#### 4. Reconstruction Script
**File:** `nfl-model-v4.1/scripts/00-reconstruct-v5-coefficients.mjs` (⚠️ IN PROGRESS)

**Current Status:**
- ✅ Structure created
- ✅ Imports v1-feature-loader
- ✅ Imports regression module
- ⚠️ **BLOCKER:** Script has syntax errors (duplicate function definitions)
- ⚠️ Needs cleanup and testing

**What It Should Do:**
1. Load training data (2020-2024) via `loadTrainingDataset()`
2. Build design matrices for spread and total models
3. Fit coefficients via OLS regression
4. Log training diagnostics (R², MAE, RMSE per season)
5. Load validation data (2025) via `loadValidationDataset2025()`
6. Compute validation errors
7. Run Week 10 spot check vs `bundle_v5_week10_real.json`
8. Export fitted coefficients to JSON

**Current Error:**
```
SyntaxError: Identifier 'loadTrainingData' has already been declared
```

**Root Cause:**
The file has duplicate function definitions. Needs cleanup to remove old placeholder code.

---

## 🔧 Technical Architecture

### V5 Model Specifications

#### Spread Model: "V3 Multi-Feature EPA"
**Formula:**
```
predicted_spread = β₀ + β₁·epa_diff + β₂·success_diff + β₃·explosive_diff + β₄·hfa
```

**Features:**
- `epa_diff`: Net EPA differential (home - away)
- `success_diff`: Success rate differential × 100
- `explosive_diff`: Explosive rate differential × 100
- `hfa`: Home field advantage (venue-based constant)

**Target:** Home team margin (positive = home win)

#### Total Model: "V5 Quantile Blend"
**Formula (p50):**
```
predicted_total_p50 = β₀ + β₁·pace_combined + β₂·epa_off_sum + β₃·epa_def_sum + β₄·success_sum + β₅·explosive_sum
```

**Quantile Spread:**
- p25 = p50 - 10 points (typical lower bound)
- p75 = p50 + 10 points (typical upper bound)
- Alternative: Fit quantile regression for dynamic spread

**Target:** Total points scored (home + away)

### Time-Causal Feature Engineering

**Critical Rule:** For each game, use ONLY data from prior games.

**Rolling Window Strategy:**

| Game Week | Window Size | Cross-Season | Notes |
|-----------|-------------|--------------|-------|
| Week 1 | Prior season (8 games) | 30% weight | Seed with last year's performance |
| Weeks 2-4 | All prior games in season | Blend with prior season | Small sample, use history |
| Weeks 5-9 | Rolling 5-game window | Current season only | Recent form matters |
| Weeks 10+ | Rolling 8-game window | Current season only | Larger sample, stable estimates |

**Example (Week 5 game):**
- Team has played weeks 1-4 (4 games)
- Compute features using those 4 games only
- Do NOT use week 5 or later data (even if available in training set)

### V1 Compatibility

**Non-Negotiable:** Features must match V1's production definitions.

**V1 Source:** `netlify/functions/_lib/blobs-nfl.js`

**Feature Mapping:**

| V5 Feature | V1 Equivalent | Notes |
|------------|---------------|-------|
| `epa_diff` | Net EPA differential | V1 computes team EPA offense/defense |
| `success_diff` | Success rate differential | V1 tracks success rate per team |
| `explosive_diff` | Explosive play differential | V1 tracks explosive plays (20+ yards) |
| `hfa` | Venue constant | V1 uses 2.0-3.0 based on venue |
| `pace_combined` | Plays per game | V1 tracks pace metrics |

**No Training/Serving Skew:** When V5 deploys, it will use V1's blob loaders for feature computation, ensuring identical definitions.

---

## 📁 File Structure

### Core Implementation Files

```
nfl-model-v4.1/
├── scripts/
│   ├── 00-reconstruct-v5-coefficients.mjs   ⚠️ IN PROGRESS (has errors)
│   ├── 04-predict-spread.mjs                ⏭️ TODO (has placeholders)
│   ├── 05b-predict-total-quantile.mjs       ⏭️ TODO (not created)
│   └── _lib/
│       ├── v1-feature-loader.mjs            ✅ COMPLETE (450+ lines)
│       ├── regression.mjs                   ✅ COMPLETE (200+ lines)
│       ├── metrics.mjs                      ✅ EXISTS (placeholder)
│       └── ml_features.mjs                  ✅ EXISTS (150+ lines)
│
├── output/
│   ├── spreads_raw.json                     ✅ (87 games, weeks 4-9 2025)
│   ├── totals_quantile.json                 ✅ (87 games, weeks 4-9 2025)
│   ├── bundle_v5_week10_real.json           ✅ (14 games, Week 10 2025)
│   ├── v5_coefficients_spread.json          ⏭️ TODO (export fitted)
│   └── v5_coefficients_total.json           ⏭️ TODO (export fitted)
│
└── docs/
    ├── NFL_V5_DATA_INVENTORY.md             ✅ COMPLETE (294 lines)
    ├── NFL_V5_RECONSTRUCTION_STATUS.md      ✅ THIS FILE
    └── NFL_V5_RECONSTRUCTION_MULTI_SEASON.md ✅ COMPLETE (300+ lines)
```

### Data Files (Already Exists)

```
nfl-model-v3/data/nflverse/
├── game_aggregates_2020.json                ✅ 269 games
├── game_aggregates_2021.json                ✅ 285 games
├── game_aggregates_2022.json                ✅ 284 games
├── game_aggregates_2023.json                ✅ 285 games
├── game_aggregates_2024.json                ✅ 285 games
└── game_aggregates_2025.json                ✅ 135 games (weeks 1-9)
```

---

## 🚀 Next Steps (Priority Order)

### IMMEDIATE (Blocking Progress)

#### 1. Fix Reconstruction Script Syntax Errors
**File:** `nfl-model-v4.1/scripts/00-reconstruct-v5-coefficients.mjs`

**Problem:**
```javascript
SyntaxError: Identifier 'loadTrainingData' has already been declared
```

**Solution:**
- Remove duplicate function definitions
- Clean up old placeholder code at end of file
- Ensure single clean implementation

**Test Command:**
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v4.1
node scripts/00-reconstruct-v5-coefficients.mjs
```

#### 2. Run First Training Pass
Once syntax is fixed:
- Execute reconstruction script
- Verify data loads correctly (should see ~1,280 training games)
- Check coefficient fitting completes without errors
- Review initial diagnostics (R², MAE, RMSE)

#### 3. Add Week 10 Spot Check
**In:** `00-reconstruct-v5-coefficients.mjs`

Add section at end:
```javascript
// 5. SPOT CHECK: Week 10 2025 vs Original V5 Bundle
console.log('\n=== Week 10 Spot Check ===');
const week10Games = await loadWeek10SpotCheck();

for (const game of week10Games) {
  const predictedSpread = applySpreadModel(game.features, fittedSpreadCoefficients);
  const predictedTotal = applyTotalModel(game.features, fittedTotalCoefficients);
  
  // Compare vs bundle_v5_week10_real.json
  console.log(`${game.away_team} @ ${game.home_team}`);
  console.log(`  Spread: reconstructed ${predictedSpread.toFixed(1)} vs original ${game.original_spread}`);
  console.log(`  Total: reconstructed ${predictedTotal.toFixed(1)} vs original ${game.original_total}`);
}
```

Load original Week 10 values from:
`nfl-model-v4.1/output/bundle_v5_week10_real.json`

---

### SHORT TERM (This Session)

#### 4. Export Fitted Coefficients
**Files to Create:**
- `nfl-model-v4.1/output/v5_coefficients_spread.json`
- `nfl-model-v4.1/output/v5_coefficients_total.json`

**Format:**
```json
{
  "model": "V5 Spread - V3 Multi-Feature EPA",
  "trained": "2025-11-14",
  "training_window": "2020-2024 regular season",
  "training_games": 1280,
  "coefficients": {
    "intercept": 0.0,
    "epa_diff": 5.5,
    "success_diff": 0.3,
    "explosive_diff": 0.25,
    "hfa": 2.0
  },
  "diagnostics": {
    "r_squared": 0.42,
    "mae_training": 4.2,
    "rmse_training": 5.8,
    "mae_validation_2025": 3.9
  },
  "per_season_performance": [
    {"season": "2020", "mae": 4.1, "rmse": 5.6},
    {"season": "2021", "mae": 4.3, "rmse": 5.9},
    ...
  ]
}
```

#### 5. Generate Diagnostics Report
**File:** `nfl-model-v4.1/v5_reconstruction_diagnostics.md`

**Contents:**
- Training summary (games, features, targets)
- Fitted coefficients with confidence intervals
- Performance metrics (R², MAE, RMSE)
- Per-season breakdown
- Validation results (2025 weeks 1-9)
- Week 10 spot check comparison
- Residual analysis (distribution, outliers)
- Feature importance / coefficient interpretation
- Known limitations / data integrity notes

---

### MEDIUM TERM (Next Session)

#### 6. Update Production Model Files
**Replace placeholders in:**
- `nfl-model-v4.1/scripts/04-predict-spread.mjs`
  - Currently has placeholder coefficients
  - Update with fitted values from `v5_coefficients_spread.json`

**Create new file:**
- `nfl-model-v4.1/scripts/05b-predict-total-quantile.mjs`
  - Implement quantile total model
  - Load fitted coefficients from `v5_coefficients_total.json`
  - Output p25/p50/p75 predictions

#### 7. Build V5 Ensemble Wrapper
**New File:** `nfl-model-v4.1/scripts/v5-ensemble.mjs`

**Purpose:**
- Loads upcoming week's games
- Computes features using V1's blob loaders (for production)
- Applies fitted spread model (04-predict-spread.mjs)
- Applies fitted total model (05b-predict-total-quantile.mjs)
- Combines into V5 bundle format
- Outputs to `nfl-model-v4.1/output/v5_predictions_weekN.json`

**Integration:**
- This is the OFFLINE model generation script
- Runs weekly to create predictions
- Does NOT touch Netlify functions yet

---

### LONG TERM (Future Session)

#### 8. Wire V5 to Netlify (Production Deployment)
**CRITICAL:** Do NOT modify V1 production endpoints.

**New Files to Create:**
```
netlify/functions/
├── nfl-predictions-v5-generate/
│   └── index.mjs              # Trigger V5 generation
└── nfl-predictions-v5/
    └── index.mjs              # Serve V5 predictions (read-only)
```

**Workflow:**
1. V5 generation runs offline (via v5-ensemble.mjs)
2. Outputs to Netlify Blobs at separate key: `nfl:predictions:v5:week10`
3. Frontend can fetch from either:
   - `/api/nfl-predictions` (V1, existing)
   - `/api/nfl-predictions-v5` (V5, new)
4. V1 stays completely unchanged

#### 9. Frontend Integration
**Once V5 is stable:**
- Add UI toggle to switch between V1 and V5
- Show both predictions side-by-side
- Track performance of both systems independently
- Users can choose which model to follow

---

## ⚠️ Critical Constraints

### What NOT to Touch (Safety)

**DO NOT MODIFY:**
- ❌ `netlify/functions/nfl-predictions-generate/index.mjs` (V1 production)
- ❌ `netlify/functions/nfl-predictions/index.mjs` (V1 serving)
- ❌ Any existing V1 endpoints
- ❌ Frontend until V5 is fully validated

**SAFE TO MODIFY:**
- ✅ Everything in `nfl-model-v4.1/` (offline V5 work)
- ✅ Everything in `nfl-model-v3/data/` (static data)
- ✅ New V5-specific Netlify functions (separate paths)

### Data Integrity

**Time-Causal Features:**
- ✅ For each game, use ONLY prior games
- ✅ Rolling windows respect game chronology
- ✅ No future data leaks into training

**Training/Validation Split:**
- ✅ Training: 2020-2024 regular season
- ✅ Validation: 2025 weeks 1-9 (out-of-sample)
- ✅ Week 10: Spot check only (never in training)

**V1 Compatibility:**
- ✅ All features match V1's definitions
- ✅ No training/serving skew
- ✅ Production will use V1's blob loaders

---

## 📊 Success Criteria

### Phase 2 Success (Model Training)
- ✅ Reconstruction script runs without errors
- ✅ Loads ~1,280 training games (2020-2024 regular season)
- ✅ Fits spread model: R² > 0.30, MAE < 5 points
- ✅ Fits total model: R² > 0.25, MAE < 4 points
- ✅ Validation MAE (2025): Spread < 4 pts, Total < 4 pts
- ✅ Week 10 spot check: Within 2 points of original V5 outputs

### Phase 3 Success (Production Deployment)
- ✅ V5 generates predictions offline weekly
- ✅ Netlify serves V5 predictions via separate endpoint
- ✅ V1 remains untouched and operational
- ✅ Frontend can toggle between V1 and V5
- ✅ Both systems tracked independently

---

## 🐛 Known Issues

### Current Blockers

1. **Reconstruction Script Syntax Error**
   - **File:** `00-reconstruct-v5-coefficients.mjs`
   - **Error:** Duplicate function `loadTrainingData`
   - **Impact:** Cannot run training
   - **Fix:** Remove duplicate definitions, clean up file

### Resolved Issues

1. ✅ **Data Collection** - Found 1,543 games already in repo
2. ✅ **Feature Engineering** - v1-feature-loader.mjs complete with time-causal windows
3. ✅ **Regression Module** - regression.mjs complete with OLS + diagnostics

---

## 📝 Quick Commands

### Test Feature Loader
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v4.1
node -e "import('./scripts/_lib/v1-feature-loader.mjs').then(m => m.loadTrainingDataset().then(d => console.log('Training games:', d.spreadRows.length)))"
```

### Run Reconstruction (Once Fixed)
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v4.1
node scripts/00-reconstruct-v5-coefficients.mjs
```

### Check Output Files
```bash
ls -lh /Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v4.1/output/
```

---

## 🔄 Session Handoff Summary

**For Next Chat to Continue:**

1. **Where We Are:**
   - ✅ Data located and inventoried (1,543 games)
   - ✅ Feature loader built (v1-feature-loader.mjs)
   - ✅ Regression module built (regression.mjs)
   - ⚠️ Reconstruction script has syntax errors (BLOCKING)

2. **Immediate Next Action:**
   - Fix `00-reconstruct-v5-coefficients.mjs` syntax errors
   - Run first training pass
   - Add Week 10 spot check
   - Export fitted coefficients

3. **Key Files to Know:**
   - **Data:** `nfl-model-v3/data/nflverse/game_aggregates_*.json`
   - **Feature Loader:** `nfl-model-v4.1/scripts/_lib/v1-feature-loader.mjs`
   - **Regression:** `nfl-model-v4.1/scripts/_lib/regression.mjs`
   - **Training Script:** `nfl-model-v4.1/scripts/00-reconstruct-v5-coefficients.mjs` (NEEDS FIX)
   - **This Document:** `nfl-model-v4.1/NFL_V5_RECONSTRUCTION_STATUS.md`

4. **What NOT to Touch:**
   - V1 production endpoints (netlify/functions/nfl-predictions*)
   - Frontend (until V5 validated)
   - Anything outside nfl-model-v4.1/ and nfl-model-v3/data/

5. **Ground Rules:**
   - Use existing data (no recollection)
   - Regular season only (weeks 1-18)
   - Time-causal features only (no future data)
   - Match V1's metric definitions exactly

**Read this document first, then proceed with fixing the reconstruction script.**

---

**End of Status Document**
