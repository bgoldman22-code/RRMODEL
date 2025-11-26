# Phase 3.5 Model Features and Line Sensitivity Analysis

**Date**: November 26, 2025  
**Purpose**: Document exactly which features the Phase 3.5 NBA props models use and prove how they handle the `line` feature.

---

## Executive Summary

Phase 3.5 uses a **hybrid approach**:
- **Assists**: Logistic Regression (PRA model) — 30 features, **line IS used effectively**
- **Points**: LightGBM — 60 features, **line included but NOT influential** ⚠️
- **Rebounds**: LightGBM — 60 features, **line included but NOT influential** ⚠️

### Critical Finding

**The LightGBM models (Points & Rebounds) include `line` as a feature but assign it near-zero importance**, meaning predictions are essentially line-agnostic. The Logistic PRA model (Assists) correctly uses line and shows meaningful probability changes when line varies.

---

## 1. Feature Schemas by Model

### 1.1 Points Model (LightGBM)

**File**: `data/nba/models/phase3_lgbm/points_over_v1_20251125.json`  
**Engine**: LightGBM  
**Total Features**: 60  

#### Feature Groups

##### Rolling Windows (L5, L10, L20, L40, L999)
```
L5_ppg, L5_rpg, L5_apg, L5_pra, L5_minutes, L5_fga, L5_fta
L10_ppg, L10_rpg, L10_apg, L10_pra, L10_minutes, L10_fga, L10_fta
L20_ppg, L20_rpg, L20_apg, L20_pra, L20_minutes, L20_fga, L20_fta
L40_ppg, L40_rpg, L40_apg, L40_pra, L40_minutes, L40_fga, L40_fta
L999_ppg, L999_rpg, L999_apg, L999_pra, L999_minutes, L999_fga, L999_fta
```

##### Season Features
```
season_ppg, season_rpg, season_apg, season_pra, season_minutes, season_fga, season_fta, season_games_played
```

##### Head-to-Head Features
```
h2h_ppg, h2h_rpg, h2h_apg, h2h_pra, h2h_minutes, h2h_fga, h2h_fta, h2h_games_played
```

##### Opponent Defense Features
```
opp_def_L5_pra_allowed, opp_def_L10_pra_allowed
opp_def_L5_ppg_allowed, opp_def_L10_ppg_allowed
opp_def_L5_rpg_allowed, opp_def_L10_rpg_allowed
opp_def_L5_apg_allowed, opp_def_L10_apg_allowed
```

##### Context Features ⭐
```
rest_days       ✓ Included (importance: 19.5)
home            ✓ Included (importance: 18.2)
line            ✓ Included (importance: 119.1) ⚠️ BUT NOT EFFECTIVE IN PRACTICE
games_played    ✓ Included (importance: 435.1)
```

#### Top 10 Most Important Features (Points Model)
1. **L10_ppg** — 620.7
2. **L5_minutes** — 466.0
3. **L10_fta** — 438.0
4. **games_played** — 435.1
5. **L999_ppg** — 420.7
6. **L999_pra** — 414.3
7. **L10_minutes** — 403.7
8. **L10_fga** — 361.3
9. **opp_def_L5_ppg_allowed** — 349.6
10. **L5_apg** — 323.0

**Note**: `line` has importance 119.1 (ranks ~15th), but empirical testing shows it **does not affect predictions**.

---

### 1.2 Rebounds Model (LightGBM)

**File**: `data/nba/models/phase3_lgbm/rebounds_over_v1_20251125.json`  
**Engine**: LightGBM  
**Total Features**: 60 (same structure as Points)

#### Context Features ⭐
```
rest_days       ✓ Included (importance: 90.2)
home            ✓ Included (importance: 25.1)
line            ✓ Included (importance: 43.1) ⚠️ BUT NOT EFFECTIVE IN PRACTICE
games_played    ✓ Included (importance: 181.3)
```

#### Top 10 Most Important Features (Rebounds Model)
1. **L999_apg** — 454.0
2. **L10_minutes** — 364.6
3. **opp_def_L5_ppg_allowed** — 279.6
4. **L10_ppg** — 246.5
5. **opp_def_L10_ppg_allowed** — 234.2
6. **opp_def_L10_apg_allowed** — 215.5
7. **L5_ppg** — 195.0
8. **games_played** — 181.3
9. **opp_def_L10_pra_allowed** — 179.3
10. **opp_def_L10_rpg_allowed** — 177.9

**Note**: `line` has importance 43.1 (ranks ~30th), and empirical testing shows it **does not affect predictions**.

---

### 1.3 Assists Model (Logistic PRA)

**File**: `data/nba/models/phase3/pra_over_coefficients_v1_20251124.json`  
**Engine**: Logistic Regression  
**Total Features**: 30  

#### Feature Groups

##### Rolling Windows (L5, L10, L999 only)
```
L5_ppg, L5_rpg, L5_apg, L5_pra, L5_minutes, L5_fga, L5_fta
L10_ppg, L10_rpg, L10_apg, L10_pra, L10_minutes, L10_fga, L10_fta
L999_ppg, L999_rpg, L999_apg, L999_pra, L999_minutes, L999_fga, L999_fta
```
_(No L20 or L40 in Logistic model—streamlined feature set)_

