# 🏒 NHL ELITE MODEL - PHASE 2A: DATA PIPELINE & ML LAYER

## **HONEST REALITY CHECK**

### **What v2.0 Actually Is:**
- ✅ **Professional mathematical framework** (ZINB, Kelly, EV)
- ✅ **Clean code architecture** (proper separation of concerns)
- ✅ **Tracking infrastructure** (CLV, residuals)
- ⚠️ **Projection engine with ASSUMPTIONS** (not learned from data)
- ❌ **No historical multi-season training**
- ❌ **No ML layer**
- ❌ **No live injury/lineup integration**

**Truth:** Framework is 95% elite, but **operational completeness is ~40%**.

---

## **WHAT'S MISSING FOR TRUE ELITE STATUS**

### **1. Historical Data Pipeline ❌**

**Current State:**
```javascript
// We ASSUME these values:
const mu5v5 = (seasonSOG60 * 0.65) + (recentSOG60 * 0.35);
const r5v5 = position === 'D' ? 3.5 : 2.8; // HARDCODED
```

**What Elite Needs:**
- Pull 3-5 years NHL play-by-play data
- Fit player-specific distributions from historical shots
- Hierarchical Bayesian priors (league → position → player)
- Variance learned from actual data, not assumed

---

### **2. Machine Learning Layer ❌**

**Current State:**
```javascript
// Manual adjustments:
mu5v5 *= opponentFactor;
mu5v5 *= scoreEffect;
mu5v5 *= matchupPenalty;
```

**What Elite Needs:**
- XGBoost/LightGBM regression: `E[SOG | features]`
- Features: TOI, linemates, opponent, venue, rest, score state
- Train on 100k+ player-game observations
- Output: `{mu, sigma}` for ZINB distribution

---

### **3. Live Injury/Lineup Integration ❌**

**Current State:**
```javascript
// Placeholder:
const scratchRisk = calculateScratchRisk(playerStats, gameLog);
// No actual injury database
```

**What Elite Needs:**
- Daily injury reports scraping
- Morning skate lineup confirmations
- PP unit assignments (PP1/PP2 from practice reports)
- Automatic projection updates when lines change

---

### **4. Opponent Modeling ❌**

**Current State:**
```javascript
// Basic team-level adjustment:
const oppBlockRate = opponent.blockedShotsPerGame || 15;
```

