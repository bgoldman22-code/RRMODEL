# Phase 3.9 Projection System Specification

**Version:** 1.0  
**Date:** December 2, 2025  
**Goal:** Build clean, production-ready numeric projection (μ) layer for NBA P/R/A props that is **decoupled** from Over/Under probability estimation

---

## 1. System Overview

### 1.1 Philosophy

**Core Principle:** Separate numeric projection from probability modeling

```
┌─────────────────────────┐
│  Phase 3.9 Projection   │  ← THIS LAYER (numeric μ only)
│  (Points, Rebounds,     │
│   Assists, Combos)      │
└───────────┬─────────────┘
            │
            ↓
  ┌─────────────────────────┐
  │  Line + Calibration     │  ← FUTURE LAYER (separate)
  │  (μ → Over/Under prob)  │
  └─────────────────────────┘
```

**Why This Matters:**
- Phase 3.7 proved good μ-models can still fail at O/U prediction if calibration breaks
- Phase 3.8 showed discriminative O/U classifiers work for some markets but don't give μ
- Phase 3.9 goal: **Best possible numeric projections** that can be used with ANY line or downstream calibration

### 1.2 Success Criteria

**Primary:**
- MAE ≤ Phase 3.6 baseline (once extracted) on test set
- Bias (mean error) < 0.5 points/rebounds/assists per market
- Temporal stability: Test MAE within 10% of validation MAE

**Secondary:**
- Correlation(μ_pred, actual) ≥ 0.80 per market
- Low variance across line buckets (high-line vs low-line players)
- Fast inference (< 50ms per player)

---

## 2. Target Variables

### 2.1 Primary Targets (Individual Stats)

| Target | Source Column | Range | Distribution |
|--------|---------------|-------|--------------|
| **points_actual** | `points_actual` | [0, 60] | Right-skewed, mode ~15-20 |
| **rebounds_actual** | `rebounds_actual` | [0, 25] | Right-skewed, mode ~5-8 |
| **assists_actual** | `assists_actual` | [0, 20] | Right-skewed, mode ~2-5 |

**Rationale:** Train one model per core stat for simplicity and interpretability.

### 2.2 Combo Targets (Derived Sums)

| Target | Formula | Training Strategy |
|--------|---------|-------------------|
| **pr_actual** | `points_actual + rebounds_actual` | **Derive as sum** (P + R) |
| **pa_actual** | `points_actual + assists_actual` | **Derive as sum** (P + A) |
| **ra_actual** | `rebounds_actual + assists_actual` | **Derive as sum** (R + A) |
| **pra_actual** | `points_actual + rebounds_actual + assists_actual` | **Derive as sum** (P + R + A) |

**Decision: DO NOT train separate combo models**

**Justification:**
1. **Simplicity:** 3 models instead of 7
2. **Sample efficiency:** Combos have smaller sample sizes in training data
3. **Error propagation:** If MAE(P)=2.5, MAE(R)=1.8, then MAE(PR) ≈ √(2.5² + 1.8²) = 3.1 (manageable)
4. **Interpretability:** Can debug P and R models separately
5. **Phase 3.6 approach:** Also used sums for combos

**Alternative (if combo MAE is too high):**
- Train PRA model separately as "all-around stat" predictor
- But start with sums for Phase 3.9 v1.0

---

## 3. Feature Set

### 3.1 Data Source
**File:** `data/nba/training/phase3_training_v1_20251202.jsonl`

**Dataset Stats:**
- Total rows: 49,158
- Points: 18,598 rows
- Rebounds: 17,849 rows
- Assists: 12,711 rows
- Date range: 2023-10-24 to 2025-04-11

### 3.2 Core Feature Groups

#### 3.2.1 Rolling Performance Stats (Per Market)

**Points Market:**
- `ppg_L5`, `ppg_L10`, `ppg_L20`, `ppg_L40`, `ppg_L999` (career)
- `fg_pct_L10`, `fg3_pct_L10`
- `fta_L10` (free throw attempts)

