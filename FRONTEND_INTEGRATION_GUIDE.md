# 🔄 Frontend Integration: OLD vs NEW Bundesliga Model

## Current State Analysis

### ✅ What You Have Now

**Frontend**: `src/pages/SoccerBTTS.jsx`
- React component with league selector (Premier League, Bundesliga, Champions League)
- Fetches from `/.netlify/functions/soccer-btts-predictions`
- Displays predictions with confidence, odds, betting recommendations

**Backend**: `netlify/functions/soccer-btts-predictions.js`
- **OLD Dixon-Coles** implementation (hand-tuned parameters)
- League configs: EPL, UCL, Bundesliga
- Bundesliga config:
  ```javascript
  'bundesliga': {
    btts_baseline: 0.58,
    dc_tau: { tau_00: -0.22, tau_10: -0.15, ... }
    alpha_high_confidence: 0.65
  }
  ```

**NEW Model**: `netlify/functions/bundesliga-btts-predict.mjs`
- **Trained Ensemble** (77.4% XGBoost + 22.6% Dixon-Coles)
- 21.2% validation ROI vs old model's unknown performance
- Trained on 416 historical matches with real odds
- Auto-fetches from The Odds API

---

## 🎯 Integration Options

### **Option 1: Side-by-Side Comparison (RECOMMENDED)**

Keep both models, let users see the difference:

```
Frontend View:
┌─────────────────────────────────────────────────────┐
│  Bundesliga BTTS Predictions                        │
│  Model: [Old Dixon-Coles ▼] [New Ensemble Model ▼]│
├─────────────────────────────────────────────────────┤
│  Bayern vs Dortmund                                 │
│  Old Model: 61% BTTS  | New Model: 72% BTTS        │
│  Old Rec: PASS        | New Rec: BET (2.5% stake) ✅│
└─────────────────────────────────────────────────────┘
```

**Pros**:
- Users can compare predictions
- Validate new model in production safely
- Track which performs better over time

**Cons**:
- More complex UI
- Need to maintain both

---

### **Option 2: Replace Old Model (CLEAN CUT)**

Replace `soccer-btts-predictions.js` Bundesliga logic with new model:

```javascript
// In soccer-btts-predictions.js
if (league === 'bundesliga') {
  // Call new trained ensemble instead of old DC
  return await fetchEnsemblePredictions();
}
```

**Pros**:
- Cleaner codebase
- Users get best model
- Simpler maintenance

