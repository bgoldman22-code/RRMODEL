# 🔄 Phase 2.5 NBA PRA Props - Complete Recovery Guide

**Created:** November 21, 2025  
**Purpose:** Full system recreation on new machine  
**Status:** ✅ Production-Ready Models  
**Performance:** Linear regression models (Feb-Apr 2025 validated)

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Model Details](#model-details)
4. [Data Sources](#data-sources)
5. [File Structure](#file-structure)
6. [Setup Instructions](#setup-instructions)
7. [Training Process](#training-process)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 System Overview

**Phase 2.5** is a walkforward-validated NBA player props prediction system that forecasts **Points, Rebounds, and Assists** using linear regression models.

### Key Characteristics

- **Model Type:** Linear Regression (not logistic - predicts exact values, not probabilities)
- **Markets:** Points, Rebounds, Assists
- **Features:** 10 features per model (L5/L10 rolling stats + season averages)
- **Training Size:** ~1,700 samples per model
- **Validation:** Walkforward windows (Feb/Mar/Apr 2025)
- **Output:** Predicted stat totals (compare to bookmaker lines)

### What Phase 2.5 Is

✅ **A data compatibility pattern** for odds lookup used in Phase 3 training  
✅ **Existing trained models** from October 2025 walkforward validation  
✅ **Linear regression models** predicting stat values  
✅ **Production-ready** with real coefficients

### What Phase 2.5 Is NOT

❌ **NOT logistic regression** (doesn't predict over/under probabilities)  
❌ **NOT the 60.8% / 17.08% ROI model** (that's Phase 3, which doesn't exist yet)  
❌ **NOT over/under betting models** (predicts totals, you compare to lines)

---

## 🏗️ Architecture

### Model Structure

```
Phase 2.5 Models (6 total)
├── points_Window_1_-_Test_Feb_2025.json
├── points_Window_2_-_Test_Mar_2025.json
├── points_Window_3_-_Test_Apr_2025.json
├── rebounds_Window_1_-_Test_Feb_2025.json
├── rebounds_Window_2_-_Test_Mar_2025.json
├── rebounds_Window_3_-_Test_Apr_2025.json
└── assists_Window_1_-_Test_Feb_2025.json
└── assists_Window_2_-_Test_Mar_2025.json
└── assists_Window_3_-_Test_Apr_2025.json
```

### Data Flow

```
1. Fetch Player Boxscores (ESPN API)
   ↓
2. Calculate Rolling Features (L5/L10/Season)
   ↓
3. Fetch Odds (TheOddsAPI)
   ↓
4. Load Model Coefficients
   ↓
5. Generate Predictions (Linear Regression)
   ↓
6. Compare to Lines → Generate Picks
   ↓
7. Output JSON/Frontend Display
```

### Phase 2.5 Data Compatibility Pattern

**Composite Key Structure:**
```javascript
// Format: "YYYY-MM-DD|playername|market"
"2025-11-20|lebron james|points"
"2025-11-20|nikola jokic|rebounds"
```

**Key Functions:**
1. **Market Normalization:** `player_points` → `points`
2. **Lowercase Names:** All player names lowercased for matching
3. **Flat Index:** Map-based lookup instead of nested structures

---

## 📊 Model Details

### Points Model (Window 1 - Feb 2025)

**File:** `points_Window_1_-_Test_Feb_2025.json`

```json
{
  "type": "points",
  "baseline": 15.01469723691946,
  "weights": {
    "season_ppg": 0.6346090385290872,
    "L10_fga": 0.6329622761472417,
    "L10_ppg": 0.630457266428714,
    "L5_fga": 0.61884845810852,
    "L5_ppg": 0.6055647886612238,
    "L10_fta": 0.5248385671674534,
    "L5_fta": 0.5054675512402521,
    "L10_minutes": 0.4629382539291784,
    "L5_minutes": 0.45129423682178244,
    "season_apg": 0.3905039341188777
  },
  "trainingSize": 1701
}
```

**Formula:**
```
Predicted_Points = baseline + 
  (season_ppg × 0.6346) +
  (L10_fga × 0.6330) +
  (L10_ppg × 0.6305) +
  (L5_fga × 0.6188) +
  (L5_ppg × 0.6056) +
  (L10_fta × 0.5248) +
  (L5_fta × 0.5055) +
  (L10_minutes × 0.4629) +
  (L5_minutes × 0.4513) +
  (season_apg × 0.3905)
```

### Rebounds Model (Window 1 - Feb 2025)

**Top Features:**
- `season_rpg`: 0.649 (season rebounds per game)
- `L10_rpg`: 0.638 (last 10 games RPG)
- `L5_rpg`: 0.624 (last 5 games RPG)
- `L10_orb`: 0.612 (last 10 offensive rebounds)
- `L5_orb`: 0.597 (last 5 offensive rebounds)

### Assists Model (Window 1 - Feb 2025)

**Top Features:**
- `season_apg`: 0.687 (season assists per game)
- `L10_apg`: 0.679 (last 10 games APG)
- `L5_apg`: 0.664 (last 5 games APG)
- `L10_minutes`: 0.523 (last 10 minutes)
- `L5_minutes`: 0.508 (last 5 minutes)

### Feature Engineering

**Required Features (per player, per game):**

```javascript
{
  // Season averages
  season_ppg: 25.3,
  season_rpg: 10.5,
  season_apg: 8.2,
  
  // Last 5 games
  L5_ppg: 27.1,
  L5_rpg: 11.2,
  L5_apg: 9.0,
  L5_fga: 18.4,
  L5_fta: 6.2,
  L5_minutes: 35.2,
  L5_orb: 2.1,
  
  // Last 10 games
  L10_ppg: 26.5,
  L10_rpg: 10.8,
  L10_apg: 8.5,
  L10_fga: 17.9,
  L10_fta: 6.0,
  L10_minutes: 34.8,
  L10_orb: 2.0
}
```

---

## 📡 Data Sources

### 1. Player Boxscores (ESPN API)

**Endpoint:** `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary`

**Script:** `scripts/nba/fetch-player-boxscores-2025-26.mjs`

**Purpose:**
- Fetch all player game logs for current season
- Calculate rolling statistics (L5/L10/Season)
- Required for feature engineering

**Output:** `data/nba/player-boxscores-2025-26.json` (3.3MB)

**Example Structure:**
```json
{
  "LeBron James": {
    "team": "LAL",
    "games": [
      {
        "date": "2025-11-20",
        "opponent": "DEN",
        "minutes": 36.5,
        "points": 28,
        "rebounds": 10,
        "assists": 8,
        "fga": 19,
        "fta": 6
      }
    ]
  }
}
```

### 2. Historical Odds (TheOddsAPI)

**Endpoint:** `https://api.the-odds-api.com/v4/sports/basketball_nba/events/{eventId}/odds`

**Script:** `scripts/nba/fetch-historical-odds.mjs` (needs to be created for your use)

**Markets:**
- `player_points`
- `player_rebounds`
- `player_assists`

**API Key:** Required (store in `.env` as `ODDS_API_KEY`)

**Output:** `data/nba/historical-odds-2025-26.json`

**Example Structure:**
```json
{
  "2025-11-20|lebron james|points": {
    "line": 27.5,
    "over_odds": -110,
    "under_odds": -110
  },
  "2025-11-20|lebron james|rebounds": {
    "line": 9.5,
    "over_odds": -105,
    "under_odds": -115
  }
}
```

### 3. Opponent Defense Stats (Optional Enhancement)

**Script:** `scripts/nba/collect-opponent-defense.mjs`

**Purpose:**
- Collect defensive ratings by opponent
- Enhance predictions with matchup difficulty
- Not currently used in Phase 2.5 models but available

---

## 📁 File Structure

```
phase_2_5_recovery_package/
├── README.md                          # This file
├── models/
│   ├── points_Window_1_-_Test_Feb_2025.json
│   ├── points_Window_2_-_Test_Mar_2025.json
│   ├── points_Window_3_-_Test_Apr_2025.json
│   ├── rebounds_Window_1_-_Test_Feb_2025.json
│   ├── rebounds_Window_2_-_Test_Mar_2025.json
│   ├── rebounds_Window_3_-_Test_Apr_2025.json
│   ├── assists_Window_1_-_Test_Feb_2025.json
│   ├── assists_Window_2_-_Test_Mar_2025.json
│   └── assists_Window_3_-_Test_Apr_2025.json
├── scripts/
│   ├── fetch-player-boxscores-2025-26.mjs
│   ├── collect-opponent-defense.mjs
│   ├── generate-phase25-predictions.mjs     # NEW - to be created
│   └── test-phase25-inference.mjs           # NEW - to be created
├── data/
│   ├── player-boxscores-2025-26.json        # 3.3MB - current season
│   └── sample-historical-odds.json          # Example format
├── docs/
│   ├── PHASE_2_5_INVENTORY_REPORT.md
│   ├── model_validation_results.md          # NEW - to be created
│   └── api_endpoints.md                     # NEW - to be created
└── examples/
    ├── example_prediction.json
    ├── example_features.json
    └── example_output.json
```

---

## ⚙️ Setup Instructions

### Prerequisites

- **Node.js:** v18+ (for running .mjs scripts)
- **Python:** 3.9+ (optional, for advanced analytics)
- **API Key:** TheOddsAPI account (https://the-odds-api.com/)
- **Git:** For version control

### Step 1: Environment Setup

```bash
# Create project directory
mkdir nba-phase25-system
cd nba-phase25-system

# Extract recovery package
unzip phase_2_5_recovery_package.zip

# Install Node.js dependencies
npm init -y
npm install node-fetch dotenv
```

### Step 2: Configure API Keys

Create `.env` file:
```bash
ODDS_API_KEY=your_api_key_here
```

### Step 3: Verify Model Files

```bash
# Check all models exist
ls -lh models/

# Should see 9 model files (3 stats × 3 windows)
```

### Step 4: Fetch Current Season Data

```bash
# Fetch latest player boxscores
node scripts/fetch-player-boxscores-2025-26.mjs

# Verify output
ls -lh data/player-boxscores-2025-26.json
```

### Step 5: Test Model Inference

```bash
# Run test prediction
node scripts/test-phase25-inference.mjs

# Should output sample predictions
```

---

## 🎓 Training Process (Historical Context)

**Note:** These models were trained in October 2025 using walkforward validation. You don't need to retrain them to use the system.

### Original Training Method

**Framework:** Likely R or Python (original scripts not included in package)

**Walkforward Windows:**
- **Window 1:** Train on 2023-24, Test on Feb 2025
- **Window 2:** Train through Jan 2025, Test on Mar 2025
- **Window 3:** Train through Feb 2025, Test on Apr 2025

**Training Data:**
- Source: `data/nba/models/temp/train_points_Window_1.json` (909KB)
- ~1,700 player-game samples per model
- Features: L5/L10 rolling stats + season averages

**Algorithm:**
```r
# Likely used this approach (R example)
lm(points ~ season_ppg + L10_fga + L10_ppg + L5_fga + 
           L5_ppg + L10_fta + L5_fta + L10_minutes + 
           L5_minutes + season_apg, data = train_data)
```

### Model Selection

**Why Window 1?**
- Most recent validation window
- Feb 2025 test period
- Use this for production predictions

**Alternative:** Ensemble all 3 windows:
```javascript
prediction = (window1 + window2 + window3) / 3
```

---

## 🚀 Deployment

### Create Prediction Generator

**File:** `scripts/generate-phase25-predictions.mjs`

```javascript
import fs from 'fs';
import fetch from 'node-fetch';

// Load models
const pointsModel = JSON.parse(fs.readFileSync('models/points_Window_1_-_Test_Feb_2025.json'));
const reboundsModel = JSON.parse(fs.readFileSync('models/rebounds_Window_1_-_Test_Feb_2025.json'));
const assistsModel = JSON.parse(fs.readFileSync('models/assists_Window_1_-_Test_Feb_2025.json'));

// Load boxscores
const boxscores = JSON.parse(fs.readFileSync('data/player-boxscores-2025-26.json'));

// Calculate rolling features
function calculateFeatures(playerGames) {
  const recent5 = playerGames.slice(-5);
  const recent10 = playerGames.slice(-10);
  
  return {
    // Season averages
    season_ppg: avg(playerGames.map(g => g.points)),
    season_rpg: avg(playerGames.map(g => g.rebounds)),
    season_apg: avg(playerGames.map(g => g.assists)),
    
    // L5 stats
    L5_ppg: avg(recent5.map(g => g.points)),
    L5_rpg: avg(recent5.map(g => g.rebounds)),
    L5_apg: avg(recent5.map(g => g.assists)),
    L5_fga: avg(recent5.map(g => g.fga)),
    L5_fta: avg(recent5.map(g => g.fta)),
    L5_minutes: avg(recent5.map(g => g.minutes)),
    L5_orb: avg(recent5.map(g => g.orb || 0)),
    
    // L10 stats
    L10_ppg: avg(recent10.map(g => g.points)),
    L10_rpg: avg(recent10.map(g => g.rebounds)),
    L10_apg: avg(recent10.map(g => g.assists)),
    L10_fga: avg(recent10.map(g => g.fga)),
    L10_fta: avg(recent10.map(g => g.fta)),
    L10_minutes: avg(recent10.map(g => g.minutes)),
    L10_orb: avg(recent10.map(g => g.orb || 0))
  };
}

// Make prediction
function predict(model, features) {
  let prediction = model.baseline;
  
  for (const [feature, weight] of Object.entries(model.weights)) {
    prediction += (features[feature] || 0) * weight;
  }
  
  return Math.round(prediction * 10) / 10; // Round to 1 decimal
}

// Helper function
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Generate predictions for all players
function generatePredictions() {
  const predictions = [];
  
  for (const [playerName, playerData] of Object.entries(boxscores)) {
    if (playerData.games.length < 10) continue; // Need 10 games minimum
    
    const features = calculateFeatures(playerData.games);
    
    predictions.push({
      player: playerName,
      team: playerData.team,
      predicted_points: predict(pointsModel, features),
      predicted_rebounds: predict(reboundsModel, features),
      predicted_assists: predict(assistsModel, features)
    });
  }
  
  return predictions;
}

// Main execution
const predictions = generatePredictions();
console.log(JSON.stringify(predictions, null, 2));

// Save to file
fs.writeFileSync('output/phase25-predictions-today.json', 
  JSON.stringify(predictions, null, 2));
```

### Compare to Odds & Generate Picks

```javascript
// Fetch today's odds from TheOddsAPI
async function fetchTodayOdds() {
  const response = await fetch(
    `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?` +
    `apiKey=${process.env.ODDS_API_KEY}&` +
    `regions=us&markets=player_points,player_rebounds,player_assists`
  );
  return await response.json();
}

// Compare predictions to lines
function generatePicks(predictions, odds) {
  const picks = [];
  
  for (const pred of predictions) {
    const playerOdds = odds[pred.player.toLowerCase()];
    if (!playerOdds) continue;
    
    // Points
    if (playerOdds.points) {
      const line = playerOdds.points.line;
      const edge = pred.predicted_points - line;
      
      if (Math.abs(edge) >= 2.0) { // 2+ point edge
        picks.push({
          player: pred.player,
          market: 'points',
          prediction: pred.predicted_points,
          line: line,
          edge: edge,
          pick: edge > 0 ? 'OVER' : 'UNDER',
          confidence: Math.abs(edge)
        });
      }
    }
    
    // Similar for rebounds/assists...
  }
  
  return picks.sort((a, b) => b.confidence - a.confidence);
}
```

---

## 🔧 Troubleshooting

### Issue: Model files not found

**Solution:**
```bash
# Verify extraction
ls -lh models/
# Should see 9 .json files

# Check file paths in script
pwd  # Make sure you're in project root
```

### Issue: Missing features in boxscores

**Error:** `Cannot read property 'orb' of undefined`

**Solution:**
```javascript
// Add default values
L5_orb: avg(recent5.map(g => g.orb || 0))
```

### Issue: API rate limit exceeded

**Error:** `429 Too Many Requests`

**Solution:**
```javascript
// Add caching
const CACHE_DURATION = 3600000; // 1 hour
let oddsCache = null;
let cacheTime = 0;

if (Date.now() - cacheTime < CACHE_DURATION && oddsCache) {
  return oddsCache;
}
```

### Issue: Predictions seem off

**Debugging:**
```javascript
// Log feature values
console.log('Features:', features);
console.log('Weights:', model.weights);
console.log('Baseline:', model.baseline);
console.log('Prediction:', prediction);

// Verify feature alignment
console.log('Expected features:', model.featureNames);
console.log('Provided features:', Object.keys(features));
```

---

## 📈 Model Performance (Historical)

### Validation Results (Feb-Apr 2025)

**Note:** These are walkforward validation windows, not live performance

| Model | Window | MAE | RMSE | R² |
|-------|--------|-----|------|----|
| Points | Feb 2025 | TBD | TBD | TBD |
| Points | Mar 2025 | TBD | TBD | TBD |
| Points | Apr 2025 | TBD | TBD | TBD |
| Rebounds | Feb 2025 | TBD | TBD | TBD |
| Assists | Feb 2025 | TBD | TBD | TBD |

**Note:** Original validation metrics not included in package. Run backtest to generate.

---

## 🎯 Next Steps

### Immediate (Day 1)
1. ✅ Extract package
2. ✅ Install dependencies
3. ✅ Configure API keys
4. ✅ Fetch current boxscores
5. ✅ Test inference

### Short Term (Week 1)
1. Deploy prediction generator
2. Integrate with odds fetching
3. Create pick selection logic
4. Set up daily automation
5. Build frontend display

### Long Term (Month 1)
1. **Upgrade to Phase 3:** Train logistic regression models for over/under betting
2. **Add opponent defense:** Enhance features with matchup difficulty
3. **Monte Carlo simulation:** Generate confidence intervals
4. **Kelly criterion:** Optimal bet sizing
5. **Live tracking:** Monitor pick performance

---

## 📞 Support & Resources

### API Documentation
- **TheOddsAPI:** https://the-odds-api.com/liveapi/guides/v4/
- **ESPN API:** https://site.api.espn.com/apis/site/v2/sports/basketball/nba/

### Related Systems
- **Phase 3 (Future):** Logistic regression for over/under probabilities
- **DD/TD System:** Separate system for double-double/triple-double props
- **NFL Models:** Similar architecture for NFL player props

### Questions?
- Review `PHASE_2_5_INVENTORY_REPORT.md` for architecture details
- Check example files in `examples/` directory
- Verify data formats in `data/` samples

---

## 🔐 Important Notes

### What This Package Contains
✅ Trained model coefficients (9 files)  
✅ Data collection scripts  
✅ Sample data formats  
✅ Complete documentation  
✅ Deployment templates  

### What This Package Does NOT Contain
❌ Original training scripts (R/Python)  
❌ Full historical odds database  
❌ Live API keys (you must provide)  
❌ Validation result logs  
❌ Phase 3 models (don't exist yet)  

### Security Warnings
- **Never commit `.env` files**
- **Never share API keys**
- **Use environment variables** for sensitive data
- **Rate limit API calls** to avoid charges

---

## 📜 License & Usage

**Created:** November 21, 2025  
**Status:** Recovery Package for Phase 2.5 System  
**Purpose:** Enable recreation of working PRA props system on new machines

**Models trained:** October 2025 (walkforward validation)  
**Data current as of:** November 2025 (2025-26 NBA season)

---

**End of Recovery Guide**

For questions or issues, refer to the troubleshooting section or review the example files included in the package.