**Rebounds Market:**
- `rpg_L5`, `rpg_L10`, `rpg_L20`, `rpg_L40`, `rpg_L999`
- `oreb_pct_L10`, `dreb_pct_L10` (offensive/defensive splits)

**Assists Market:**
- `apg_L5`, `apg_L10`, `apg_L20`, `apg_L40`, `apg_L999`
- `ast_to_L10` (assist-to-turnover ratio)
- `usg_L10` (usage rate - ball-dominant players get more assists)

#### 3.2.2 Variance Features

**All Markets:**
- `{stat}_std_L10`: Standard deviation over last 10 games
- `{stat}_cv_L10`: Coefficient of variation (std / mean)
- `boom_rate_L20`: Fraction of games exceeding μ + 1σ
- `bust_rate_L20`: Fraction of games below μ - 1σ

**Rationale:** Variance features help model uncertainty but are NOT targets (Phase 3.9 predicts μ only)

#### 3.2.3 Minutes & Role Features

- `min_L5`, `min_L10`, `min_L20`: Rolling minutes per game
- `min_std_L10`: Minutes volatility (bench vs starter consistency)
- `starter_flag`: Binary (1 if typical starter, 0 if bench)

**Why Minutes Matter:**
- Strong predictor of opportunity (more minutes → more stats)
- Minutes volatility signals role uncertainty

#### 3.2.4 Opponent Defense Features

- `opp_def_rating`: Opponent's defensive efficiency (points allowed per 100 possessions)
- `opp_{stat}_allowed_L10`: Opponent's recent performance against same stat
  - `opp_ppg_allowed_L10`
  - `opp_rpg_allowed_L10`
  - `opp_apg_allowed_L10`

**Rationale:** Matchup quality affects projections (e.g., facing top-ranked defense)

#### 3.2.5 Contextual Features (Optional for v1.0)

**Include if Available:**
- `is_home`: Home vs away (home court advantage)
- `rest_days`: Days since last game (B2B = 0, well-rested = 3+)
- `season_game_number`: Early season vs late season (conditioning, load management)

**Exclude for v1.0 (Add Later):**
- `injury_risk_score`: Requires external injury data pipeline
- `line_value`: Specifically EXCLUDE to avoid leakage (line set by market, not predictor)

### 3.3 Feature Count

**Estimated Total:** ~80-90 features per model

**Breakdown:**
- Rolling stats: ~15-20 per market
- Variance features: ~10
- Minutes/role: ~5
- Opponent defense: ~5
- Contextual: ~3

**Note:** Exact count depends on Phase 3 training data schema

### 3.4 Feature Engineering Notes