##### Opponent Defense Features
```
opp_def_L5_pra_allowed, opp_def_L10_pra_allowed
opp_def_L5_ppg_allowed, opp_def_L10_ppg_allowed
opp_def_L5_rpg_allowed, opp_def_L10_rpg_allowed
opp_def_L5_apg_allowed, opp_def_L10_apg_allowed
```

##### Context Features ⭐
```
rest_days       ✓ Included (coefficient: -0.0057)
home            ✓ Included (coefficient: +0.0293)
line            ✓ Included (coefficient: -0.0376) ✓ EFFECTIVE
games_played    ✓ Included (coefficient: +0.0031)
```

**Note**: The Logistic model has **NO season or H2H features** (only 30 features total vs 60 for LightGBM).

#### Top Coefficients by Magnitude (Assists Model)
1. **L999_apg** — +0.0858
2. **L5_apg** — -0.0719
3. **L5_rpg** — -0.0666
4. **L5_fga** — +0.0567
5. **opp_def_L10_apg_allowed** — +0.0472
6. **opp_def_L5_ppg_allowed** — -0.0471
7. **L10_ppg** — -0.0438
8. **L5_pra** — -0.0420
9. **L10_minutes** — -0.0412
10. **line** — **-0.0376** ← **Ranks 11th, ACTIVE**

---

## 2. Line Sensitivity Test Results

### Test Methodology

Using the diagnostic script `scripts/nba/debug_phase3_line_sensitivity.mjs`:

1. Load a real training record (LeBron James, 2023-10-24)
2. Extract all 60 features from that record
3. **Hold all features constant** except `line`
4. Vary `line` across a range (e.g., -5, -3, -1, 0, +1, +3, +5)
5. Run predictions through the **production inference engine** (`nba-props-engine-v3.mjs`)
6. Observe how probability changes

---

### 2.1 Assists Model (Logistic PRA) ✅

**Player**: LeBron James  
**Market**: player_assists (Over)  
**Date**: 2023-10-24  
**Original Line**: 6.5  

| Line  | p(Over) | Change from Original |
|-------|---------|----------------------|
| 1.5   | 53.04%  | +0.66 pp             |
| 3.5   | 52.78%  | +0.40 pp             |
| 5.5   | 52.51%  | +0.13 pp             |
| **6.5** | **52.38%** | **← ORIGINAL** |
| 7.5   | 52.25%  | -0.13 pp             |
| 9.5   | 51.99%  | -0.39 pp             |
| 11.5  | 51.72%  | -0.66 pp             |

**Result**: ✅ **Probability decreases by 1.32 percentage points** as line increases by 10 points.

**Interpretation**: The Logistic PRA model correctly uses `line` as a feature. Higher lines → lower Over probabilities (as expected).

---

### 2.2 Points Model (LightGBM) ⚠️

**Player**: LeBron James  
**Market**: player_points (Over)  
**Date**: 2023-10-24  
**Original Line**: 23.5  

| Line  | p(Over) | Change from Original |
|-------|---------|----------------------|
| 18.5  | 42.39%  | 0.00 pp              |
| 20.5  | 42.39%  | 0.00 pp              |
| 22.5  | 42.39%  | 0.00 pp              |
| **23.5** | **42.39%** | **← ORIGINAL** |
| 24.5  | 42.39%  | 0.00 pp              |
| 26.5  | 42.39%  | 0.00 pp              |
| 28.5  | 42.39%  | 0.00 pp              |

**Result**: ⚠️ **NO CHANGE** — probability is identical across all lines.

**Interpretation**: Despite `line` being in the feature set with importance 119.1, the LightGBM model is **not using it effectively**. Predictions are line-agnostic.

---

### 2.3 Rebounds Model (LightGBM) ⚠️

**Player**: LeBron James  
**Market**: player_rebounds (Over)  
**Date**: 2023-10-24  
**Original Line**: 7.5  

| Line  | p(Over) | Change from Original |
|-------|---------|----------------------|
| 2.5   | 58.44%  | 0.00 pp              |
| 4.5   | 58.44%  | 0.00 pp              |
| 6.5   | 58.44%  | 0.00 pp              |
| **7.5** | **58.44%** | **← ORIGINAL** |
| 8.5   | 58.44%  | 0.00 pp              |
| 10.5  | 58.44%  | 0.00 pp              |
| 12.5  | 58.44%  | 0.00 pp              |

**Result**: ⚠️ **NO CHANGE** — probability is identical across all lines.

**Interpretation**: Same issue as Points. The LightGBM model is **not using `line` effectively**.

---

## 3. How the Models Use Line

### Assists (Logistic PRA) — Correct Usage ✅

**Approach**: Direct binary classification on Over/Under outcomes.