**What Elite Needs:**
- Defense-pairing quality (who does player face?)
- Goalie quality (doesn't affect SOG but affects shot selection)
- Team defensive system (Carolina collapse vs Vegas aggressive)
- Shot suppression by zone (NZ trap teams)

---

### **5. Player Archetypes ❌**

**Current State:**
```javascript
// Position-only variance:
const r5v5 = position === 'D' ? 3.5 : 2.8;
```

**What Elite Needs:**
- **Volume Shooters** (high shots, low shooting%)
- **Snipers** (selective shooters, high shooting%)
- **Playmakers** (low shots, high assists)
- **PP Specialists** (80%+ shots on PP)
- Different variance parameters per archetype

---

## **🔧 PHASE 2A: BUILDING THE DATA ENGINE**

### **Priority 1: Historical Data Pipeline**

**Data Sources:**
1. **NHL Stats API** (free, official)
   - Play-by-play logs (2021-2025)
   - Shift data (TOI by game state)
   - Player stats by season

2. **hockeyR** (R package, NHL data)
   - Similar to nflverse
   - Play-by-play with shot locations
   - Shift-by-shift TOI

3. **Evolving-Hockey** (paid, elite data)
   - Regularized Adjusted Plus-Minus (RAPM)
   - Expected Goals models
   - Isolated impact metrics

**Implementation Plan:**
```javascript
// Step 1: Fetch 3 seasons of player-game logs
fetchHistoricalPlayerGames(playerId, startSeason='2022', endSeason='2025')
→ Returns: [{gameId, shots, toi, opponent, venue, ...}, ...]

// Step 2: Fit player-specific ZINB parameters
fitPlayerDistribution(historicalGames)
→ Returns: {mu_prior, r_prior, pi_prior}

// Step 3: Hierarchical shrinkage
shrinkToPosition(playerParams, positionParams, gamesPlayed)
→ Blend player's empirical distribution with position average
```

---

### **Priority 2: Machine Learning Projection Layer**

**Model Architecture:**
```
XGBoost Regression (2 models):
  1. Predict mu (mean SOG)
  2. Predict sigma (variance → derive r)

Features (30+):
  Player:
  - Season SOG/60 (5v5, PP, SH)
  - Last 10 game SOG rolling avg
  - TOI trend (last 5 games)
  - PP unit (0=none, 1=PP2, 2=PP1)
  - Linemates quality (avg CF%)
  
  Opponent:
  - Shots allowed/60 (5v5, PK)
  - Blocked shots/60
  - Defensive zone control
  - Top-4 D quality (RAPM)
  
  Context:
  - Home/Road
  - Venue (one-hot encode 32 arenas)
  - Rest days (0-7+)
  - Back-to-back flag
  - Travel distance
  - Expected game script (from moneyline)
  - Season month (fatigue builds)
  
  Situational:
  - Team penalty draw rate
  - Expected PP opportunities
  - Score state distribution
  - Pace (team shots/60)

Output:
  mu_predicted, sigma_predicted
  
Then:
  ZINB(mu_predicted, r_derived, pi_scratch)
```

**Training:**
```javascript
// Collect training data
const trainingData = await buildTrainingSet('2022-2025');
// 100k+ player-game observations

// Train XGBoost
const model = trainXGBoost(trainingData, {
  objective: 'reg:squarederror',
  max_depth: 6,
  learning_rate: 0.05,
  n_estimators: 500
});

// Save model
saveModel(model, 'nhl-sog-xgboost-v1.json');
```

---

### **Priority 3: Live Injury & Lineup Integration**

**Data Sources:**
1. **DailyFaceoff.com** (free)
   - Morning skate line combos
   - PP unit assignments
   - Injury status

2. **NHL Injury Reports** (official)
   - IR, DTD, Out, Questionable

3. **LeftWingLock** (paid)
   - Projected lineups
   - Practice reports
   - Line juggling alerts

**Implementation:**
```javascript
// Scrape daily lineups
const lineups = await scrapeDailyFaceoff(gameDate);

// Update player projections
for (const player of players) {
  const lineup = lineups.find(l => l.playerId === player.id);
  
  if (lineup.status === 'SCRATCH') {
    player.scratchRisk = 0.95; // 95% won't play
  } else if (lineup.lineChange) {
    player.roleVolatility = 0.30; // 30% uncertainty
  }
  
  if (lineup.ppUnit === 'PP1') {
    player.ppTimeShare = 0.65;
  } else if (lineup.ppUnit === 'PP2') {
    player.ppTimeShare = 0.35;
  } else {
    player.ppTimeShare = 0.0;
  }
}
```

---

### **Priority 4: Opponent Defense Modeling**

**Data Sources:**
1. **Evolving-Hockey RAPM** (paid)
   - Defense-pairing quality
   - Isolated shot suppression

2. **Natural Stat Trick** (free)
   - Shots allowed by pairing
   - Zone entry defense

**Implementation:**
```javascript
// Fetch opponent D-pairing quality
const oppDefense = await fetchDefensePairings(opponentTeam);

// Determine likely matchup
const topPair = oppDefense.pairs.find(p => p.role === 'SHUTDOWN');

// Adjust projection
if (player.likelyFaces(topPair)) {
  mu5v5 *= 0.92; // -8% vs elite defense
}
```

---

## **📅 REALISTIC IMPLEMENTATION TIMELINE**

### **Week 1: Historical Data Pipeline**
- ✅ Build NHL Stats API multi-season fetcher
- ✅ Store 3 years player-game logs (local DB or Netlify Blobs)
- ✅ Fit player-specific ZINB priors
- ✅ Hierarchical shrinkage to position averages

### **Week 2: ML Training**
- ✅ Build feature engineering pipeline (30+ features)
- ✅ Train XGBoost on 100k+ observations
- ✅ Validate on holdout 2024-25 season
- ✅ Compare ML projections vs Bayesian baseline

### **Week 3: Live Integration**
- ✅ DailyFaceoff scraper (lineups, PP units)
- ✅ Injury status API integration
- ✅ Auto-update projections on lineup changes

### **Week 4: Testing & Calibration**
- ✅ Backtest on 2024-25 full season
- ✅ Compare residuals vs v2.0 framework
- ✅ Fine-tune ZINB parameters
- ✅ Deploy v3.0 for 2025-26 season

---

## **🎯 WHAT TO BUILD FIRST (THIS WEEK)**

### **Option A: Historical Data Pipeline (Recommended)**
**Why:** Foundation for everything else  
**Build:**
1. Multi-season NHL data fetcher
2. Player-game log database
3. ZINB prior fitting from historical shots
4. Hierarchical Bayesian shrinkage

**Outcome:** Replace hardcoded `r = 3.5` with learned variance

---

### **Option B: ML Projection Layer**
**Why:** Biggest ROI improvement (+2-3%)  
**Build:**
1. Feature engineering pipeline
2. XGBoost training script
3. Model serving endpoint
4. Ensemble with Bayesian baseline

**Outcome:** `mu_predicted` from ML, not manual adjustments

---

### **Option C: Live Injury Integration**
**Why:** Immediate operational value  
**Build:**
1. DailyFaceoff scraper
2. Lineup change detector
3. Scratch risk auto-updates
4. PP unit assignments

**Outcome:** No more manual roster checks

---

## **💡 MY RECOMMENDATION**

### **Build This Week: Option A (Historical Data Pipeline)**

**Why:**
1. **Foundation for ML** - Can't train XGBoost without historical data
2. **Immediate Improvement** - Learned variance > hardcoded
3. **Enables Calibration** - Compare projections vs actual results
4. **Hierarchical Priors** - Proper Bayesian treatment

**What We'll Build:**
```javascript
// 1. Historical data fetcher
fetchNHLPlayerGameLogs(playerId, '2022-2025')
→ 3 seasons of shots, TOI, opponent, venue

// 2. Distribution fitter
fitZINBPriors(historicalGames)
→ {mu_prior, r_prior, pi_prior}

// 3. Hierarchical shrinkage
shrinkToPosition(playerPrior, positionPrior, gamesPlayed)
→ Blend individual + position average

// 4. Integration with v2.0
const params = blendPriorAndRecent(
  historicalPrior,
  last10Games,
  blendWeight=0.7 // 70% historical, 30% recent
);
```

---

## **✅ DELIVERABLES (THIS WEEK)**

If you approve, I'll build:

1. **`nhl-historical-data-pipeline.mjs`**
   - Fetch 3 seasons NHL play-by-play
   - Store player-game logs
   - Build training dataset

2. **`nhl-zinb-prior-fitting.mjs`**
   - Fit player-specific distributions
   - Hierarchical Bayesian shrinkage
   - Position-level priors

3. **`nhl-projection-v3-learned.mjs`**
   - Replace hardcoded variance with learned
   - Blend historical priors + recent form
   - Production-ready projections

4. **`NHL_V3_DATA_PIPELINE.md`**
   - Implementation guide
   - Data sources documentation
   - Calibration workflow

---

## **🏆 HONEST BOTTOM LINE**

**v2.0 Status:**
- Framework: ✅ **95% elite**
- Operational: ⚠️ **40% complete**
- Missing: Historical data, ML, live injuries

**What I Should Build Next:**
1. **Historical data pipeline** (foundation)
2. **ML projection layer** (biggest ROI)
3. **Live injury integration** (operational)

**Expected Timeline:**
- Week 1: Historical data + ZINB priors
- Week 2: ML training
- Week 3: Live integration
- Week 4: Full v3.0 deployment

**Then we'll have:**
- ✅ Elite framework (already built)
- ✅ Learned parameters (not hardcoded)
- ✅ ML projections (trained on 100k+ games)
- ✅ Live injury updates (operational)

**That's 100% institutional-grade.**

---

**Should I start with the historical data pipeline?** 🚀