**Do NOT Include:**
- `is_over` (side indicator - that's for Phase 3.8 classifiers)
- `line` (market-set value, potential leakage)
- `hit` (outcome label - that's for binary classification)

**DO Include:**
- All rolling stats that existed BEFORE game time
- Opponent stats aggregated BEFORE game
- Strict temporal ordering (no lookahead)

---

## 4. Training Protocol

### 4.1 Data Split Strategy

**Temporal Split: 70% / 15% / 15%**

| Split | Purpose | Date Range (Approximate) | Rows (Points Example) |
|-------|---------|--------------------------|------------------------|
| **Train** | Model learning | 2023-10-24 → ~2024-10-15 | ~13,000 |
| **Validation** | Early stopping, hyperparameter tuning | ~2024-10-18 → ~2025-01-05 | ~2,800 |
| **Test** | Final evaluation, report metrics | ~2025-01-08 → 2025-04-11 | ~2,800 |

**Rationale for 70/15/15:**
- More balanced than Phase 3.8's 60/20/20 (which exposed instability)
- More rigorous than Phase 3.8's 80/20 (which was too generous)
- Validation set large enough for early stopping (2,800 rows vs Phase 3.8's 3,316)

**Implementation:**
```python
def temporal_split_70_15_15(df):
    df = df.sort_values('date').reset_index(drop=True)
    n = len(df)
    train_end = int(0.70 * n)
    val_end = int(0.85 * n)
    
    train = df.iloc[:train_end]
    val = df.iloc[train_end:val_end]
    test = df.iloc[val_end:]
    
    return train, val, test
```

### 4.2 Model Architecture

**Algorithm:** LightGBM Regressor

**Why LightGBM:**
- Proven in Phase 3.6/3.7/3.8 across all phases
- Fast training and inference
- Handles missing values natively
- Good with high-cardinality features

**Base Configuration:**
```python
LIGHTGBM_PARAMS = {
    'objective': 'regression',  # MAE or MSE (tune in experiments)
    'metric': 'l1',  # MAE (primary metric)
    'boosting_type': 'gbdt',
    'learning_rate': 0.03,  # Conservative for stability
    'num_leaves': 48,  # Medium complexity
    'max_depth': -1,  # No hard limit
    'feature_fraction': 0.85,  # Feature sampling
    'bagging_fraction': 0.85,  # Row sampling
    'bagging_freq': 5,
    'min_data_in_leaf': 30,  # Prevent overfitting
    'lambda_l1': 0.1,  # L1 regularization
    'lambda_l2': 0.2,  # L2 regularization
    'verbose': -1
}
```

**Training Procedure:**
1. Load train/val sets
2. Create LightGBM Dataset objects
3. Train with early stopping:
   - Monitor: Validation MAE
   - Patience: 100 rounds (Phase 3.8 used 50, but we want μ-models to fully converge)
   - Max rounds: 1500
4. Save best iteration model

**Early Stopping Rationale:**
- Phase 3.8 Rebounds converged at iteration 41 (early stopping worked well)
- Phase 3.8 Points stopped at iteration 1 (model found no signal)
- For μ-prediction, we expect convergence around 100-300 iterations

### 4.3 Hyperparameter Tuning (Phase 3.9 v1.1+)

**For v1.0:** Use base config above (proven from Phase 3.6)

**For v1.1:** Optionally grid search on validation set:
- `learning_rate`: [0.02, 0.03, 0.05]
- `num_leaves`: [32, 48, 64]
- `min_data_in_leaf`: [20, 30, 40]

**Method:** Manual grid or Optuna if time permits

---

## 5. Evaluation Metrics

### 5.1 Primary Metrics

#### 5.1.1 Mean Absolute Error (MAE)
**Formula:** `MAE = mean(|μ_pred - actual|)`

**Why Primary:**
- Interpretable (same units as stat: points, rebounds, assists)
- Robust to outliers
- Directly measures projection accuracy

**Target:** Beat Phase 3.6 baseline (TBD after extraction)

#### 5.1.2 Root Mean Squared Error (RMSE)
**Formula:** `RMSE = sqrt(mean((μ_pred - actual)²))`

**Why Include:**
- Standard regression metric
- Penalizes large errors more than MAE
- Comparable to Phase 3.6

#### 5.1.3 Bias (Mean Error)
**Formula:** `Bias = mean(μ_pred - actual)`

**Why Critical:**
- Detects systematic over/under-prediction
- Positive bias = overestimating, Negative = underestimating
- Should be near zero (< ±0.5) for good projections

**Target:** `|Bias| < 0.5` per market

### 5.2 Secondary Metrics

#### 5.2.1 Correlation
**Formula:** `Pearson(μ_pred, actual)`

**Target:** r ≥ 0.80

**Interpretation:**
- 0.90+ = Excellent predictive relationship
- 0.80-0.90 = Good
- < 0.80 = Weak (need feature engineering)

#### 5.2.2 Median Absolute Error (MedAE)
**Formula:** `MedAE = median(|μ_pred - actual|)`

**Why Useful:**
- Robust to outliers (unlike MAE)
- Shows "typical" error

#### 5.2.3 Explained Variance
**Formula:** `1 - Var(actual - μ_pred) / Var(actual)`

**Target:** ≥ 0.60

---

### 5.3 Segmented Evaluation

**Critical for Production Readiness:**

| Segment | Definition | Why Segment |
|---------|------------|-------------|
| **Line Bucket** | Low (<15), Medium (15-25), High (>25) for Points | Different player tiers may have different error profiles |
| **Minutes Bucket** | Bench (<25 min), Starter (25-35), Star (>35) | Opportunity drives projection accuracy |
| **Home vs Away** | `is_home` flag | Home court advantage affects performance |
| **Season Phase** | Early (<20 games), Mid (20-60), Late (>60) | Load management, playoff positioning |

**Output Format:**
```
Test Metrics (Points):
  Overall MAE: 3.2
  By Line Bucket:
    Low (<15):    MAE 2.1  (n=500)
    Medium (15-25): MAE 3.5  (n=1200)
    High (>25):   MAE 4.8  (n=1100)
  By Minutes:
    Bench:   MAE 2.5  (n=800)
    Starter: MAE 3.3  (n=1500)
    Star:    MAE 4.0  (n=500)
```

**Red Flag:** If any segment has MAE > 1.5× overall MAE, investigate feature gaps

---

## 6. Model Persistence & Metadata

### 6.1 Directory Structure

```
models/nba/phase3.9/projections/
├── points/
│   ├── model.txt                    # LightGBM booster (text format)
│   ├── metadata.json                # Training info, metrics, features
│   └── validation_report.md         # Human-readable summary
├── rebounds/
│   ├── model.txt
│   ├── metadata.json
│   └── validation_report.md
├── assists/
│   ├── model.txt
│   ├── metadata.json
│   └── validation_report.md
└── training_summary.json            # Aggregate metrics across all markets
```

### 6.2 Metadata Schema

**File:** `models/nba/phase3.9/projections/{market}/metadata.json`

```json
{
  "model_name": "points",
  "phase": "3.9",
  "training_date": "2025-12-02T15:30:00Z",
  "data_source": "data/nba/training/phase3_training_v1_20251202.jsonl",
  "dataset_stats": {
    "total_rows": 18598,
    "train_rows": 13000,
    "val_rows": 2799,
    "test_rows": 2799,
    "date_range": {
      "train": ["2023-10-24", "2024-10-15"],
      "val": ["2024-10-18", "2025-01-05"],
      "test": ["2025-01-08", "2025-04-11"]
    }
  },
  "features": {
    "count": 87,
    "columns": ["ppg_L5", "ppg_L10", "ppg_L20", "ppg_L40", "ppg_L999", "fg_pct_L10", ...]
  },
  "hyperparameters": {
    "learning_rate": 0.03,
    "num_leaves": 48,
    "max_depth": -1,
    "min_data_in_leaf": 30,
    "lambda_l1": 0.1,
    "lambda_l2": 0.2,
    "num_iterations": 425,
    "best_iteration": 325
  },
  "metrics": {
    "train": {
      "mae": 2.1,
      "rmse": 3.2,
      "bias": 0.05,
      "correlation": 0.92
    },
    "val": {
      "mae": 2.8,
      "rmse": 4.1,
      "bias": -0.12,
      "correlation": 0.87
    },
    "test": {
      "mae": 3.2,
      "rmse": 4.5,
      "bias": 0.23,
      "correlation": 0.84
    }
  },
  "segment_metrics": {
    "test": {
      "by_line_bucket": {
        "low": {"mae": 2.1, "n": 500},
        "medium": {"mae": 3.5, "n": 1200},
        "high": {"mae": 4.8, "n": 1100}
      },
      "by_minutes_bucket": {
        "bench": {"mae": 2.5, "n": 800},
        "starter": {"mae": 3.3, "n": 1500},
        "star": {"mae": 4.0, "n": 500}
      }
    }
  }
}
```

---

## 7. Combo Target Derivation

### 7.1 Inference-Time Formula

```python
def predict_combos(points_μ, rebounds_μ, assists_μ):
    return {
        'points': points_μ,
        'rebounds': rebounds_μ,
        'assists': assists_μ,
        'pr': points_μ + rebounds_μ,
        'pa': points_μ + assists_μ,
        'ra': rebounds_μ + assists_μ,
        'pra': points_μ + rebounds_μ + assists_μ
    }
```

### 7.2 Expected Combo MAE

**Error Propagation (Assuming Independent Errors):**

If:
- MAE(Points) = 3.2
- MAE(Rebounds) = 1.8
- MAE(Assists) = 1.5

Then approximate:
- MAE(PR) ≈ √(3.2² + 1.8²) = 3.7
- MAE(PA) ≈ √(3.2² + 1.5²) = 3.5
- MAE(RA) ≈ √(1.8² + 1.5²) = 2.3
- MAE(PRA) ≈ √(3.2² + 1.8² + 1.5²) = 4.0

**Validation:**
- Compute actual combo MAE on test set
- If actual >> theoretical, may need separate combo models (Phase 3.9 v2.0)

---

## 8. Feature Importance Analysis

**Post-Training:**
- Extract LightGBM feature importance (gain, split)
- Identify top 20 features per market
- Check for:
  - **Dominance of recent stats** (L5 > L10 > L20)
  - **Minutes as key driver**
  - **Opponent defense signal**
  - **Variance features contribution** (should be modest for μ-prediction)

**Output:** `docs/phase39_validation/PHASE39_FEATURE_IMPORTANCE_{market}.md`

---

## 9. Comparison to Phase 3.6 Baseline

**Once Phase 3.6 metrics extracted:**

| Market | Phase 3.6 MAE | Phase 3.9 MAE | Δ MAE | Status |
|--------|---------------|---------------|-------|--------|
| Points | TBD | TBD | TBD | TBD |
| Rebounds | TBD | TBD | TBD | TBD |
| Assists | TBD | TBD | TBD | TBD |

**Success Threshold:**
- If Phase 3.9 MAE < Phase 3.6 MAE → ✅ Upgrade justified
- If Phase 3.9 MAE ≈ Phase 3.6 MAE (within 5%) → ⚠️ Marginal improvement, consider feature engineering
- If Phase 3.9 MAE > Phase 3.6 MAE → 🚨 Regression, investigate

---

## 10. Open Questions & Future Work

### 10.1 For Phase 3.9 v1.0

**Decisions Made:**
- ✅ Train P/R/A individually, derive combos as sums
- ✅ Use 70/15/15 temporal split
- ✅ LightGBM with early stopping on val MAE
- ✅ Primary metric: MAE

**Deferred to v1.1:**
- Hyperparameter grid search (start with Phase 3.6 params)
- Separate combo models (PRA-specific training)
- Advanced features (injury risk, opponent-specific matchups)

### 10.2 Integration with Phase 3.5 Frontend

**Phase 3.9 outputs:** Numeric μ projections per stat

**Phase 3.5 needs:** Over/Under probabilities + edges

**Bridge Layer (Separate from Phase 3.9):**
1. Load Phase 3.9 μ-models
2. Given player, game, line:
   - Get μ_pred from Phase 3.9
   - Apply calibration function: P(Over) = f(μ_pred, line, σ_estimate)
   - Compute edge vs market odds
3. Return predictions in Phase 3.5 JSON format

**This bridge is Phase 3.10 or Phase 3.5.1** (not part of Phase 3.9 scope)

---

## 11. Success Checklist

**Phase 3.9 v1.0 is complete when:**

- [ ] Training script (`train_phase39_projections.py`) runs end-to-end
- [ ] 3 models trained and saved (Points, Rebounds, Assists)
- [ ] Metadata JSON files generated with all metrics
- [ ] Test MAE ≤ Phase 3.6 baseline (once extracted) OR ≤ 3.5 for Points, 2.0 for Rebounds, 1.8 for Assists (aspirational)
- [ ] Bias < ±0.5 per market
- [ ] Correlation ≥ 0.80 per market
- [ ] Combo projections (sums) have reasonable MAE (≤ 4.5 for PRA)
- [ ] Validation reports generated in `docs/phase39_validation/`
- [ ] Inference API (`phase39_projection_predictor.py`) can load models and predict
- [ ] Integration notes document exists

---

**Status:** ✅ **Specification Complete - Ready for Implementation (Block 3)**

**Next Step:** Create `scripts/nba/train_phase39_projections.py`

