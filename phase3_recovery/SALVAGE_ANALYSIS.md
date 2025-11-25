# NBA Phase 3 PRA - Component Salvage Analysis

**Date:** November 24, 2025  
**Status:** Strategic Analysis Complete  
**Next Step:** Ready for code generation on approval

---

## 🎯 SECTION A — SALVAGE MAP (Green / Yellow / Red)

### 🟢 GREEN — Fully Usable Now (Production Ready)

#### 1. Phase 2.5 Regression Models ✅
**Location:** `data/nba/models/temp/*.json` + `data/nba/models/*Window*.json`  
**Count:** 66 model files  
**Status:** REAL TRAINED MODELS - Ready to deploy today

**What we have:**
- Points prediction models (3 windows: Feb/Mar/Apr 2025)
- Rebounds prediction models (3 windows)
- Assists prediction models (3 windows)
- Model structure:
  ```json
  {
    "type": "points",
    "baseline": 15.09,
    "weights": {
      "season_ppg": 0.636,
      "L10_fga": 0.636,
      "L10_ppg": 0.633
    },
    "featureNames": ["season_ppg", "L10_fga", "L10_ppg"],
    "trainingSize": 1978
  }
  ```

**Inference formula:** `predicted = baseline + Σ(feature_value × weight)`

**Can deploy immediately:** YES  
**Action required:** Build inference wrapper + prediction generator  
**Timeline:** 12 hours to production

---

#### 2. Current Season Boxscore Data ✅
**Location:** `data/nba/player-boxscores-2025-26.json`  
**Size:** 7,903 player-games (current season)  
**Quality:** Complete, daily updates working  
**Status:** Ready to use for features

**Can use immediately:** YES  
**Action required:** None  
**Timeline:** N/A

---

#### 3. Production Infrastructure ✅
**Components:**
- Frontend route: `/nba-player-props-v2` (configured)
- Netlify function: `netlify/functions/nba-props-v2.mjs` (exists, needs update)
- GitHub Actions: `.github/workflows/nba-props-v2-daily.yml` (configured)
- Daily boxscore fetcher: `scripts/nba/fetch-player-boxscores-2025-26.mjs` (working)

**Can use immediately:** YES  
**Action required:** Update function to call new generator  
**Timeline:** 2 hours

---

#### 4. Opponent Defense Stats ✅
**Location:** `data/nba/opponent-defense-stats.json`  
**Status:** Updated daily via existing scripts  
**Quality:** Production-ready

**Can use immediately:** YES  
**Action required:** None  
**Timeline:** N/A

---

### 🟡 YELLOW — Rebuildable from Existing Code

#### 5. Training Data Builder 🔄
**Location:** `scripts/nba/build-pra-training-phase3.mjs` (18KB)  
**Status:** FUNCTIONAL SKELETON EXISTS

**What we have:**
- Complete script structure
- Feature calculation logic
- Rolling average implementations
- Opponent defense calculations
- Output format specified

**What's missing:**
- Historical odds data to feed into it
- Some edge case handling
- Validation logic

**Can rebuild:** YES  
**Effort:** LOW (script mostly done, just needs data)  
**Blocker:** Historical odds collection  
**Timeline:** 2-3 days (after odds collected)

---

#### 6. Backtest Data File 🔄
**Location:** `data/nba/backtest-comprehensive-results-FIXED.json` (4.2MB)  
**Status:** EXISTS but uses WRONG MODEL TYPE

**What we have:**
- Historical prop lines
- Actual results
- Player names, dates, markets
- 10,000+ data points

**Issues:**
- Uses Gaussian model (mu/sigma), not LogisticRegression
- May not be actual odds snapshots (could be model outputs)
- No feature columns (just results)

**Can use as training proxy:** RISKY BUT POSSIBLE  
**Quality:** Medium (better than nothing)  
**Recommendation:** Use for initial Phase 3, replace with real odds later  
**Timeline:** Immediate (for quick Phase 3 v1)

