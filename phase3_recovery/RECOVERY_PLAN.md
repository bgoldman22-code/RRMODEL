# NBA Phase 3 PRA Model - Recovery Implementation Plan

**Date:** November 24, 2025  
**Status:** 🟢 READY TO EXECUTE  
**Estimated Timeline:** 2-3 weeks to full restoration

---

## 🎯 MISSION STATEMENT

Restore the NBA PRA (Points + Rebounds + Assists) Phase 3 classification model to production, achieving:
- ≥55% win rate (target: 60.8%)
- ≥10% ROI (target: 17.08%)
- 100% reproducible pipeline
- Zero risk of data loss

---

## 📋 IMPLEMENTATION PHASES

### ✅ PHASE 0: AUDIT COMPLETE
- [x] Extracted artifacts from zip
- [x] Discovered 66 Phase 2.5 regression models
- [x] Documented missing artifacts
- [x] Created recovery directory structure

**Key Finding:** Phase 2.5 models use **correlation-weighted regression**:
```json
{
  "type": "points",
  "baseline": 15.09,
  "weights": {
    "season_ppg": 0.636,
    "L10_fga": 0.636,
    "L10_ppg": 0.633,
    ...
  },
  "featureNames": ["season_ppg", "L10_fga", ...],
  "trainingSize": 1978
}
```

**Inference Formula:**
```
predicted_points = baseline + Σ(feature_value × weight × correlation)
```

---

### 🔷 PHASE 1: BASELINE DEPLOYMENT (Days 1-2)

**Goal:** Deploy working predictions using Phase 2.5 regression models

#### Task 1.1: Build Phase 2.5 Inference Engine
**File:** `netlify/functions/_lib/phase2-inference.mjs`

```javascript
export function predictStat(player, model, features) {
  let prediction = model.baseline;
  
  for (const [feature, value] of Object.entries(features)) {
    if (model.weights[feature]) {
      prediction += value * model.weights[feature];
    }
  }
  
  return prediction;
}
```

**Deliverables:**
- [ ] Parse all 66 model JSON files
- [ ] Build feature extractor from boxscores
- [ ] Implement prediction function
- [ ] Unit tests for inference

**Timeline:** 4 hours

---

#### Task 1.2: Build Phase 2.5 Prediction Generator
**File:** `scripts/nba/generate-predictions-phase2.mjs`

**Logic:**
1. Load today's games from TheOddsAPI
2. Load Phase 2.5 models (points, rebounds, assists)
3. Calculate features for each player:
   - L5/L10/season averages
   - Minutes
   - Usage stats
4. Run models → get predicted stats
5. Compare to Vegas lines → calculate edge
6. Filter:
   - |Edge| ≥ 2.0 points
   - Confidence ≥ 65%
7. Output JSON to `public/data/nba/phase2-predictions.json`

**Deliverables:**
- [ ] Script generates predictions
- [ ] Edge calculations correct
- [ ] JSON output schema matches frontend
- [ ] Can run via `node scripts/nba/generate-predictions-phase2.mjs`

**Timeline:** 6 hours

---

#### Task 1.3: Deploy Phase 2.5 to Production
**Changes:**
1. Update Netlify function to use Phase 2.5 generator
2. Update frontend to display Phase 2.5 picks
3. Add disclaimer: "Phase 2.5 - Regression Model (Phase 3 in development)"
4. Test on staging
5. Deploy to production

**Deliverables:**
- [ ] Live predictions at `/nba-player-props-v2`
- [ ] Daily automation working
- [ ] Monitoring active

**Timeline:** 2 hours

**MILESTONE:** 🎉 Working prediction system deployed

---

### 🔷 PHASE 2: DATA COLLECTION (Days 3-7)

**Goal:** Build multi-season training dataset for Phase 3

#### Task 2.1: Collect Historical Boxscores
**Status:** ✅ MOSTLY COMPLETE

**Existing:**
- `player-boxscores-2025-26.json` (7,903 entries) ✅
- `player-boxscores-2024-25.json` (check if exists)

**Need to Collect:**
- 2023-24 season (full)
- 2022-23 season (full)

**Script:** `scripts/nba/backfill-boxscores-historical.mjs`