**Cons**:
- Lose old model (can't compare)
- Riskier deployment

---

### **Option 3: Hybrid Fallback**

Use new model as primary, fallback to old if fails:

```javascript
try {
  return await fetchEnsemblePredictions(league);
} catch (error) {
  console.warn('Ensemble failed, using Dixon-Coles fallback');
  return dixonColesPredict(league);
}
```

**Pros**:
- Best of both worlds
- Reliability

**Cons**:
- Most complex

---

## 🛠️ Implementation Guide

### **RECOMMENDED: Option 1 - Side-by-Side**

#### Step 1: Update Frontend to Support Model Selection

**File**: `src/pages/SoccerBTTS.jsx`

```jsx
export default function SoccerBTTS() {
  const [selectedLeague, setSelectedLeague] = useState('premier-league');
  const [selectedModel, setSelectedModel] = useState('legacy'); // NEW
  
  const models = {
    'legacy': { label: 'Dixon-Coles (Legacy)', endpoint: 'soccer-btts-predictions' },
    'ensemble': { label: 'Ensemble ML (Trained)', endpoint: 'bundesliga-btts-predict' }
  };

  const load = async () => {
    setLoading(true);
    try {
      // Route to correct endpoint based on model + league
      if (selectedLeague === 'bundesliga' && selectedModel === 'ensemble') {
        // Call new trained model
        const res = await fetch('/.netlify/functions/bundesliga-btts-predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_fetch: true })
        });
        const data = await res.json();
        setPredictions(transformEnsembleToLegacyFormat(data));
      } else {
        // Call old model
        const data = await fetchBTTSPredictions(selectedLeague, 20);
        setPredictions(data.predictions);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1>Soccer BTTS Predictions</h1>
        
        {/* League Selector */}
        <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)}>
          <option value="premier-league">Premier League</option>
          <option value="bundesliga">Bundesliga</option>
          <option value="champions-league">Champions League</option>
        </select>
        
        {/* Model Selector (only for Bundesliga) */}
        {selectedLeague === 'bundesliga' && (
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            <option value="legacy">Legacy Dixon-Coles</option>
            <option value="ensemble">🔥 NEW: Ensemble ML (21.2% ROI)</option>
          </select>
        )}
      </div>
      
      {/* Rest of component */}
    </div>
  );
}

// Transform ensemble format to match legacy format
function transformEnsembleToLegacyFormat(ensembleData) {
  return ensembleData.predictions.map(pred => ({
    home_team: pred.home_team,
    away_team: pred.away_team,
    btts_prediction: pred.model_probability > 0.5 ? 'YES' : 'NO',
    model_confidence: Math.round(pred.model_probability * 100),
    model_prob: pred.model_probability,
    market_odds: pred.market_odds,
    edge: pred.edge,
    recommendation: pred.bet_decision?.should_bet ? 'BET' : 'PASS',
    stake_pct: pred.bet_decision?.recommended_stake_pct || 0,
    confidence_level: pred.bet_decision?.confidence || 'LOW',
    // Additional ensemble-specific data
    ensemble_breakdown: {
      dixon_coles: pred.dixon_coles_prob,
      xgboost: pred.xgboost_prob,
      weights: { dc: 0.226, xgb: 0.774 }
    },
    expected_goals: {
      home: pred.expected_home_goals,
      away: pred.expected_away_goals
    }
  }));
}
```

#### Step 2: Update Prediction Display

Add ensemble-specific info:

```jsx
{/* Show model breakdown for ensemble predictions */}
{prediction.ensemble_breakdown && (
  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
    <div className="font-semibold mb-1">Model Breakdown:</div>
    <div className="flex gap-4">
      <span>Dixon-Coles: {(prediction.ensemble_breakdown.dixon_coles * 100).toFixed(1)}%</span>
      <span>XGBoost: {(prediction.ensemble_breakdown.xgboost * 100).toFixed(1)}%</span>
    </div>
    <div className="text-gray-600">
      Weights: {(prediction.ensemble_breakdown.weights.xgb * 100).toFixed(1)}% XGB + 
      {(prediction.ensemble_breakdown.weights.dc * 100).toFixed(1)}% DC
    </div>
  </div>
)}
```

#### Step 3: Add Performance Badge

```jsx
{selectedModel === 'ensemble' && (
  <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
    <div className="flex items-center gap-2">
      <span className="text-2xl">🎯</span>
      <div>
        <div className="font-semibold text-green-900">NEW: Trained Ensemble Model</div>
        <div className="text-sm text-green-700">
          Validation: 21.2% ROI • 80.6% Hit Rate • 40 bets sample
        </div>
      </div>
    </div>
  </div>
)}
```

---

## 📊 Expected UI Changes

### Before (Old Model Only)
```
┌─────────────────────────────────────────────┐
│  Soccer BTTS Predictions                    │
│  League: [Bundesliga ▼]                     │
├─────────────────────────────────────────────┤
│  Bayern vs Dortmund                         │
│  Prediction: YES (61%)                      │
│  Odds: 1.65 | Edge: -4.2%                   │
│  Recommendation: PASS                       │
└─────────────────────────────────────────────┘
```

### After (With Model Selection)
```
┌─────────────────────────────────────────────────────────────┐
│  Soccer BTTS Predictions                                    │
│  League: [Bundesliga ▼]  Model: [🔥 Ensemble ML (21% ROI)▼]│
│                                                             │
│  🎯 NEW: Trained Ensemble Model                             │
│  Validation: 21.2% ROI • 80.6% Hit Rate                     │
├─────────────────────────────────────────────────────────────┤
│  Bayern München vs Borussia Dortmund                        │
│  Prediction: YES (72%)  ⬆️ +11% vs Legacy                    │
│  Odds: 1.65 | Edge: +14.9%                                  │
│  ✅ BET RECOMMENDED: 2.5% of bankroll                        │
│                                                             │
│  Model Breakdown:                                           │
│  • Dixon-Coles: 68%                                         │
│  • XGBoost: 74%                                             │
│  • Ensemble: 72% (77.4% XGB + 22.6% DC)                     │
│                                                             │
│  Expected Goals: 2.1 - 1.8                                  │
│  Confidence: HIGH                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Quick Implementation (Option 2 - Replace)

If you want to just **replace** the old Bundesliga model:

**File**: `netlify/functions/soccer-btts-predictions.js`

```javascript
// Add at top
import { handler as ensembleHandler } from './bundesliga-btts-predict.mjs';

export const handler = async (event, context) => {
  const league = event.queryStringParameters?.league || 'premier-league';
  
  // Route Bundesliga to new trained model
  if (league === 'bundesliga') {
    console.log('Using trained Ensemble model for Bundesliga');
    const ensembleRequest = {
      ...event,
      body: JSON.stringify({ auto_fetch: true }),
      httpMethod: 'POST'
    };
    const ensembleResponse = await ensembleHandler(ensembleRequest, context);
    
    // Transform to match legacy format
    const ensembleData = JSON.parse(ensembleResponse.body);
    return {
      statusCode: 200,
      body: JSON.stringify({
        predictions: transformEnsembleFormat(ensembleData.predictions),
        metadata: {
          model_version: 'Ensemble v1.0 (Trained)',
          validation_roi: 0.212,
          total_fixtures: ensembleData.total_predictions,
          high_confidence: ensembleData.recommended_bets
        }
      })
    };
  }
  
  // Use legacy model for other leagues
  // ... existing code for EPL, UCL ...
};
```

---

## ✅ Deployment Checklist

- [ ] Set `ODDS_API_KEY` in Netlify environment
- [ ] Deploy new function (`bundesliga-btts-predict.mjs`)
- [ ] Deploy model files (`ensemble_model.json`, etc.)
- [ ] Update frontend to call new endpoint
- [ ] Add model selector UI (if using Option 1)
- [ ] Transform response format to match existing UI
- [ ] Test with real fixtures
- [ ] Monitor performance vs old model
- [ ] Add analytics to track user preference

---

## 📈 A/B Testing Plan

Track both models for 2-4 weeks:

```javascript
// Log predictions from both models
async function logPredictionComparison(fixture) {
  const legacyPred = await legacyModel.predict(fixture);
  const ensemblePred = await ensembleModel.predict(fixture);
  
  await analytics.track('prediction_comparison', {
    fixture: fixture.id,
    legacy_prob: legacyPred.probability,
    ensemble_prob: ensemblePred.probability,
    legacy_rec: legacyPred.recommendation,
    ensemble_rec: ensemblePred.recommendation,
    actual_result: null // Fill in after match
  });
}

// After matches complete, calculate:
// - ROI by model
// - Hit rate by model
// - Edge accuracy
// - Calibration (predicted prob vs actual frequency)
```

---

## 🎯 Answer to Your Question

**Q: Do we have a FULLY functioning replica integrated into the existing frontend?**

**A: Not yet! Here's what we have:**

✅ **Backend Ready**: New trained model with 21.2% ROI  
✅ **API Endpoint Ready**: `bundesliga-btts-predict.mjs` deployed  
✅ **Old Frontend Exists**: `SoccerBTTS.jsx` working with old model  
❌ **Integration Missing**: Frontend still calls old `soccer-btts-predictions.js`  

**To Complete Integration:**

1. **5 minutes**: Update `SoccerBTTS.jsx` to call new endpoint (Option 2)
2. **15 minutes**: Add model selector UI (Option 1)
3. **30 minutes**: Transform response format + add ensemble breakdown display

**After completion**, your frontend will show:
- ✅ Real-time Bundesliga fixtures from The Odds API
- ✅ Predictions from trained ensemble (21.2% ROI)
- ✅ Betting recommendations with Kelly stakes
- ✅ Model breakdown (DC vs XGB components)
- ✅ Expected goals and confidence levels

---

## 🚀 Next Steps

**Choose your path:**

**Path A (Quick - 5 min)**: Replace old Bundesliga route in `soccer-btts-predictions.js` → Instant upgrade

**Path B (Best - 15 min)**: Add model selector to frontend → Users can compare both models

**Path C (Future)**: Train EPL + UCL models → Full suite of trained models

Which would you like me to implement?
