# BTTS Northern Star Indicator Discovery + 3-Phase Model Tournament

## 🎯 Project Goal

Identify the strongest predictors of Both Teams To Score (BTTS) in the English Premier League and build state-of-the-art prediction models through a comprehensive research pipeline.

## ✅ **CLEAN V1 MILESTONE (Dec 10, 2025)**

**Status:** 🎉 **PRODUCTION-READY - NO LEAKAGE**

After discovering and eliminating catastrophic target leakage, we now have trustworthy BTTS prediction models:

- ✅ **Best Model:** Logistic Regression - **43.47% ROI** @ 0.55 threshold
- ✅ **All models beat Profile C baseline** (+19.64% ROI)
- ✅ **Clean features:** 84 features (no `goals_fpl` leakage)
- ✅ **Realistic metrics:** AUC 0.67-0.78, Brier 0.19-0.26

📄 **See:** `BTTS_CLEAN_RETRAINING_SUMMARY.md` for complete results and recommendations.

## 📁 Project Structure

```
research/btts_option_c/
├── data/                          # Cached processed data
│   ├── unified_matches.csv        # Merged data from all sources
│   └── engineered_features.csv    # Features with L5/L10 rolling stats
├── features/                      # Feature engineering artifacts
├── models/                        # Trained model files
│   ├── logistic_btts.pkl
│   ├── poisson_btts.pkl
│   ├── random_forest_btts.pkl
│   ├── lightgbm_btts.pkl
│   ├── xgboost_btts.pkl
│   └── catboost_btts.pkl
├── results/                       # Experiment outputs
│   ├── feature_ranking.csv        # Comprehensive feature importance
│   ├── model_leaderboard.csv      # Final model comparison
│   ├── top_features_comparison.png
│   ├── shap/                      # SHAP visualizations
│   ├── calibration_plots/         # Calibration curves
│   └── profit_curves/             # Betting simulation results
├── src/                           # Source code modules
│   ├── load_data.py              # Data loading & merging
│   ├── build_features.py         # Feature engineering (L5/L10 rolling)
│   ├── feature_importance.py     # MI + RF + SHAP analysis
│   ├── model_baselines.py        # Phase 1: Logistic, Poisson, RF
│   ├── model_ml.py               # Phase 2: LightGBM, XGBoost, CatBoost
│   ├── model_hybrid.py           # Phase 3: Hybrid models
│   └── evaluate.py               # Comprehensive evaluation suite
├── notebook/                      # Jupyter notebooks for exploration
├── RUN_EXPERIMENT.py              # Master pipeline runner
└── README.md                      # This file
```

## 🚀 Quick Start - Clean V1 Experiments

### Run Clean Temporal Holdout (Recommended)

```bash
cd research/btts_option_c/
python3 RUN_TEMPORAL_HOLDOUT.py
```

**Duration:** ~2 seconds  
**What it does:**
- Splits data: 40% train (364 matches) / 60% test (546 matches)
- Trains all 6 models on clean features (no `goals_fpl` leakage)
- Evaluates on test set: AUC, Brier, ROI @ 0.55 & 0.60
- Saves: `results/temporal_holdout_metrics.csv` & `results/temporal_holdout_roi.csv`

### Run Walk-Forward Backtest (Secondary Validation)

```bash
cd research/btts_option_c/
python3 RUN_WALKFORWARD.py
```

**Duration:** ~50 seconds  
**What it does:**
- 6 expanding-window folds (fold 6 skipped: 1 sample)
- Trains models on each fold, evaluates on next period
- Confirms temporal holdout results are robust
- Saves: `results/walkforward_metrics.csv` & `results/walkforward_roi.csv`

### Save Clean V1 Models

```bash
cd research/btts_option_c/
python3 SAVE_CLEAN_V1_MODELS.py
```

**What it does:**
- Retrains all 6 models on 40% temporal split
- Saves as pickled artifacts in `models/` directory
- Adds metadata (version, timestamp, notes)
- Ready for production deployment

### Prerequisites

Ensure data fetchers have been run:

```bash
# From RRMODEL/ directory
python3 scripts/soccer/fetchers/fetch_api_football.py  # ~15 min
python3 scripts/soccer/fetchers/fetch_fpl_data.py      # ~5 min
```

This will create:
- `scripts/data/premier_league/api_football_statistics.csv` (910 matches, 43 features)
- `scripts/data/premier_league/fpl_player_context.csv` (850 matches, 27 features)

**Expected duration:** 20-30 minutes

**What it does:**
1. Loads & merges data from API-Football + FPL + baseline (~850-910 matches)
2. Engineers L5/L10 rolling features for both teams (xG, shots, possession, BTTS rate)
3. Computes feature importance using 3 methods (MI, Random Forest, SHAP)
4. Trains Phase 1 baselines (Logistic Regression, Poisson, Random Forest)
5. Trains Phase 2 modern ML (LightGBM, XGBoost, CatBoost) with Optuna hyperparameter search
6. Generates master leaderboard with AUC, Brier, LogLoss metrics

