# NBA Phase 3 PRA Model - Recovery Audit Report

**Date:** November 24, 2025  
**Auditor:** GitHub Copilot in VS Code  
**Mission:** Restore NBA PRA Phase 3 classification model to production-ready state

---

## 📦 EXTRACTED ARTIFACTS INVENTORY

### From `~/Downloads/nba_phase3_pra_artifacts.zip` (29KB)

**Contents:**
```
phase3_recovery/
├── README.md (7KB) - Search findings documentation
├── docs/
│   ├── NBA_PROPS_V2_AUTOMATION_COMPLETE.md (9.9KB)
│   ├── NBA_PROPS_V2_COMPLETE_STATUS.md (16.6KB) - **CLAIMS 60.8% win, 17.08% ROI**
│   └── PHASE_2_5_INVENTORY_REPORT.md (14KB)
├── scripts/
│   ├── build-pra-training-phase3.mjs (18KB) - Training data builder
│   ├── generate-pra-predictions-v2.mjs (10KB) - **PLACEHOLDER/DUMMY CODE**
│   └── nba-props-v2.mjs (4KB) - Netlify function wrapper
├── models/ (EMPTY)
└── data/ (EMPTY)
```

**Status:** ⚠️ **No actual model files or training data recovered**

---

## 🔍 EXISTING REPO ARTIFACTS DISCOVERED

### Phase 2.5 Regression Models (FOUND ✅)

**Location:** `data/nba/models/temp/*.json`

**Models Found:** 30+ regression model files from walk-forward validation

**Structure:**
```json
{
  "L5_ppg": 10.8,
  "L5_rpg": 2.6,
  "L5_apg": 1.4,
  "L5_minutes": 28.4,
  "L5_fga": 6.8,
  "L5_fta": 1.8,
  "L10_ppg": 7.2,
  "L10_rpg": 3.3,
  "L10_apg": 1.1,
  "L10_minutes": 25.9,
  "L10_fga": 5.1,
  "L10_fta": 1.1,
  "season_ppg": 7.44,
  "season_rpg": 2.85,
  "season_apg": 1.44,
  "home": 1,
  "rest_days": 4,
  "back_to_back": 0,
  "opp_ppg_allowed": 10.21,
  "opp_pace": 22.29,
  "games_played": 41,
  "target": 10  // Actual points scored
}
```

**Model Types:**
- `points_Window_1/2/3` - Points prediction models (Feb/Mar/Apr 2025 test sets)
- `rebounds_Window_1/2/3` - Rebounds prediction models
- `assists_Window_1/2/3` - Assists prediction models
- `*_rate` variants - Per-minute rate predictions

**Assessment:** ✅ **These are REAL, TRAINED REGRESSION MODELS**
- Can predict stat totals
- Have test set validation
- Include feature importance
- Are NOT classification models (no over/under probability)

---

## 🚨 CRITICAL FINDINGS

### What EXISTS:
1. ✅ **Phase 2.5 regression models** - 30+ trained models in `data/nba/models/temp/`
2. ✅ **Training data builder** - `build-pra-training-phase3.mjs` (functional skeleton)
3. ✅ **Boxscore data** - `player-boxscores-2025-26.json` (7,903 entries)
4. ✅ **Opponent defense stats** - Updated daily
5. ✅ **Documentation** - Claims Phase 3 achieved 60.8% win / 17.08% ROI
6. ✅ **Frontend UI** - `/nba-player-props-v2` route ready
7. ✅ **Daily automation** - GitHub Actions workflow configured

### What DOES NOT EXIST:
1. ❌ **Phase 3 trained model** - `phase3_pra_coefficients.json` MISSING
2. ❌ **Phase 3 training data** - `training_multi_season_phase3.jsonl` MISSING
3. ❌ **Real prediction logic** - Generator is placeholder with hardcoded weights
4. ❌ **Feature scaler** - No saved StandardScaler or normalization params
5. ❌ **Historical odds data** - No multi-season odds archive for training
6. ❌ **Model metadata** - No training logs, hyperparameters, or validation results
7. ❌ **Player profitability analysis** - The "Anfernee Simons profitable" document not found

---

## 🎯 RECOVERY STRATEGY

### Phase 1: Establish Phase 2.5 Baseline (IMMEDIATE)
**Goal:** Get a working prediction system using existing regression models

**Tasks:**
1. Parse Phase 2.5 regression model coefficients
2. Build inference layer for stat predictions
3. Compare predictions to Vegas lines
4. Generate edge-based picks
5. Deploy to `/nba-player-props-v2` endpoint

**Timeline:** 1-2 hours  
**Blocker:** Need to understand model coefficient format

---

### Phase 2: Collect Historical Training Data (CRITICAL PATH)
**Goal:** Build Phase 3 classification training dataset

**Data Sources:**
- ✅ Player boxscores: 2022-23, 2023-24, 2024-25, 2025-26 seasons
- ✅ Opponent defense: Can calculate from boxscores
- ⚠️ Historical odds: **NEED TO RECOLLECT**
  - TheOddsAPI historical endpoint (120 days available)
  - OddsJam archives (if accessible)
  - Manual scraping from alternate sources

