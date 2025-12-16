# BTTS Data Leakage Analysis

**Date**: December 11, 2025  
**Analyst**: Co-CTO  
**Status**: ⚠️ CRITICAL LEAKAGE CONFIRMED

---

## Executive Summary

The current BTTS modeling pipeline contains **severe data leakage** where post-match statistics from the game being predicted are used as model features. This renders all backtest results invalid as the models had access to future information.

**Impact Scope:**
- ❌ **Poisson BTTS model**: Uses actual match xG directly
- ❌ **Logistic Regression**: Trained on leaky features
- ❌ **Random Forest**: Trained on leaky features  
- ❌ **LightGBM/XGBoost/CatBoost** (Phase 2): Trained on leaky features
- ❌ **All walk-forward validation results**: Invalid due to leakage

---

## 1. PRIMARY LEAKAGE SOURCE: Match-Specific xG

### 1.1 Direct Usage in Poisson Model

**File**: `src/model_baselines.py`  
**Lines**: 160-163  
**Severity**: 🔴 CRITICAL

```python
def predict_proba(self, df):
    # Get match-specific lambdas if available
    if 'home_xg' in df.columns:
        home_lam = df['home_xg'].fillna(self.home_lambda)  # ← USES ACTUAL MATCH XG
        away_lam = df['away_xg'].fillna(self.home_lambda)
```

**Why This Is Leakage:**
- `df['home_xg']` and `df['away_xg']` contain the **actual xG values FROM the completed match**
- These are the expected goals calculated AFTER the match based on shot quality
- This is future information not available at prediction time
- Confirmed via empirical test: backtest predictions exactly match Poisson formula using actual xG

**Used In:**
- ✅ Training: No (uses aggregated lambda from training set)
- ✅ Prediction: **YES - CRITICAL LEAK**

**Proof:**
```
Match: Bournemouth vs Luton (2024-03-13)
Actual match xG: home=2.350, away=2.060
Expected P(BTTS) using formula: 0.7893
Backtest p_yes: 0.7893
Difference: 0.000000 ← EXACT MATCH CONFIRMS LEAKAGE
```

### 1.2 Leaky Feature Engineering

**File**: `src/build_features.py`  
**Lines**: 228-238  
**Severity**: 🔴 CRITICAL

```python
def add_match_level_features(df):
    # XG-based features
    if 'home_xg' in df.columns and 'away_xg' in df.columns:
        df['sum_xg'] = df['home_xg'] + df['away_xg']           # ← LEAK
        df['diff_xg'] = abs(df['home_xg'] - df['away_xg'])     # ← LEAK
        df['xg_dominance'] = df[['home_xg', 'away_xg']].max(axis=1) / (df['sum_xg'] + 0.01)  # ← LEAK
    
    # Shot quality
    if 'home_xg' in df.columns and 'home_shots_total' in df.columns:
        df['shot_quality_home'] = df['home_xg'] / (df['home_shots_total'] + 1)  # ← LEAK
        df['shot_quality_away'] = df['away_xg'] / (df['away_shots_total'] + 1)  # ← LEAK
```

**Why This Is Leakage:**
These engineered features directly use post-match xG and shot statistics:
- `sum_xg`: Total xG in the match (only known after match)
- `diff_xg`: xG difference (only known after match)
- `xg_dominance`: Which team dominated xG (only known after match)
- `shot_quality_home/away`: xG per shot (only known after match)

**Used In:**
- ✅ Training: **YES** (these columns in feature table)
- ✅ Prediction: **YES** (test_df contains these features)

---

## 2. SECONDARY LEAKAGE: Post-Match Event Statistics

### 2.1 Shot Statistics

**File**: `src/build_features.py`  
**Lines**: 244-255  
**Severity**: 🟠 HIGH

```python
# Possession features
if 'home_possession_pct' in df.columns:
    df['possession_dominance'] = abs(df['home_possession_pct'] - df['away_possession_pct'])  # ← LEAK

# Chaos index
if 'home_shots_total' in df.columns:
    df['chaos_index'] = df['home_shots_total'] + df['away_shots_total']  # ← LEAK
    
    if 'home_shots_on_target' in df.columns:
        df['danger_index'] = (df['home_shots_on_target'] + df['away_shots_on_target'])  # ← LEAK
```

