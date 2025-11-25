# Phase 3 Recovery - Quick Start Checklist

**Date:** November 24, 2025  
**Goal:** Get Phase 2.5 predictions deployed TODAY

---

## ✅ COMPLETED
- [x] Extracted artifacts from zip
- [x] Audited existing models (66 Phase 2.5 regression models found)
- [x] Created recovery directory structure
- [x] Documented full recovery plan

---

## 🎯 TODAY'S TASKS (Phase 1)

### Task 1: Build Phase 2.5 Inference Engine (2 hours)
**Status:** ⏳ READY TO START

**File to create:** `netlify/functions/_lib/phase2-inference.mjs`

**What it does:**
- Loads Phase 2.5 model JSON files
- Calculates predictions using correlation weights
- Returns predicted stat values

**Example model structure:**
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

**Formula:**
```
predicted = baseline + Σ(feature_value × weight)
```

**Steps:**
1. [ ] Create file `netlify/functions/_lib/phase2-inference.mjs`
2. [ ] Write model loader function
3. [ ] Write prediction function
4. [ ] Write unit tests
5. [ ] Test with sample data

**Command to test:**
```bash
node -e "
const { predictPoints } = require('./netlify/functions/_lib/phase2-inference.mjs');
const features = {season_ppg: 20, L10_fga: 15, L10_ppg: 22};
console.log(predictPoints(features));
"
```

---

### Task 2: Build Phase 2.5 Prediction Generator (3 hours)
**Status:** 📝 WAITING FOR TASK 1

**File to create:** `scripts/nba/generate-predictions-phase2.mjs`

**What it does:**
- Fetches today's games from TheOddsAPI
- Fetches player props (points, rebounds, assists)
- Calculates player features from boxscores
- Runs Phase 2.5 models
- Compares predictions to Vegas lines
- Filters for positive edge
- Outputs JSON

**Steps:**
1. [ ] Create file `scripts/nba/generate-predictions-phase2.mjs`
2. [ ] Load Phase 2.5 models
3. [ ] Fetch today's games
4. [ ] Calculate features for each player
5. [ ] Run predictions
6. [ ] Calculate edge
7. [ ] Filter picks (edge ≥ 2.0)
8. [ ] Write to `public/data/nba/phase2-predictions.json`

**Command to run:**
```bash
node scripts/nba/generate-predictions-phase2.mjs
```

**Expected output:**
```json
{
  "generated_at": "2025-11-24T14:30:00Z",
  "model_version": "phase2.5",
  "picks": [
    {
      "player": "Luka Doncic",
      "market": "points",
      "prediction": 32.5,
      "vegas_line": 29.5,
      "edge": 3.0,
      "confidence": 0.72,
      "recommendation": "OVER"
    }
  ]
}
```

---

### Task 3: Deploy to Production (1 hour)
**Status:** 📝 WAITING FOR TASK 2

**Changes needed:**

**1. Update Netlify Function:**
```javascript
// netlify/functions/nba-props-v2.mjs
import { execSync } from 'child_process';

export async function handler(event) {
  // Run Phase 2.5 generator
  execSync('node scripts/nba/generate-predictions-phase2.mjs');
  
  // Read output
  const picks = JSON.parse(
    fs.readFileSync('public/data/nba/phase2-predictions.json')
  );
  
  return {
    statusCode: 200,
    body: JSON.stringify(picks)
  };
}
```

**2. Update Frontend:**
```jsx
// src/components/NBAPlayerPropsV2.jsx
<div className="model-info">
  Phase 2.5 - Regression Model
  (Phase 3 Classification in Development)
</div>
```

**3. Test:**
```bash
# Local test
netlify dev

# Visit: http://localhost:8888/nba-player-props-v2

# Deploy
git add .
git commit -m "Deploy Phase 2.5 baseline predictions"
git push
```

---

## 🚦 GO/NO-GO CHECKLIST

Before deploying:
- [ ] Phase 2.5 inference tests passing
- [ ] Generator produces valid JSON
- [ ] Edge calculations verified
- [ ] Frontend displays picks correctly
- [ ] No console errors
- [ ] Manual spot-check of 5 picks

---

## 📞 HELP / ESCALATION

**If stuck on Task 1:**
- Check model file format: `cat data/nba/models/points_Window_3_-_Test_Apr_2025.json`
- Verify 66 models exist: `find data/nba/models -name "*.json" | wc -l`

**If stuck on Task 2:**
- Test TheOddsAPI: `curl "https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=YOUR_KEY"`
- Check boxscores exist: `ls data/nba/player-boxscores-2025-26.json`

**If stuck on Task 3:**
- Test Netlify function locally: `netlify dev`
- Check logs: `netlify functions:log nba-props-v2`

---

## 🎯 END-OF-DAY GOAL

**Success Criteria:**
✅ Phase 2.5 predictions deployed to production  
✅ Live at: https://bgroundrobin.com/nba-player-props-v2  
✅ Daily automation configured  
✅ At least 5 picks displayed

**Next Steps:**
- Begin Phase 2 (data collection) tomorrow
- Document any issues encountered
- Update recovery plan with actual time taken

---

**Let's build this! 🚀**