**Training Table Schema:**
```jsonl
{
  "player": "Anfernee Simons",
  "date": "2024-11-15",
  "market": "PRA",
  "line": 25.5,
  "side": "OVER",
  "L5_pra": 26.8,
  "L10_pra": 24.3,
  "L999_pra": 22.1,
  "L5_minutes": 34.2,
  "L10_minutes": 33.8,
  "rest_days": 1,
  "opponent": "LAL",
  "opp_def_L5_pra_allowed": 28.5,
  "opp_def_L10_pra_allowed": 27.9,
  "home": 1,
  "games_played": 45,
  "actual_pra": 28,
  "result": 1  // Hit
}
```

**Timeline:** 3-5 days (depending on odds availability)

---

### Phase 3: Train Classification Models (CORE REBUILD)
**Goal:** Train 6 logistic regression models (Points/Rebounds/Assists × Over/Under)

**Models:**
1. `pra_over.pkl` - PRA total OVER classifier
2. `pra_under.pkl` - PRA total UNDER classifier
3. `points_over.pkl` - Points OVER classifier
4. `points_under.pkl` - Points UNDER classifier
5. `rebounds_over.pkl` - Rebounds OVER classifier
6. `rebounds_under.pkl` - Rebounds UNDER classifier
7. `assists_over.pkl` - Assists OVER classifier
8. `assists_under.pkl` - Assists UNDER classifier

**Training Approach:**
```python
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import pickle

# Load training data
df = pd.read_json('training_multi_season_phase3.jsonl', lines=True)

# Filter to PRA OVER bets
train = df[(df['market'] == 'PRA') & (df['side'] == 'OVER')]

# Features
features = ['L5_pra', 'L10_pra', 'L999_pra', 'L5_minutes', 'L10_minutes', 
            'rest_days', 'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
            'home', 'games_played', 'line']

X = train[features]
y = train['result']  # 1=hit, 0=miss

# Scale features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Train model
model = LogisticRegression(
    class_weight='balanced',
    C=1.0,
    random_state=42,
    max_iter=1000
)
model.fit(X_scaled, y)

# Save artifacts
with open('pra_over_scaler.pkl', 'wb') as f:
    pickle.dump(scaler, f)
    
with open('pra_over_model.pkl', 'wb') as f:
    pickle.dump(model, f)

# Export coefficients to JSON (for Node.js)
coeffs = {
    'intercept': float(model.intercept_[0]),
    'coefficients': {feat: float(coef) for feat, coef in zip(features, model.coef_[0])},
    'feature_means': scaler.mean_.tolist(),
    'feature_stds': scaler.scale_.tolist(),
    'features': features
}

with open('pra_over_coefficients.json', 'w') as f:
    json.dump(coeffs, f, indent=2)
```

**Timeline:** 1 day (once training data ready)

---

### Phase 4: Build JavaScript Inference Layer
**Goal:** Implement Phase 3 model in Node.js for Netlify

**File:** `netlify/functions/_lib/pra-model-phase3.mjs`

```javascript
import { readFileSync } from 'fs';

// Load model coefficients
const PRA_OVER = JSON.parse(readFileSync('data/nba/models/phase3/pra_over_coefficients.json'));

export function predictPRA_Over(features) {
  // Standardize features
  const standardized = {};
  for (const [feat, value] of Object.entries(features)) {
    const idx = PRA_OVER.features.indexOf(feat);
    const mean = PRA_OVER.feature_means[idx];
    const std = PRA_OVER.feature_stds[idx];
    standardized[feat] = (value - mean) / std;
  }
  
  // Calculate logit: w·x + b
  let logit = PRA_OVER.intercept;
  for (const [feat, value] of Object.entries(standardized)) {
    logit += PRA_OVER.coefficients[feat] * value;
  }
  
  // Sigmoid: P(y=1) = 1 / (1 + e^(-logit))
  const probability = 1 / (1 + Math.exp(-logit));
  
  return probability;
}
```

**Timeline:** 4 hours

---

### Phase 5: Production Deployment
**Goal:** Replace placeholder generator with real Phase 3 predictions

**File:** `scripts/nba/generate-pra-predictions-phase3.mjs`

**Tasks:**
1. Load today's games and odds
2. Calculate features for each player-prop
3. Run Phase 3 models
4. Calculate edge (model_prob - implied_prob)
5. Filter by thresholds (edge ≥ 5%, confidence ≥ 60%)
6. Write to `public/data/nba/nba-props-phase3-live.json`
7. Update frontend to consume new endpoint

**Timeline:** 1 day

---

## 📊 DIRECTORY STRUCTURE (PROPOSED)