**Why This Is Leakage:**
- `possession_dominance`: Final possession stats (only known after match)
- `chaos_index`: Total shots in match (only known after match)
- `danger_index`: Shots on target (only known after match)

**Used In:**
- ✅ Training: **YES**
- ✅ Prediction: **YES**

### 2.2 Event Columns Marked as Leaky

**File**: `src/load_data.py`  
**Lines**: 21-30  
**Severity**: 🟠 HIGH

```python
EVENT_COLUMNS = {
    'home_goals', 'away_goals', 'home_goals_fpl', 'away_goals_fpl',
    'home_shots_total', 'away_shots_total', 'home_shots_on_target', 'away_shots_on_target',
    'home_shots_off_target', 'away_shots_off_target', 'home_shots_inside_box', 'away_shots_inside_box',
    'home_shots_outside_box', 'away_shots_outside_box', 'home_shots_blocked', 'away_shots_blocked',
    'home_corners', 'away_corners', 'home_fouls', 'away_fouls', 'home_yellow_cards', 'away_yellow_cards',
    'home_red_cards', 'away_red_cards', 'home_gk_saves', 'away_gk_saves', 'danger_index', 'chaos_index',
    'sum_xg', 'diff_xg', 'xg_dominance', 'shot_quality_home', 'shot_quality_away'
}
```

**Acknowledgment**: The codebase DOES mark these as event columns (future information), but the flag is not enforced during model training/prediction.

**Used In:**
- ✅ Training: **YES** (many of these used in ML models)
- ✅ Prediction: **YES** (passed to test_df in walkforward)

---

## 3. LEAK-FREE FEATURES (Safe to Use)

### 3.1 Rolling Historical Features

**File**: `src/build_features.py`  
**Lines**: 138-202  
**Status**: ✅ SAFE (with caveat)

```python
# These are computed using .shift(1) which prevents lookahead
df.loc[home_indices, f'home_xg_L{window}'] = rolling_xg.values
df.loc[home_indices, f'home_xga_L{window}'] = rolling_xga.values
df.loc[away_indices, f'away_xg_L{window}'] = rolling_xg.values
df.loc[away_indices, f'away_xga_L{window}'] = rolling_xga.values
```

**Safe Features:**
- `home_xg_L5` / `away_xg_L5`: Rolling 5-match xG average (excludes current match)
- `home_xg_L10` / `away_xg_L10`: Rolling 10-match xG average
- `home_xga_L5` / `away_xga_L5`: Rolling xG conceded
- `home_xga_L10` / `away_xga_L10`: Rolling xG conceded
- `home_btts_rate_L5/L10`: BTTS rate in last N matches
- Form trends: `home_xg_trend`, `away_xg_trend`

**Caveat**: Must verify `.shift(1)` is properly applied to prevent including current match.

### 3.2 Pre-Match Static Features

**Status**: ✅ SAFE

- `season`: Season identifier
- `date`: Match date
- `home_norm` / `away_norm`: Team names
- `venue`: Stadium
- `referee`: Match official
- `btts_yes_odds` / `btts_no_odds`: Pre-match betting odds
- `home_availability_pct` / `away_availability_pct`: Squad availability (if updated pre-match)

---

## 4. IMPACT ASSESSMENT

### 4.1 Affected Models

| Model | Leakage Type | Severity | Status |
|-------|-------------|----------|--------|
| Poisson BTTS | Direct match xG usage | 🔴 Critical | Invalid |
| Logistic Regression | Trained on leaky features | 🔴 Critical | Invalid |
| Random Forest | Trained on leaky features | 🔴 Critical | Invalid |
| LightGBM | Trained on leaky features | 🔴 Critical | Invalid |
| XGBoost | Trained on leaky features | 🔴 Critical | Invalid |
| CatBoost | Trained on leaky features | 🔴 Critical | Invalid |

### 4.2 Affected Results