---

#### 7. Prediction Generator (Placeholder) 🔄
**Location:** `scripts/nba/generate-pra-predictions-v2.mjs` (10KB)  
**Status:** STRUCTURE EXISTS, LOGIC IS PLACEHOLDER

**What we have:**
- Complete scaffolding
- Feature extraction framework
- API integration skeleton
- Output format correct

**What's broken:**
- Lines 202-206: Hardcoded dummy prediction logic
- No model loading
- No real inference

**Can rebuild:** YES  
**Effort:** MEDIUM (need to implement real inference)  
**Timeline:** 6-8 hours

---

### 🔴 RED — Missing and Must Be Rebuilt from Scratch

#### 8. Phase 3 Trained Models ❌
**Expected location:** `data/nba/models/phase3_pra_coefficients.json`  
**Status:** DOES NOT EXIST

**What's missing:**
- Trained LogisticRegression coefficients
- Feature scaler parameters (StandardScaler means/stds)
- Model metadata (accuracy, training size, etc.)
- Intercept values

**Must create from scratch:** YES  
**Blocker:** Need training data first  
**Dependencies:** Historical odds + boxscores + training script  
**Timeline:** 1 week (full pipeline)

---

#### 9. Phase 3 Training Data ❌
**Expected location:** `data/nba/features/pra/training_multi_season_phase3.jsonl`  
**Status:** DIRECTORY DOESN'T EXIST

**What's missing:**
- Multi-season training dataset (3 years)
- Feature columns (L5/L10/L999, opponent defense, etc.)
- Target labels (HIT/MISS binary)
- 10,000-15,000 training examples

**Must create from scratch:** YES  
**Blocker:** Historical odds collection (critical path)  
**Dependencies:** Boxscores (✅ can collect) + Odds (❌ must collect)  
**Timeline:** 1 week after odds strategy decided

---

#### 10. Historical Odds Archive ❌
**Expected location:** `data/nba/historical_odds/*.jsonl`  
**Status:** DOES NOT EXIST

**What's missing:**
- 3 seasons of prop betting lines
- Books: FanDuel, DraftKings, etc.
- Markets: PRA, Points, Rebounds, Assists
- 50,000+ historical odds snapshots

**Must create from scratch:** YES  
**Critical decision required:** Collection strategy (TheOddsAPI vs scraping vs backtest proxy)  
**Timeline:** 2-7 days depending on method

---

#### 11. Python Training Scripts ❌
**Expected location:** `scripts/nba/train-phase3-models.py`  
**Status:** DOES NOT EXIST

**What's missing:**
- sklearn LogisticRegression training code
- Feature scaling implementation
- Train/test splitting
- Model serialization (pickle + JSON export)
- Hyperparameter tuning

**Must create from scratch:** YES  
**Effort:** LOW (standard ML pipeline)  
**Timeline:** 4-6 hours

---

#### 12. Node.js Inference Engine ❌
**Expected location:** `netlify/functions/_lib/phase3-inference.mjs`  
**Status:** DOES NOT EXIST

**What's missing:**
- JavaScript implementation of logistic regression
- Feature standardization logic
- Sigmoid function
- Model coefficient loading
- Probability calculations

**Must create from scratch:** YES  
**Effort:** MEDIUM (need to replicate sklearn behavior exactly)  
**Timeline:** 6-8 hours

---

## 📊 SALVAGE SUMMARY

### Statistics:
- **GREEN (Usable now):** 4 components (33%)
- **YELLOW (Rebuildable):** 4 components (33%)
- **RED (Must rebuild):** 5 components (42%)