**Deliverables:**
- [ ] `data/nba/raw/boxscores_2022_23.json`
- [ ] `data/nba/raw/boxscores_2023_24.json`
- [ ] Combined dataset: ~25,000+ player-games

**Timeline:** 1 day (API rate limits)

---

#### Task 2.2: Collect Historical Odds ⚠️ CRITICAL PATH
**Status:** ❌ BLOCKER - NEED STRATEGY

**Options:**

**Option A: TheOddsAPI Historical Endpoint** (RECOMMENDED)
- Available: Past 120 days
- Cost: $25-50/month for historical access
- Quality: High (official books)
- Timeline: 2 days

**Option B: Web Scraping OddsPortal**
- Available: 3+ years
- Cost: Free (but labor intensive)
- Quality: Medium (potential gaps)
- Timeline: 5-7 days

**Option C: Use Backtest JSON as Proxy** (RISKY)
- File: `data/nba/backtest-comprehensive-results-FIXED.json` (4.2MB)
- Contains: Historical prop lines + results
- Issue: Uses Gaussian model, not actual odds snapshots
- Timeline: Immediate

**Decision Required:** Which approach?

**Deliverables:**
- [ ] `data/nba/historical_odds/nba_props_2022_23.jsonl`
- [ ] `data/nba/historical_odds/nba_props_2023_24.jsonl`
- [ ] `data/nba/historical_odds/nba_props_2024_25.jsonl`
- [ ] Format: `{date, player, market, line, odds, book, gameId}`

**Timeline:** 2-7 days (depending on method)

---

#### Task 2.3: Build Phase 3 Training Dataset
**File:** `scripts/nba/build-phase3-training-complete.mjs`

**Process:**
1. Load all historical boxscores (3 seasons)
2. Load all historical odds
3. For each player-prop-date combo:
   - Calculate features (L5/L10/L999 stats)
   - Calculate opponent defense stats
   - Get Vegas line
   - Get actual result
   - Label as HIT (1) or MISS (0)
4. Write to `data/nba/training/phase3_training_v1.jsonl`

**Schema:**
```jsonl
{
  "id": "20231115_anfernee-simons_PRA_OVER_25.5",
  "date": "2023-11-15",
  "player": "Anfernee Simons",
  "player_id": "4277812",
  "team": "POR",
  "opponent": "LAL",
  "market": "PRA",
  "line": 25.5,
  "side": "OVER",
  "odds": -110,
  "book": "FanDuel",
  
  // Features
  "L5_pra": 26.8,
  "L10_pra": 24.3,
  "L999_pra": 22.1,
  "L5_minutes": 34.2,
  "L10_minutes": 33.8,
  "L999_minutes": 32.5,
  "rest_days": 1,
  "home": 1,
  "games_played": 45,
  "opp_def_L5_pra_allowed": 28.5,
  "opp_def_L10_pra_allowed": 27.9,
  "opp_pace": 102.3,
  
  // Target
  "actual_pra": 28,
  "result": 1  // Hit
}
```

**Deliverables:**
- [ ] Training file with 8,000-15,000 rows
- [ ] Separate files by market (PRA, Points, Rebounds, Assists)
- [ ] Train/validation/test split (70/15/15)
- [ ] Data quality report

**Timeline:** 2 days (after odds collected)

**MILESTONE:** 🎉 Training data ready

---

### 🔷 PHASE 3: MODEL TRAINING (Days 8-10)

**Goal:** Train Phase 3 classification models

#### Task 3.1: Set Up Python Training Environment
**File:** `scripts/nba/train-phase3-models.py`

**Dependencies:**
```bash
pip install pandas scikit-learn numpy joblib
```

**Deliverables:**
- [ ] Python environment configured
- [ ] Training script template ready

**Timeline:** 1 hour

---

#### Task 3.2: Train PRA Classification Models
**Models to Train:**
1. `pra_over` - PRA total OVER (target: 60.8% accuracy)
2. `pra_under` - PRA total UNDER