### Run Individual Components

```bash
# Data loading only
python3 src/load_data.py

# Feature engineering
python3 src/build_features.py

# Feature importance discovery
python3 src/feature_importance.py

# Phase 1 baselines
python3 src/model_baselines.py

# Phase 2 modern ML
python3 src/model_ml.py
```

## 📊 Data Sources

### Input Data

1. **API-Football Statistics** (`api_football_statistics.csv`)
   - Source: v3.football.api-sports.io (Ultra plan)
   - Coverage: 2023-2026 seasons (910 matches)
   - Features: xG, 6 shot types, possession, passes, referee
   - Cost: $0 (plan active until 2026-03-10)

2. **FPL Player Availability** (`fpl_player_context.csv`)
   - Source: temp_fpl_data/ (Fantasy Premier League)
   - Coverage: 2023-2026 seasons (850 matches)
   - Features: Injuries, squad availability, attack quality impact
   - Cost: $0 (free data)

3. **Baseline Odds Data** (existing)
   - Source: Historical EPL match data with BTTS labels
   - Coverage: ~904 matches
   - Features: BTTS result, market odds

### Feature Engineering

**Rolling Form Features (L5/L10):**
- `home_xg_L5`, `home_xg_L10` - Recent xG form
- `home_xga_L5`, `home_xga_L10` - Recent xG against
- `home_btts_rate_L5`, `home_btts_rate_L10` - Recent BTTS rate
- Same for away team (12 features per team)

**Match-Level Engineered Features:**
- `sum_xg` - Total expected goals
- `diff_xg` - xG differential
- `xg_dominance` - Strongest team's share
- `shot_quality_home/away` - xG per shot
- `possession_dominance` - Absolute difference
- `chaos_index` - Total shots
- `min_attack_quality` - Weakest attack availability

**Trend Features:**
- `home_xg_trend` - L5 vs L10 xG trend
- `home_btts_momentum` - L5 vs L10 BTTS rate change

**Total Features:** ~65-80+ (depending on data availability)

## 🧪 Feature Importance Discovery

Three independent methods rank features:

1. **Mutual Information (MI)**
   - Non-parametric measure of dependence
   - Captures non-linear relationships
   - Fast to compute

2. **Random Forest Feature Importance**
   - Gini-based importance from 200 trees
   - Robust to overfitting
   - Good for tree-based model planning

3. **LightGBM + SHAP Values**
   - State-of-the-art gradient boosting
   - SHAP provides local explanations
   - Shows feature interactions

**Output:**
- `results/feature_ranking.csv` - Unified rankings with composite score
- `results/shap/` - SHAP visualizations (bar, beeswarm)
- `results/top_features_comparison.png` - Side-by-side method comparison

## 🤖 Model Training

### Phase 1: Baseline Models

**1. Logistic Regression**
- L2 regularization (C=1.0)
- Platt scaling calibration (5-fold CV)
- Fast, interpretable
- Baseline for linear relationships

**2. Naive Poisson BTTS**
- Assumes goals follow Poisson distribution
- P(BTTS) = (1 - e^(-λ_home)) * (1 - e^(-λ_away))
- Uses xG as λ if available
- Simple probabilistic model

**3. Random Forest**
- 200 trees, max_depth=10, min_samples_leaf=20
- Baseline for non-linear relationships
- Feature importance for interpretation

### Phase 2: Modern ML (with Optuna Hyperparameter Search)

**1. LightGBM**
- Gradient boosting with leaf-wise growth
- Tuned params: num_leaves, learning_rate, feature_fraction, etc.
- 30 Optuna trials
- Fast training, excellent performance

**2. XGBoost**
- Gradient boosting with level-wise growth
- Tuned params: max_depth, learning_rate, subsample, etc.
- 30 Optuna trials
- Battle-tested, robust

**3. CatBoost**
- Gradient boosting with ordered boosting
- Tuned params: iterations, depth, learning_rate, etc.
- 30 Optuna trials
- Handles categorical features well

**All Phase 2 models:**
- 5-fold cross-validation during tuning
- Early stopping (30 rounds)
- Final model trained on full dataset
- Saved to `models/` directory

### Phase 3: Hybrid Models (Future Work)

**1. Dixon-Coles + ML Residuals**
- Generate DC BTTS probability
- Train ML model to predict residual
- Final = DC + correction

**2. Blended Ensemble**
- Optimize weights: w1*DC + w2*LGBM + w3*CatBoost
- Simple averaging or weighted by validation performance

**3. Stacked Model**
- Use baseline predictions as features
- Train meta-model on top

## 📈 Evaluation Metrics

For each model:

- **AUC (Area Under ROC Curve)** - Discrimination ability
- **Brier Score** - Calibration quality (lower is better)
- **Log Loss** - Probabilistic accuracy (lower is better)
- **Calibration Curve** - Visual calibration assessment
- **Precision@K** - Top K predictions accuracy
- **Profit (Flat Betting)** - ROI with uniform stakes
- **Profit (Kelly)** - ROI with Kelly criterion
- **Profit vs Odds Baseline** - Beat the market?

