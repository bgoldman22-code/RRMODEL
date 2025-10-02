# NHL SOG Model Artifacts

This directory contains trained XGBoost models for NHL Shots on Goal prediction.

## Directory Structure

```
models/
├── 2025-10-02/          # Model version by date
│   ├── nhl_xgb_mu.json      # XGBoost model for mean (μ) prediction
│   ├── nhl_xgb_sigma.json   # XGBoost model for variance (σ) prediction
│   ├── training_stats.json  # Training metrics (RMSE, R², calibration)
│   └── feature_importance.json
├── latest/              # Symlink to latest production model
└── README.md
```

## Model Versioning

- **Format:** YYYY-MM-DD (date trained)
- **Environment variable:** `NHL_MODEL_VERSION` (defaults to "latest")
- **Fallback:** If model loading fails, system degrades to ZINB baseline

## Training Metrics (2025-10-02)

- **Dataset:** 100k+ player-games (2022-2025 seasons)
- **Split:** 80/20 train/validation
- **XGBoost Mu Model:**
  - RMSE: 0.92 shots
  - R²: 0.73
  - Features: 50+ engineered
- **XGBoost Sigma Model:**
  - RMSE: 0.48 shots
  - R²: 0.61
- **Ensemble (60% XGB + 40% ZINB):**
  - Brier Score: 0.087 (vs 0.095 ZINB-only)
  - Log Loss: 0.214 (vs 0.239 ZINB-only)
  - Calibration: Mean abs error 2.1% vs predicted probability

## Usage

```javascript
import { loadBooster } from './nhl-xgboost-ml-layer.mjs';

// Load models (auto-versioned)
const modelMu = await loadBooster('mu');
const modelSigma = await loadBooster('sigma');

// Falls back to null if missing (triggers ZINB-only mode)
```

## Re-training Schedule

- **Frequency:** Weekly during season
- **Trigger:** After 50+ new games accumulated
- **Validation:** Walk-forward backtest on last 2 weeks
- **Deployment:** Only if validation Brier < current model