**Training Code:**
```python
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import joblib
import json

# Load data
df = pd.read_json('data/nba/training/phase3_training_pra.jsonl', lines=True)

# Filter to OVER bets
train = df[df['side'] == 'OVER']

# Features
features = [
    'L5_pra', 'L10_pra', 'L999_pra',
    'L5_minutes', 'L10_minutes', 'L999_minutes',
    'rest_days', 'home', 'games_played',
    'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
    'opp_pace', 'line'
]

X = train[features]
y = train['result']

# Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Scale
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Train
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
print(f"Train Accuracy: {train_acc:.3f}")
print(f"Test Accuracy: {test_acc:.3f}")

# Save pickle models
joblib.dump(scaler, 'data/nba/models/phase3/pra_over_scaler.pkl')
joblib.dump(model, 'data/nba/models/phase3/pra_over_model.pkl')

# Export to JSON for Node.js
coeffs = {
    'type': 'logistic_classifier',
    'market': 'PRA',
    'side': 'OVER',
    'intercept': float(model.intercept_[0]),
    'coefficients': {feat: float(coef) for feat, coef in zip(features, model.coef_[0])},
    'feature_means': scaler.mean_.tolist(),
    'feature_stds': scaler.scale_.tolist(),
    'features': features,
    'train_accuracy': float(train_acc),
    'test_accuracy': float(test_acc),
    'train_size': len(X_train),
    'test_size': len(X_test),
    'trained_at': pd.Timestamp.now().isoformat()
}

with open('data/nba/models/phase3/pra_over_coefficients.json', 'w') as f:
    json.dump(coeffs, f, indent=2)

print("✅ Model saved")
```

**Deliverables:**
- [ ] `pra_over_coefficients.json` (test acc ≥ 55%)
- [ ] `pra_under_coefficients.json` (test acc ≥ 55%)
- [ ] Training logs
- [ ] Feature importance analysis

**Timeline:** 4 hours

---

#### Task 3.3: Train Individual Stat Models (Optional)
**Additional Models:**
- Points Over/Under
- Rebounds Over/Under
- Assists Over/Under

**Timeline:** 6 hours (if needed)

**MILESTONE:** 🎉 Phase 3 models trained

---

### 🔷 PHASE 4: INFERENCE LAYER (Days 11-12)

**Goal:** Implement Phase 3 in Node.js

#### Task 4.1: Build JavaScript Inference Engine
**File:** `netlify/functions/_lib/phase3-inference.mjs`