**All backtest results are invalid**, including:
- `results/walkforward_poisson_per_bet.csv`
- `results/walkforward_poisson_metrics.csv`
- `results/walkforward_two_sided_roi_*.csv`
- Any reported AUC, Brier, ROI, win-rate metrics

### 4.3 Why Production Failed

The production system correctly **does NOT have access to match xG** for upcoming fixtures:
- TheOddsAPI provides fixtures and odds, but NOT xG
- Production script defaulted to fixed xG (1.7, 1.4) for all matches
- This resulted in identical predictions (0.616) for every match
- This exposed the fundamental dependency on leaked data

---

## 5. ROOT CAUSE ANALYSIS

### 5.1 Design Flaw

The feature engineering pipeline was designed to:
1. Load historical match data (including completed matches with full stats)
2. Build features on entire dataset at once
3. Split into train/test in walkforward
4. Pass entire feature set (including post-match stats) to models

**The flaw**: No separation between "historical context" (features built FROM past matches) vs "match outcome" (stats FROM the match being predicted).

### 5.2 Why It Wasn't Caught

1. **Rolling features exist**: The code DOES compute leak-free rolling features (xg_L5, xg_L10)
2. **But not exclusively used**: Models can access BOTH rolling features AND actual match stats
3. **Poisson model explicitly uses match xG**: Line 161 directly reads `df['home_xg']`
4. **No feature filtering**: No mechanism to restrict test_df to only pre-match features

---

## 6. REMEDIATION REQUIRED

### 6.1 Immediate Actions

1. ✅ **Mark all current backtest results as INVALID**
2. ✅ **Do NOT use for production decisions**
3. ✅ **Do NOT report ROI/performance to stakeholders**

### 6.2 Required Fixes

1. **Create leak-free feature builder** (`src/features_leakfree.py`):
   - Only use historical aggregates (rolling stats)
   - For match on date D, only use matches with date < D
   - Exclude all EVENT_COLUMNS
   - Include pre-match market features (odds)

2. **Rebuild Poisson model** (`poisson_leakfree`):
   - Use rolling xG averages instead of actual match xG
   - Formula: `P(BTTS) = (1 - e^(-home_xg_L5)) × (1 - e^(-away_xg_L5))`

3. **Rebuild all ML models** (logistic, RF, GBM):
   - Train only on leak-free features
   - Use strict feature allowlist
   - Apply temporal validation

4. **Re-run walk-forward validation**:
   - Use only leak-free feature table
   - Verify no EVENT_COLUMNS in test_df
   - Generate new backtest results

---

## 7. VERIFICATION CHECKLIST

Before marking a model as "leak-free":

- [ ] Model does NOT use `home_xg` or `away_xg` directly
- [ ] Model does NOT use any columns in EVENT_COLUMNS
- [ ] All features are computed using data from date < match_date
- [ ] Feature builder includes temporal assertions
- [ ] Test set predictions manually spot-checked for variation
- [ ] No exact formula match between predictions and actual match stats
- [ ] Production predictions vary across different team matchups

---

## 8. LESSONS LEARNED

1. **Temporal validation is not sufficient**: Even with proper train/test splits, leakage can occur if features contain future information
2. **Feature engineering requires temporal awareness**: Must explicitly track which features are "safe" vs "leaky"
3. **Model behavior should be monitored**: Identical predictions across all matches is a red flag
4. **Production deployment exposes gaps**: The lack of xG in production revealed the dependency

---

## Appendix: Detection Method

The leakage was discovered when:
1. Production system generated identical predictions (0.616) for all matches
2. Investigation revealed fixed xG defaults were used
3. Backtest was checked to see if it used actual xG
4. Empirical test showed backtest predictions EXACTLY matched Poisson formula with actual match xG
5. Difference of 0.000000 confirmed the leak

**Detection command:**
```python
# Calculate expected P(BTTS) using actual match xG
expected_prob = (1 - math.exp(-home_xg)) * (1 - math.exp(-away_xg))

# Compare with backtest prediction
diff = abs(expected_prob - backtest_p_yes)

# If diff ≈ 0, then backtest used actual match xG (LEAKAGE)
```

---

**Document Version**: 1.0  
**Next Review**: After leak-free models are implemented  
**Owner**: Co-CTO