### Critical Path Analysis:
1. ✅ Phase 2.5 baseline can deploy TODAY (green components)
2. ⚠️ Phase 3 training BLOCKED by historical odds collection (red #10)
3. 🔄 Training data builder ready once odds collected (yellow #5)
4. ❌ Must create training scripts + inference layer (red #11, #12)

### Fastest Path to Phase 3:
```
Option A (Conservative - 2-3 weeks):
└─ Collect real historical odds (TheOddsAPI)
   └─ Build training data
      └─ Train Phase 3 models
         └─ Deploy

Option B (Aggressive - 1 week):
└─ Use backtest JSON as training proxy (risky)
   └─ Build training data from backtest
      └─ Train Phase 3 v1
         └─ Deploy + validate
            └─ Replace with real odds later
```

---

## 🎯 SECTION B — FULL RECONSTRUCTION PLAN V1

### Phase 1: Baseline Deployment (TODAY - 12 hours)

#### Task 1A: Build Phase 2.5 Inference Engine
**File to create:** `netlify/functions/_lib/phase2-inference.mjs`

**Implementation:**
```javascript
import { readFileSync } from 'fs';
import { join } from 'path';

// Load all Phase 2.5 models on startup
const MODELS = {
  points: JSON.parse(readFileSync(join(process.cwd(), 'data/nba/models/points_Window_3_-_Test_Apr_2025.json'))),
  rebounds: JSON.parse(readFileSync(join(process.cwd(), 'data/nba/models/rebounds_Window_3_-_Test_Apr_2025.json'))),
  assists: JSON.parse(readFileSync(join(process.cwd(), 'data/nba/models/assists_Window_3_-_Test_Apr_2025.json')))
};

/**
 * Predict stat value using Phase 2.5 correlation-weighted regression
 */
export function predict(stat, features) {
  const model = MODELS[stat];
  if (!model) throw new Error(`Unknown stat: ${stat}`);
  
  let prediction = model.baseline;
  
  for (const feature of model.featureNames) {
    if (features[feature] !== undefined) {
      prediction += features[feature] * model.weights[feature];
    }
  }
  
  return prediction;
}

/**
 * Calculate confidence based on feature completeness
 */
export function calculateConfidence(features, model) {
  const availableFeatures = model.featureNames.filter(f => features[f] !== undefined);
  return availableFeatures.length / model.featureNames.length;
}
```

**Testing:**
```javascript
// Test with sample data
const features = {
  season_ppg: 20.5,
  L10_fga: 15.2,
  L10_ppg: 22.1,
  L5_fga: 16.0,
  L5_ppg: 23.5
};

const predicted = predict('points', features);
console.log(`Predicted points: ${predicted.toFixed(1)}`);
```

**Timeline:** 2 hours  
**Deliverable:** Working inference function with unit tests

---

#### Task 1B: Build Phase 2.5 Prediction Generator
**File to create:** `scripts/nba/generate-predictions-phase2.mjs`

**Process:**
1. Load today's games from TheOddsAPI
2. Load Phase 2.5 models
3. Load current season boxscores
4. For each player in today's games:
   - Calculate L5/L10/season averages
   - Run Phase 2.5 models (points, rebounds, assists)
   - Fetch Vegas lines
   - Calculate edge: `predicted - vegas_line`
   - Calculate confidence
5. Filter picks:
   - `|edge| ≥ 2.0` points
   - `confidence ≥ 0.65`
6. Write to `public/data/nba/phase2-predictions.json`

**Output schema:**
```json
{
  "generated_at": "2025-11-24T14:30:00Z",
  "model_version": "phase2.5-regression",
  "model_window": "Window_3_Apr_2025",
  "picks": [
    {
      "player": "Luka Doncic",
      "team": "DAL",
      "opponent": "LAL",
      "game_time": "2025-11-24T19:00:00Z",
      "market": "points",
      "prediction": 32.5,
      "vegas_line": 29.5,
      "edge": 3.0,
      "confidence": 0.72,
      "recommendation": "OVER",
      "odds": -110,
      "book": "FanDuel"
    }
  ],
  "stats": {
    "total_games": 8,
    "total_picks": 12,
    "avg_edge": 2.8,
    "avg_confidence": 0.68
  }
}
```

**Timeline:** 6 hours  
**Deliverable:** Working generator script

---

#### Task 1C: Deploy to Production
**Changes:**
1. Update `netlify/functions/nba-props-v2.mjs` to call Phase 2.5 generator
2. Add model disclaimer to frontend
3. Test locally with `netlify dev`
4. Deploy to production

**Timeline:** 2 hours  
**Deliverable:** Live predictions at `/nba-player-props-v2`

---

### Phase 2: Data Collection (Week 1)

#### Critical Decision: Historical Odds Strategy

**RECOMMENDATION: Option C → Option A**
Start with backtest JSON proxy (immediate), then replace with real odds

**Rationale:**
- Get Phase 3 v1 deployed in 1 week (fast iteration)
- Validate model architecture works
- Replace training data with real odds once collected
- De-risk the odds collection process

**Implementation:**

**Step 2A: Extract Training Data from Backtest JSON** (Immediate)
```javascript
// scripts/nba/extract-training-from-backtest.mjs
import { readFileSync, writeFileSync } from 'fs';

const backtest = JSON.parse(readFileSync('data/nba/backtest-comprehensive-results-FIXED.json'));

// Convert backtest entries to training format
const training = backtest.map(entry => ({
  id: `${entry.date}_${entry.player}_${entry.market}_${entry.side}_${entry.line}`,
  date: entry.date,
  player: entry.player,
  market: entry.market,
  line: entry.line,
  side: entry.side,
  odds: entry.odds || -110, // Default if missing
  // Will need to join with boxscores for features
  actual: entry.actual,
  result: entry.result
}));

writeFileSync('data/nba/training/phase3_training_from_backtest.jsonl', 
  training.map(JSON.stringify).join('\n'));
```

**Step 2B: Collect Real Historical Odds** (Parallel effort)
- Purchase TheOddsAPI historical access
- Collect 120 days (maximum available)
- Store in `data/nba/historical_odds/`
- Rebuild training data with real odds
- Retrain Phase 3 v2

**Timeline:** 
- Backtest extraction: 1 day
- Real odds collection: 3-5 days (parallel)

---

#### Task 2.1: Build Complete Training Dataset
**File to create:** `scripts/nba/build-phase3-training-complete.mjs`

**Process:**
1. Load backtest JSON (or historical odds when available)
2. Load 3 seasons of boxscores
3. For each player-prop-date:
   - Calculate L5/L10/L999 rolling averages (with date filtering)
   - Calculate opponent defense stats (with date filtering)
   - Get rest days, home/away
   - Get Vegas line
   - Get actual result
   - Label as HIT (1) or MISS (0)
4. Write to `data/nba/training/phase3_training_v1.jsonl`

**Anti-leakage rules:**
- Only use data **before** game date for features
- Rolling averages exclude current game
- Opponent defense uses only prior games

**Schema:**
```jsonl
{
  "id": "20231115_anfernee-simons_PRA_OVER_25.5",
  "date": "2023-11-15",
  "player": "Anfernee Simons",
  "team": "POR",
  "opponent": "LAL",
  "market": "PRA",
  "line": 25.5,
  "side": "OVER",
  "odds": -110,
  "L5_pra": 26.8,
  "L10_pra": 24.3,
  "L999_pra": 22.1,
  "L5_minutes": 34.2,
  "L10_minutes": 33.8,
  "rest_days": 1,
  "home": 1,
  "games_played": 45,
  "opp_def_L5_pra_allowed": 28.5,
  "opp_def_L10_pra_allowed": 27.9,
  "actual_pra": 28,
  "result": 1
}
```

**Timeline:** 2-3 days  
**Deliverable:** Training file with 8,000-15,000 rows

---

### Phase 3: Model Training (Week 2)

#### Task 3.1: Train Phase 3 Classification Models
**File to create:** `scripts/nba/train-phase3-models.py`

**Models to train:**
1. PRA OVER classifier
2. PRA UNDER classifier

**Training process:**
```python
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import joblib
import json

# Load training data
df = pd.read_json('data/nba/training/phase3_training_v1.jsonl', lines=True)

# Filter to PRA OVER
train_data = df[(df['market'] == 'PRA') & (df['side'] == 'OVER')]

# Features
features = [
    'L5_pra', 'L10_pra', 'L999_pra',
    'L5_minutes', 'L10_minutes',
    'rest_days', 'home', 'games_played',
    'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
    'line'
]

X = train_data[features]
y = train_data['result']

# Split with stratification
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Scale features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Train logistic regression
model = LogisticRegression(
    class_weight='balanced',
    C=1.0,
    random_state=42,
    max_iter=1000,
    solver='lbfgs'
)
model.fit(X_train_scaled, y_train)

# Evaluate
train_acc = model.score(X_train_scaled, y_train)
test_acc = model.score(X_test_scaled, y_test)

print(f"✅ Train Accuracy: {train_acc:.3f}")
print(f"✅ Test Accuracy: {test_acc:.3f}")

# Save models
joblib.dump(scaler, 'data/nba/models/phase3/pra_over_scaler.pkl')
joblib.dump(model, 'data/nba/models/phase3/pra_over_model.pkl')

# Export for Node.js
coeffs = {
    'type': 'logistic_classifier',
    'market': 'PRA',
    'side': 'OVER',
    'intercept': float(model.intercept_[0]),
    'coefficients': {f: float(c) for f, c in zip(features, model.coef_[0])},
    'feature_means': scaler.mean_.tolist(),
    'feature_stds': scaler.scale_.tolist(),
    'features': features,
    'train_accuracy': float(train_acc),
    'test_accuracy': float(test_acc),
    'train_size': len(X_train),
    'trained_at': pd.Timestamp.now().isoformat()
}

with open('data/nba/models/phase3/pra_over_coefficients.json', 'w') as f:
    json.dump(coeffs, f, indent=2)

print("✅ Model exported to JSON")
```

**Success criteria:**
- Test accuracy ≥ 55% (target: 60.8%)
- No data leakage detected
- Feature importance makes sense

**Timeline:** 4-6 hours  
**Deliverable:** Trained models (pickle + JSON)

---

#### Task 3.2: Build Node.js Inference Layer
**File to create:** `netlify/functions/_lib/phase3-inference.mjs`

**Implementation:**
```javascript
import { readFileSync } from 'fs';
import { join } from 'path';

// Load coefficients
const PRA_OVER = JSON.parse(
  readFileSync(join(process.cwd(), 'data/nba/models/phase3/pra_over_coefficients.json'))
);
const PRA_UNDER = JSON.parse(
  readFileSync(join(process.cwd(), 'data/nba/models/phase3/pra_under_coefficients.json'))
);

function standardize(features, model) {
  const std = {};
  for (let i = 0; i < model.features.length; i++) {
    const feat = model.features[i];
    const value = features[feat];
    const mean = model.feature_means[i];
    const scale = model.feature_stds[i];
    std[feat] = (value - mean) / scale;
  }
  return std;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

export function predictPRA_Over(features) {
  const std = standardize(features, PRA_OVER);
  let logit = PRA_OVER.intercept;
  for (const feat of PRA_OVER.features) {
    logit += std[feat] * PRA_OVER.coefficients[feat];
  }
  return sigmoid(logit);
}

export function predictPRA_Under(features) {
  const std = standardize(features, PRA_UNDER);
  let logit = PRA_UNDER.intercept;
  for (const feat of PRA_UNDER.features) {
    logit += std[feat] * PRA_UNDER.coefficients[feat];
  }
  return sigmoid(logit);
}

export function predictBest(features) {
  const overProb = predictPRA_Over(features);
  const underProb = predictPRA_Under(features);
  return {
    over_probability: overProb,
    under_probability: underProb,
    recommended_side: overProb > underProb ? 'OVER' : 'UNDER',
    confidence: Math.max(overProb, underProb)
  };
}
```

**Timeline:** 6 hours  
**Deliverable:** Working inference with tests

---

### Phase 4: Production Deployment (Week 2-3)

#### Task 4.1: Build Phase 3 Prediction Generator
**File to create:** `scripts/nba/generate-pra-predictions-phase3.mjs`

**Process:**
1. Fetch today's games
2. Fetch PRA odds
3. Calculate features for each player
4. Run Phase 3 models
5. Calculate edge vs implied probability
6. Filter by threshold (confidence ≥ 60%, edge ≥ 5%)
7. Output JSON

**Timeline:** 8 hours

---

#### Task 4.2: Deploy and Monitor
1. Update Netlify function
2. Update frontend
3. Deploy to production
4. Monitor for 24-48 hours
5. Compare Phase 2.5 vs Phase 3 performance

**Timeline:** 1-2 days

---

## 🎯 SECTION C — FILE MANIFEST

### Must Create (Priority Order):

#### Immediate (Phase 1 - Today):
1. ✅ `netlify/functions/_lib/phase2-inference.mjs` - Phase 2.5 inference
2. ✅ `scripts/nba/generate-predictions-phase2.mjs` - Phase 2.5 generator
3. ✅ Update `netlify/functions/nba-props-v2.mjs` - Use Phase 2.5

#### Week 1 (Phase 2 - Data Collection):
4. ✅ `scripts/nba/extract-training-from-backtest.mjs` - Convert backtest to training
5. ✅ `scripts/nba/build-phase3-training-complete.mjs` - Build full training dataset
6. ✅ `data/nba/training/phase3_training_v1.jsonl` - Training data output

#### Week 2 (Phase 3 - Model Training):
7. ✅ `scripts/nba/train-phase3-models.py` - Train logistic regression
8. ✅ `data/nba/models/phase3/pra_over_coefficients.json` - Model coefficients
9. ✅ `data/nba/models/phase3/pra_under_coefficients.json` - Model coefficients
10. ✅ `netlify/functions/_lib/phase3-inference.mjs` - Phase 3 inference

#### Week 2-3 (Phase 3 - Deployment):
11. ✅ `scripts/nba/generate-pra-predictions-phase3.mjs` - Phase 3 generator
12. ✅ Update frontend to show Phase 3 picks

### Already Exist (No Action):
- ✅ `data/nba/player-boxscores-2025-26.json`
- ✅ `data/nba/opponent-defense-stats.json`
- ✅ `data/nba/models/temp/*.json` (66 Phase 2.5 models)
- ✅ `.github/workflows/nba-props-v2-daily.yml`
- ✅ `scripts/nba/fetch-player-boxscores-2025-26.mjs`

### Optional (Nice to Have):
- ⚪ `scripts/nba/backtest-phase3.mjs` - Validation framework
- ⚪ `scripts/nba/monitor-phase3-performance.mjs` - Tracking system
- ⚪ Individual stat models (points/rebounds/assists)

### Ignore (Not Relevant):
- ❌ Old Phase 2.5 documentation
- ❌ Placeholder prediction generator (will replace)
- ❌ Gaussian model backtest files (wrong model type)

---

## 🚦 READY TO PROCEED

**Status:** Strategic analysis complete  
**Recommendation:** Begin Phase 1 implementation immediately  
**First task:** Build Phase 2.5 inference engine  
**Estimated time to working system:** 12 hours

**Approval needed for:**
- [ ] Historical odds strategy (backtest proxy vs real collection)
- [ ] Phase 1 code generation
- [ ] Directory structure creation

**Say "proceed" to begin code generation.**