```javascript
import { readFileSync } from 'fs';
import path from 'path';

// Load model coefficients
const PRA_OVER = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data/nba/models/phase3/pra_over_coefficients.json'))
);

const PRA_UNDER = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data/nba/models/phase3/pra_under_coefficients.json'))
);

/**
 * Standardize features using saved scaler params
 */
function standardizeFeatures(features, model) {
  const standardized = {};
  
  for (let i = 0; i < model.features.length; i++) {
    const feat = model.features[i];
    const value = features[feat];
    const mean = model.feature_means[i];
    const std = model.feature_stds[i];
    
    standardized[feat] = (value - mean) / std;
  }
  
  return standardized;
}

/**
 * Calculate logistic regression probability
 * P(y=1) = 1 / (1 + exp(-(w·x + b)))
 */
function sigmoid(logit) {
  return 1 / (1 + Math.exp(-logit));
}

/**
 * Predict probability of PRA OVER hitting
 */
export function predictPRA_Over(features) {
  const standardized = standardizeFeatures(features, PRA_OVER);
  
  // Calculate logit: w·x + b
  let logit = PRA_OVER.intercept;
  
  for (const feat of PRA_OVER.features) {
    logit += standardized[feat] * PRA_OVER.coefficients[feat];
  }
  
  // Return probability
  return sigmoid(logit);
}

/**
 * Predict probability of PRA UNDER hitting
 */
export function predictPRA_Under(features) {
  const standardized = standardizeFeatures(features, PRA_UNDER);
  
  let logit = PRA_UNDER.intercept;
  
  for (const feat of PRA_UNDER.features) {
    logit += standardized[feat] * PRA_UNDER.coefficients[feat];
  }
  
  return sigmoid(logit);
}

/**
 * Get best bet (OVER or UNDER)
 */
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

**Deliverables:**
- [ ] Inference engine with unit tests
- [ ] Validation against Python model outputs
- [ ] Performance benchmarks

**Timeline:** 6 hours

---

#### Task 4.2: Build Phase 3 Prediction Generator
**File:** `scripts/nba/generate-pra-predictions-phase3.mjs`

**Process:**
1. Fetch today's games (TheOddsAPI)
2. Fetch PRA props odds
3. Load player boxscores
4. For each player-prop:
   - Calculate features
   - Run Phase 3 models
   - Get probabilities
   - Calculate edge vs implied odds
   - Filter by thresholds
5. Output JSON

**Deliverables:**
- [ ] Script generates Phase 3 picks
- [ ] Edge calculations match Python
- [ ] JSON schema correct

**Timeline:** 8 hours

**MILESTONE:** 🎉 Phase 3 inference ready

---

### 🔷 PHASE 5: PRODUCTION DEPLOYMENT (Days 13-14)

**Goal:** Deploy Phase 3 to live site

#### Task 5.1: Update Netlify Function
**File:** `netlify/functions/nba-props-v2.mjs`

**Changes:**
- Switch from Phase 2.5 to Phase 3 generator
- Update response format
- Add model metadata to response

**Timeline:** 2 hours

---

#### Task 5.2: Update Frontend
**File:** `src/components/NBAPlayerPropsV2.jsx`

**Changes:**
- Display "Phase 3 Classification Model"
- Show model probability
- Add confidence indicators
- Update historical stats

**Timeline:** 3 hours

---

#### Task 5.3: Validation & Testing
**Tests:**
- [ ] End-to-end prediction flow
- [ ] Compare Phase 3 vs Phase 2.5 picks
- [ ] Backtest on recent games
- [ ] Load testing (500 concurrent requests)

**Timeline:** 4 hours

---

#### Task 5.4: Deploy to Production
**Steps:**
1. Test on staging branch
2. Run manual verification
3. Merge to main
4. Monitor for 24 hours
5. Announce Phase 3 launch

**Timeline:** 2 hours

**MILESTONE:** 🎉 Phase 3 LIVE IN PRODUCTION

---

### 🔷 PHASE 6: MONITORING & ITERATION (Days 15+)

**Goal:** Track performance and improve

#### Task 6.1: Build Tracking System
**Components:**
- Daily performance logger
- Win rate tracker
- ROI calculator
- Model drift detector

**Timeline:** 1 week

---

#### Task 6.2: Backtesting Framework
**Goal:** Validate historical performance

**File:** `scripts/nba/backtest-phase3.mjs`

**Process:**
1. Load Phase 3 models
2. Load historical data (past 30 days)
3. Generate predictions (with time-travel)
4. Compare to actual results
5. Calculate metrics

**Timeline:** 1 week

---

## 📊 SUCCESS METRICS

### Phase 1 Success Criteria:
- ✅ Phase 2.5 predictions deployed
- ✅ Daily automation working
- ✅ Frontend displays picks

### Phase 3 Success Criteria:
- ✅ Test accuracy ≥ 55% (target: 60.8%)
- ✅ Backtest ROI ≥ 10% (target: 17.08%)
- ✅ Live performance tracking active
- ✅ No data loss incidents

---

## 🚨 RISK MITIGATION

### Risk 1: Historical Odds Unavailable
**Mitigation:** Use backtest JSON as training proxy, validate on recent data

### Risk 2: Model Underperforms
**Mitigation:** Keep Phase 2.5 running in parallel, A/B test

### Risk 3: Data Quality Issues
**Mitigation:** Extensive validation, outlier detection, manual review

---

## 📞 NEXT ACTIONS

**Immediate (Today):**
1. Create Phase 2.5 inference engine
2. Test on sample data
3. Deploy baseline predictions

**Short-term (This Week):**
1. Decide on historical odds strategy
2. Begin data collection
3. Build training dataset

**Medium-term (Next 2 Weeks):**
1. Train Phase 3 models
2. Build inference layer
3. Deploy to production

---

**Status:** 🟢 READY TO BEGIN  
**Last Updated:** 2025-11-24  
**Next Review:** After Phase 1 completion