## 🏆 Expected Outcomes

After completion, you'll have:

1. **Top 15 BTTS Indicators**
   - Ranked by composite score across 3 methods
   - Answer: Which features matter most?

2. **Model Leaderboard**
   - All models compared on AUC, Brier, LogLoss
   - Answer: Which modeling approach works best?

3. **Feature Insights**
   - Do L5/L10 rolling stats matter?
   - Does xG dominate predictions?
   - Is player availability predictive?
   - What's the role of match context (referee, possession)?

4. **Model Artifacts**
   - Trained models saved in `models/`
   - Ready for deployment or further tuning

5. **Visualizations**
   - SHAP plots showing feature contributions
   - Calibration curves showing probability quality
   - Feature importance comparisons

## 📊 Interpreting Results

### Feature Rankings

**High Composite Score (>0.7):**
- Critical predictor, all methods agree
- Should be included in any BTTS model

**Medium Score (0.4-0.7):**
- Useful signal, may be method-dependent
- Consider including with regularization

**Low Score (<0.4):**
- Weak or noisy signal
- Can drop to reduce overfitting

### Model Performance

**AUC Benchmarks:**
- >0.65: Excellent (beats random + market)
- 0.60-0.65: Good (practical predictive power)
- 0.55-0.60: Moderate (marginal value)
- <0.55: Poor (close to random)

**Brier Score Benchmarks:**
- <0.20: Excellent calibration
- 0.20-0.23: Good calibration
- 0.23-0.25: Acceptable
- >0.25: Poor calibration

## 🔬 Research Questions Answered

1. **Are L5/L10 form features predictive?**
   - Check if rolling stats rank high in feature importance
   - Compare models with/without rolling features

2. **Does xG dominate BTTS predictions?**
   - Check if xG-based features top the rankings
   - Compare Poisson (xG-only) vs full ML models

3. **Is player availability predictive?**
   - Check FPL features (injuries, attack quality) in rankings
   - Quantify impact on model performance

4. **Do modern ML models beat baselines?**
   - Compare Phase 2 (LightGBM, etc.) vs Phase 1 (Logistic, RF)
   - Justify complexity vs simple models

5. **Can we beat the Dixon-Coles baseline?**
   - Once Phase 3 hybrids are implemented
   - Compare best model vs existing Profile C ROI

## 🛠️ Extending the Pipeline

### Add New Features

Edit `src/build_features.py`:

```python
def add_custom_features(df):
    # Add your feature engineering here
    df['custom_feature'] = ...
    return df
```

### Add New Model

Create `src/model_custom.py`:

```python
class CustomBTTSModel:
    def fit(self, X, y):
        # Your model here
        pass
    
    def predict_proba(self, X):
        # Return probabilities
        pass
```

Update `RUN_EXPERIMENT.py` to include your model.

### Add New Data Source

Edit `src/load_data.py`:

```python
def load_new_source():
    # Load your data
    return df

def merge_all_sources():
    # Add merge logic
    unified_df = pd.merge(..., new_source_df, ...)
```

## 📝 Dependencies

See `requirements.txt` for full list. Key packages:

- `pandas`, `numpy` - Data manipulation
- `scikit-learn` - ML baselines, metrics
- `lightgbm`, `xgboost`, `catboost` - Gradient boosting
- `optuna` - Hyperparameter optimization
- `shap` - Model interpretability
- `matplotlib`, `seaborn` - Visualization

## ⚠️ Important Notes

1. **NOT Production Code**
   - This is isolated research
   - Does NOT modify Profile C or production models
   - Safe to experiment

2. **Data Requirements**
   - Requires running fetchers first
   - ~850-910 matches with external data
   - Gracefully degrades if data missing

3. **Computational Time**
   - Feature importance: 2-5 minutes
   - Phase 1 baselines: 1-2 minutes
   - Phase 2 modern ML: 15-25 minutes (due to Optuna)
   - Total: 20-30 minutes

4. **Memory Usage**
   - LightGBM SHAP: ~1-2 GB RAM
   - Can reduce sample size if needed

## 📞 Troubleshooting

**"External data not found"**
- Run fetchers first: `python3 scripts/soccer/fetchers/fetch_*.py`

**"Import module X not found"**
- Install requirements: `pip install -r requirements.txt`

**"Optuna taking too long"**
- Reduce `n_trials` in `model_ml.py` (default 30 → 10)

**"SHAP out of memory"**
- Reduce sample size in `feature_importance.py`

## 🎉 Next Steps After Completion

1. Review `results/feature_ranking.csv` - Understand what matters
2. Review `results/model_leaderboard.csv` - Pick best model
3. Analyze SHAP plots - Understand feature interactions
4. If results are good, integrate best model into Profile C
5. Run backtest to estimate real ROI
6. Deploy if outperforms baseline

---

**Status:** Ready to run  
**Last Updated:** December 10, 2025  
**Contact:** See main RRMODEL repo