```
RRMODEL/
├── data/nba/
│   ├── raw/                          # Never modify
│   │   ├── boxscores_2022_23.json
│   │   ├── boxscores_2023_24.json
│   │   ├── boxscores_2024_25.json
│   │   └── boxscores_2025_26.json
│   ├── processed/                    # Derived datasets
│   │   ├── opponent_defense_2022_23.json
│   │   ├── opponent_defense_2023_24.json
│   │   ├── opponent_defense_2024_25.json
│   │   └── opponent_defense_2025_26.json
│   ├── historical_odds/              # Multi-season odds archive
│   │   ├── nba_props_2022_23.jsonl
│   │   ├── nba_props_2023_24.jsonl
│   │   ├── nba_props_2024_25.jsonl
│   │   └── nba_props_2025_26.jsonl
│   ├── training/                     # Training datasets
│   │   ├── phase3_training_v1.jsonl (NEVER DELETE)
│   │   ├── phase3_training_v2.jsonl
│   │   └── phase3_training_metadata.json
│   └── models/
│       ├── phase2_5/                 # Existing regression models
│       │   └── temp/ (30+ files)
│       └── phase3/                   # Classification models
│           ├── pra_over_coefficients.json
│           ├── pra_over_scaler.pkl
│           ├── pra_under_coefficients.json
│           ├── pra_under_scaler.pkl
│           ├── points_over_coefficients.json
│           ├── points_under_coefficients.json
│           ├── rebounds_over_coefficients.json
│           ├── rebounds_under_coefficients.json
│           ├── assists_over_coefficients.json
│           ├── assists_under_coefficients.json
│           └── model_metadata.json
├── scripts/nba/
│   ├── build-pra-training-phase3.mjs  # ✅ EXISTS
│   ├── train-phase3-models.py         # ⚠️ NEED TO CREATE
│   └── generate-pra-predictions-phase3.mjs  # ⚠️ NEED TO RECREATE
├── netlify/functions/
│   ├── _lib/
│   │   └── pra-model-phase3.mjs       # ⚠️ NEED TO CREATE
│   └── nba-props-v2.mjs               # ✅ EXISTS (needs update)
└── phase3_recovery/                   # This audit folder
    ├── AUDIT_REPORT.md (THIS FILE)
    ├── checkpoints/
    │   └── checkpoint_YYYYMMDD_HHMM.json
    └── logs/
        └── training_log_YYYYMMDD.txt
```

---

## 🚦 ANTI-DATA-LOSS RULES (MANDATORY)

### Rule 1: Permanent Storage
- ✅ Every model output → disk immediately
- ✅ Every training dataset → git-tracked file
- ✅ No ephemeral in-memory transformations

### Rule 2: Versioning
- ✅ Date-prefix all datasets: `phase3_training_20251124.jsonl`
- ✅ Never overwrite previous versions
- ✅ Keep version registry in `data/nba/VERSION_LOG.md`

### Rule 3: Checkpointing
- ✅ After each major step, write checkpoint:
```json
{
  "timestamp": "2025-11-24T14:30:00Z",
  "step": "Phase 3 training complete",
  "artifacts": ["pra_over_coefficients.json", "pra_over_scaler.pkl"],
  "validation_acc": 0.608,
  "validation_roi": 0.1708
}
```

### Rule 4: Idempotency
- ✅ All scripts must be re-runnable without corruption
- ✅ Use atomic writes: write to `.tmp`, then rename
- ✅ Check for existing outputs before regenerating

### Rule 5: Audit Trail
- ✅ Log every data transformation:
  - Input file hash (MD5)
  - Output file hash
  - Script version
  - Parameters used
  - Timestamp

---

## 🎬 NEXT IMMEDIATE ACTIONS

### Task 1: Parse Phase 2.5 Models ✅ READY
**File:** `scripts/nba/parse-phase2-models.mjs`
**Goal:** Understand coefficient structure and build inference

### Task 2: Collect Historical Odds ⚠️ BLOCKER
**Options:**
1. TheOddsAPI `/historical` endpoint (past 120 days)
2. Manual scraping from OddsPortal
3. Purchase archive from third-party vendor
4. Use existing backtest JSON as training proxy (RISKY)

### Task 3: Build Training Pipeline 📝 PLANNED
**File:** `scripts/nba/build-phase3-training-complete.mjs`
**Goal:** Generate `training_multi_season_phase3.jsonl` with 10,000+ rows

---

## 📈 SUCCESS CRITERIA

### Phase 2.5 Baseline (Week 1)
- [ ] Working stat predictions deployed
- [ ] Edge calculations functional
- [ ] Live picks generated daily
- [ ] Frontend displays predictions

### Phase 3 Full Restoration (Week 2-3)
- [ ] Training data collected (3+ seasons)
- [ ] 6-8 models trained and validated
- [ ] Backtest validation: ≥55% win rate
- [ ] Production deployment complete
- [ ] Monitoring and tracking active

### Long-Term Stability (Ongoing)
- [ ] All artifacts in git (no data loss possible)
- [ ] Daily automated retraining pipeline
- [ ] Performance tracking dashboard
- [ ] Alert system for model drift

---

## 📞 CONTACT & ESCALATION

**Primary:** GitHub Copilot in VS Code  
**Status:** Active recovery in progress  
**Last Updated:** 2025-11-24

---

**END OF AUDIT REPORT**