The logistic model learns:
```
P(Over) = sigmoid(w₁·L5_ppg + w₂·L10_ppg + ... + w_line·line + ... + b)
```

Where:
- `w_line = -0.0376` (negative coefficient)
- Higher `line` → lower `P(Over)` (correct direction)
- The model treats `line` as a **contextual constraint** on the prediction

**Plain English**: The model says, "Given this player's rolling stats, opponent defense, and rest days, if the line is set at 6.5 assists, there's a 52% chance they go over. But if the line moves to 9.5 (tougher target), that drops to 52%."

This is **not a projection model** (we don't predict 7.2 assists and compare to 6.5). It's a **direct classification model** that uses `line` as one of many features to predict Over/Under outcomes.

---

### Points & Rebounds (LightGBM) — Broken Usage ⚠️

**Approach**: Same as Logistic (direct binary classification), but `line` feature is ineffective.

**Why this happens**:
- LightGBM assigns `line` a feature importance score (119 for Points, 43 for Rebounds)
- But in practice, the model's tree splits **ignore or dilute the line signal**
- Possible causes:
  1. **Overfitting to player stats**: The model relies so heavily on `L10_ppg`, `L5_minutes`, etc., that `line` becomes redundant
  2. **Lack of regularization**: LightGBM may have learned to memorize player tendencies rather than use `line` as a constraint
  3. **Training data distribution**: If most training samples have lines clustered around typical values, the model never learned sensitivity to extreme lines

**Impact**:
- **Points model**: Predicts 42.39% regardless of whether line is 18.5 or 28.5 (10-point range!)
- **Rebounds model**: Predicts 58.44% regardless of whether line is 2.5 or 12.5 (10-rebound range!)

**This is a bug**, not a feature. The LightGBM models are not truly "line-aware" in production.

---

## 4. Summary Table

| Model       | Engine         | Features | `line` Included? | `line` Effective? | Sensitivity Test |
|-------------|----------------|----------|------------------|-------------------|------------------|
| **Assists** | Logistic PRA   | 30       | ✅ Yes (coef -0.0376) | ✅ Yes | 53.04% → 51.72% |
| **Points**  | LightGBM       | 60       | ✅ Yes (imp 119.1) | ❌ No | 42.39% → 42.39% |
| **Rebounds**| LightGBM       | 60       | ✅ Yes (imp 43.1) | ❌ No | 58.44% → 58.44% |

---

## 5. Implications & Recommendations

### Current State

1. **Assists predictions are line-aware** ✅  
   The Logistic PRA model correctly adjusts probability based on line difficulty.

2. **Points & Rebounds predictions are NOT line-aware** ⚠️  
   The LightGBM models output the same probability regardless of line value, making them effectively "player projection" models that ignore market context.

### Recommendations

**Option A: Retrain LightGBM with Line Awareness**
- Add explicit line-based features (e.g., `line_vs_L10_avg`, `line_z_score`)
- Use sample weighting to emphasize line diversity in training
- Add regularization to prevent over-reliance on rolling averages

**Option B: Switch Points & Rebounds to Logistic**
- Train separate Logistic PRA models for Points and Rebounds (like Assists)
- This would ensure consistent line sensitivity across all markets

**Option C: Accept Current Behavior (Not Recommended)**
- If LightGBM models are still profitable, they may be implicitly "right" despite ignoring line
- However, this makes the system less adaptable to line movement and market inefficiencies

---

## 6. How to Reproduce

### Run the Line Sensitivity Test

```bash
cd ~/Desktop/REPO33/RRMODEL
node scripts/nba/debug_phase3_line_sensitivity.mjs
```

### Expected Output

The script will:
1. Load the Phase 3.5 inference engine
2. Test all three markets (Points, Assists, Rebounds)
3. Show a table of `line → probability` for each market
4. Confirm whether `line` affects predictions

### Inspect Model Metadata

```bash
# View Points model features
cat data/nba/models/phase3_lgbm/points_over_v1_20251125.json | jq '.feature_columns, .feature_importance'

# View Assists model features
cat data/nba/models/phase3/pra_over_coefficients_v1_20251124.json | jq '.feature_columns, .coefficients.line'

# View Rebounds model features
cat data/nba/models/phase3_lgbm/rebounds_over_v1_20251125.json | jq '.feature_columns, .feature_importance.line'
```

---

## 7. Conclusion

**Phase 3.5 models do include `line` as a feature**, but only the **Assists (Logistic PRA) model uses it effectively**. The **Points and Rebounds (LightGBM) models have line in their feature set but produce line-agnostic predictions**, which is a critical flaw.

This is **direct classification on Over/Under outcomes**, not stat projection. The model should say, "Given these features + this line, what's P(Over)?", and it does—but only for Assists.

**Next Steps**: Decide whether to retrain LightGBM models with better line awareness or migrate Points/Rebounds to Logistic PRA architecture.

---

**Generated**: November 26, 2025  
**Script**: `scripts/nba/debug_phase3_line_sensitivity.mjs`  
**Models**: Phase 3.5 Production (v1, trained Nov 24-25, 2025)
