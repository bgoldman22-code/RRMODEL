# MLB Home Run Round Robin - Comprehensive Backtest & Optimization Plan

**Project Goal:** Review, fix, enhance, and backtest MLB HR Round Robin model for 2026 season optimization using 5 years of historical data (2021-2025) with ZERO data leakage.

**Status:** Architecture complete, data collection in progress  
**Timeline:** 2025 MLB offseason (Nov 2025 - Feb 2026)  
**Credit Budget:** 50,000 TheOddsAPI credits approved (1% of 5M quota)

---

## Executive Summary

### Current System (Production)
- **Pool Size:** 12 picks daily (though real slips show 17-22 legs - variable)
- **Game Constraint:** MAX_PER_GAME = 2 players
- **Round Robin Formats:** Manually entered on FanDuel as by 2s, 3s, 4s
- **Stake Split:** 50% on x2, 35% on x3, 15% on x4 (~$450 daily bankroll)
- **Selection Logic:** EV-based ranking with variance controls

### FanDuel Constraint (Critical Understanding)
- ✅ **Pool CAN contain** multiple players from same game
- ❌ **Individual parlays CANNOT** combine same-game legs
- 💰 **Invalid combos** are NOT charged but also DON'T PAY
- **Impact:** 12-pick by-3s = 220 theoretical combos, only ~140 valid (64%)
- **Real Data:** Judge+Stanton same-game stacking appears in all 3 Sept 2025 slips

### Real Performance Data (Sept 2025)
- **9/24/2025:** 17 legs, 7 wins, **$442.36 payout**
- **9/25/2025:** 17 legs, 5 wins, **$72.69 payout**
- **9/26/2025:** 22 legs, 5 wins, **$7.26 payout**

### Key Problems Identified
1. **Invalid Combo Waste:** 30-40% of combos unplayable due to same-game constraint
2. **Format Uncertainty:** No systematic testing of which RR format(s) are optimal
3. **Data Leakage Risk:** Testing multiple prediction/selection approaches without contamination
4. **Missing Features:** Not using Statcast data (exit velo, barrel rate, spray charts)
5. **Blind Spots:** Haven't tested all possible pool sizes, formats, stake allocations

---

## Proposed Solution: Exhaustive Backtest Framework

### Core Philosophy
**"Test EVERYTHING, leave NO blind spots, maintain ZERO data leakage"**

### Three-Pillar Approach

#### 1. Modular Prediction System (7 Approaches)
Test different ways to generate HR probabilities:
- **Current Model (Baseline):** Production model with hotCold, BvP, calibration, protection
- **Statcast Enhanced:** Adds barrel rate, exit velo, launch angle consistency, spray charts
- **Pure EV:** Simple probability ranking without variance engineering
- **Correlation-Aware:** Penalizes same-game stacking (5% per additional player)
- **Kelly Criterion:** Optimal bet sizing based on edge vs market odds
- **ML-Based:** XGBoost/LightGBM trained on historical features
- **Ensemble Meta-Module:** Stacking model that learns optimal blend of modules 1-6

#### 2. Modular Selection System (9 Strategies)
Test different ways to choose pool from predictions:
- **Current (EV + Variance):** Production selection with variance controls
- **Pure EV Ranking:** Top N by probability, no other considerations
- **Game-First Diversity:** Prioritize spreading across different games
- **Correlation Penalty:** Explicitly penalize same-game stacking beyond constraint
- **Valid Combo Optimizer:** Maximize valid combo count before EV
- **Dynamic Pool Size:** Adjust pool size (12-25 legs) based on slate quality
- **Format-Specific Selection:** Different strategies for x2 (safe) vs x4+ (tail)
- **Exposure-Aware Selection:** Cap individual player exposure (max 70% of combos)
- **Hybrid Optimizer:** Combines exposure control + format-specific + valid combo optimization

#### 3. Exhaustive Format Testing (50+ Combinations)
Test all possible RR configurations:

**Pool Sizes:** 4, 6, 8, 10, 12, 14, 15, 17, 20, 22, 25 legs

**RR Formats:** x2, x3, x4, x5, x6, x7

**Game Constraints:** 
- 1 player per game (max diversity)
- 2 players per game (current production)
- 3 players per game (aggressive stacking)
- Unlimited (no constraint)

**Stake Allocations (25+ splits tested):**
- Single format: 100% on x2, x3, x4, x5
- Two-way splits: 70/30, 60/40, 50/50
- Three-way splits: 50/35/15 (current), 40/40/20, 60/30/10
- Four-way splits: 40/30/20/10, 25/25/25/25
- Dynamic: Adjust by slate quality

**Total Test Matrix:** 7 prediction × 9 selection × 50+ formats = **~3,150 strategy combinations**

---

## Data Collection Strategy

### 1. MLB Game Data (✅ In Progress - Background Process)
**Source:** MLB Stats API (statsapi.mlb.com)  
**Years:** 2021-2025 (~12,000 games)  
**Data Points:**
- Game schedules, scores, venues
- Starting pitchers
- HR events (batter, pitcher, inning, pitch sequence)
- Box scores and play-by-play

**Status:** Background collection running, storing to `/data/mlb_historical/games/`

### 2. Statcast Data (⏳ Ready to Run)
**Source:** Baseball Savant via pybaseball  
**Years:** 2021-2025 (~150,000+ plate appearances, ~30,000 HRs)

**Batted Ball Events (ALL contact, not just HRs):**
- Exit velocity (avg, max, 95th percentile, std dev)
- Launch angle (avg, std dev, optimal range %)
- Hit distance
- Barrel classification (98+ mph with optimal LA)
- Spray coordinates (pull%, center%, oppo%)
- Pitch type hit
- Game state (runners, outs, count)

**Pitch-by-Pitch Data (EVERY pitch thrown):**
- Pitch type, velocity, spin rate
- Movement (horizontal/vertical break)
- Location (plate_x, plate_z, zone)
- Result (ball, strike, foul, in play)
- Batted ball outcome if contact

**Batter Profiles (Aggregated per player/year):**
- Exit velocity trends and consistency
- Barrel rate vs league average
- Launch angle consistency (can they repeat HR swings?)
- Spray chart patterns (pull%, center%, oppo%)
- **Performance vs each pitch type** (FB, SL, CH, CU, SI, etc)
  - Exit velo vs pitch type
  - Barrel rate vs pitch type
  - HR rate vs pitch type
- Zone heatmaps (where they do damage)
- Platoon splits (vs LHP/RHP)

**Pitcher Profiles (Aggregated per pitcher/year):**
- **Arsenal composition** (% fastball, slider, changeup, etc)
- **Velocity by pitch type** (avg + consistency/decline)
- Movement profiles
- Zone usage (where they locate pitches)
- Contact quality allowed (exit velo, barrel rate, HR/FB ratio)
- Platoon splits (vs LHB/RHB)

**Script:** `/scripts/collect_statcast_comprehensive.py`  
**Status:** Ready to run (requires: `pip install pybaseball pandas numpy`)  
**Runtime:** ~1-2 hours for all 5 years

### 3. Historical Odds Data (⏳ Pending - 50K Credits)
**Source:** TheOddsAPI (API key stored in THEODDS_API_KEY environment variable)  
**Market:** `batter_home_runs` (Over 0.5 = "Will player hit HR? YES")  
**Years:** 2021-2025 (~900 daily snapshots)

**Coverage Strategy:**
- **Base:** Opening odds for all games (~9,000 credits)
- **Enhanced:** Multiple snapshots per day (10am, 2pm, 5pm, first pitch) (~25,000 credits)
- **Comprehensive:** Line movement tracking, multiple books (~50,000 credits - APPROVED)

**⚠️ CRITICAL: Track Actual Execution Odds (GPT Warning)**

**Problem:** Snapshot odds may not match actual bet execution odds, causing measurement errors.

**Solution - CLV (Closing Line Value) Tracking:**

```javascript
class OddsTracker {
  async trackCLV(date, playerPool, actualExecutionOdds) {
    const snapshotOdds = await this.getSnapshotOdds(date, 'lineup_lock'); // 2hr before first pitch
    const closingOdds = await this.getSnapshotOdds(date, 'closing'); // Last available
    
    const clvAnalysis = playerPool.map(player => {
      const snapshot = snapshotOdds[player.id];
      const closing = closingOdds[player.id];
      const actual = actualExecutionOdds[player.id]; // From real slips when available
      
      return {
        playerId: player.id,
        snapshotOdds: snapshot,
        closingOdds: closing,
        actualExecutionOdds: actual,
        clv: this.calculateCLV(actual || snapshot, closing),
        beatClosing: actual && this.convertToImplied(actual) < this.convertToImplied(closing)
      };
    });
    
    return clvAnalysis;
  }
  
  calculateCLV(executionOdds, closingOdds) {
    // Positive CLV = got better odds than closing
    const execImplied = this.convertToImplied(executionOdds);
    const closeImplied = this.convertToImplied(closingOdds);
    return closeImplied - execImplied; // e.g., +0.02 = 2% better than closing
  }
}
```

**Why This Matters:**
- If backtest uses snapshot odds but real bets got worse odds → model looks better than reality
- If real bets got better odds (early line value) → model undersells performance
- CLV > 0 across sample = strong signal of true edge

**Implementation:**
1. Track actual execution odds from real Sept 2025 slips
2. Compare model performance at snapshot vs actual odds
3. Report CLV distribution (are we beating closing lines?)
4. Adjust 2026 expectations based on realistic odds availability

**Books Priority:**
1. FanDuel (primary - matches betting platform)
2. DraftKings (backup/comparison)
3. BetMGM (additional data point)

**Cost Analysis:**
- 10 credits per market per region
- ~15 games/day × 182 days/year × 5 years = ~13,650 game-days
- Base: 13,650 requests = ~13,650 credits (conservative single snapshot)
- Comprehensive: 3-4 snapshots + 2-3 books = ~45,000-50,000 credits

**Output Format:**
```json
{
  "date": "2025-09-25",
  "lastUpdated": "2025-09-25T18:00:00Z",
  "games": [
    {
      "gameId": "662584",
      "home": "NYY",
      "away": "BAL",
      "players": [
        {
          "name": "Aaron Judge",
          "playerId": 592450,
          "team": "NYY",
          "isHome": true,
          "odds": {
            "fanduel": 300,
            "draftkings": 320,
            "betmgm": 310
          },
          "impliedProb": {
            "fanduel": 0.250,
            "draftkings": 0.238,
            "betmgm": 0.244
          }
        }
      ]
    }
  ]
}
```

**Status:** Script to be built, 50K credit budget approved

### 4. Player Season Statistics (⏳ Ready to Run)
**Source:** pybaseball (FanGraphs/Baseball Reference)  
**Years:** 2021-2025

**Batting Stats:**
- Traditional: HR, RBI, AVG, OBP, SLG, OPS
- Advanced: wOBA, ISO, wRC+, barrel%, pull%, spray angle
- Discipline: BB%, K%, SwStr%, O-Swing%, Z-Contact%
- Power: Hard-Hit%, avg exit velo, max exit velo

**Pitching Stats:**
- Traditional: ERA, WHIP, K/9, BB/9, HR/9
- Advanced: FIP, xFIP, SIERA, K-BB%, HR/FB%
- Arsenal: FB%, pitch type distribution
- Batted ball: GB%, FB%, LD%, IFFB%

**Status:** Included in Statcast collection script

---

## Zero Data Leakage Framework

### Critical Requirement
**"We're going to try a few different prediction logics/pick logic combos to see what works best and tweak from there. We'll need ZERO data leakage as we do that."**

### Architecture: 5-Layer Protection

#### Layer 1: Temporal Boundaries
**Class:** `TemporalBoundary`  
**Purpose:** Enforce strict time-based data access

```javascript
class TemporalBoundary {
  constructor(simulationDate, lockTimeOffset = 2) {
    this.simulationDate = simulationDate;
    this.lockTime = new Date(simulationDate);
    this.lockTime.setHours(this.lockTime.getHours() - lockTimeOffset);
  }
  
  isValidDataAccess(dataTimestamp, context) {
    const dataDate = new Date(dataTimestamp);
    const isValid = dataDate < this.lockTime;
    
    if (!isValid) {
      throw new Error(
        `DATA LEAKAGE DETECTED!
         Context: ${context}
         Simulation date: ${this.simulationDate}
         Lock time: ${this.lockTime}
         Data timestamp: ${dataTimestamp}
         Violation: Attempting to access future data`
      );
    }
    
    return isValid;
  }
}
```

**Rules:**
- Lock time = game_time - 2 hours (lineup lock)
- ALL data access must be BEFORE lock time
- Throws error immediately on violation
- Logs all access attempts with timestamps

#### Layer 2: Rolling Window Features
**Class:** `RollingWindowFeatures`  
**Purpose:** Calculate time-based features using ONLY past data

**Hot/Cold Streaks (14-day window):**
```javascript
calculateHotCold(playerId, allGames, asOfDate) {
  const cutoffDate = new Date(asOfDate);
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  
  // ONLY games between cutoffDate and asOfDate
  const recentGames = allGames.filter(g => 
    g.playerId === playerId &&
    new Date(g.date) >= cutoffDate &&
    new Date(g.date) < asOfDate  // MUST be before simulation date
  );
  
  // Calculate HR rate vs season average
  const recentHRRate = recentGames.filter(g => g.hitHR).length / recentGames.length;
  const seasonHRRate = calculateSeasonRate(playerId, asOfDate);
  
  return Math.min(0.06, Math.max(-0.06, recentHRRate - seasonHRRate));
}
```

**Batter vs Pitcher (BvP) History:**
```javascript
calculateBvP(batterId, pitcherId, allMatchups, asOfDate, minAB = 10) {
  // ONLY matchups BEFORE asOfDate
  const priorMatchups = allMatchups.filter(m =>
    m.batterId === batterId &&
    m.pitcherId === pitcherId &&
    new Date(m.date) < asOfDate  // MUST be past
  );
  
  if (priorMatchups.length < minAB) return 0;
  
  const hrRate = priorMatchups.filter(m => m.result === 'HR').length / priorMatchups.length;
  const expectedRate = 0.03; // League average ~3% HR per PA
  
  return Math.min(0.06, Math.max(-0.06, hrRate - expectedRate));
}
```

#### Layer 3: Data Split Management
**Class:** `DataSplitManager`  
**Purpose:** Separate train/validate/test with locking

**Split Strategy:**
- **Training:** 2021-2023 (optimize hyperparameters, calibrate models)
- **Validation:** 2024 (select top strategies, tune stake allocations)
- **Test:** 2025 (final performance evaluation, validate vs real slips)

**Rules:**
1. Training phase: CAN access 2021-2023 data
2. Validation phase: CAN access 2021-2024 data (train + validate)
3. Test phase: CAN access 2021-2025 data (all)
4. CANNOT use test results to influence training/validation
5. Lock splits before backtest starts (no peeking)

```javascript
class DataSplitManager {
  constructor() {
    this.splits = {
      train: { start: '2021-03-01', end: '2023-11-30', locked: false },
      validate: { start: '2024-03-01', end: '2024-11-30', locked: false },
      test: { start: '2025-03-01', end: '2025-11-30', locked: false }
    };
  }
  
  getAvailableData(phase, requestDate) {
    // Training: only 2021-2023
    // Validation: 2021-2024
    // Test: 2021-2025
    // ALL respect temporal boundaries within phase
  }
  
  lockSplit(phase) {
    // Prevent further modifications
    this.splits[phase].locked = true;
  }
}
```

#### Layer 4: Data Access Auditing
**Class:** `DataAccessAuditor`  
**Purpose:** Log every data access with timestamps

```javascript
class DataAccessAuditor {
  constructor() {
    this.accessLog = [];
    this.violations = [];
  }
  
  logAccess(context) {
    this.accessLog.push({
      timestamp: new Date(),
      simulationDate: context.date,
      dataSource: context.source,
      dataTimestamp: context.dataTimestamp,
      playerId: context.playerId,
      isValid: context.isValid,
      caller: context.caller
    });
    
    if (!context.isValid) {
      this.violations.push(context);
    }
  }
  
  generateReport() {
    return {
      totalAccesses: this.accessLog.length,
      violations: this.violations.length,
      violationRate: this.violations.length / this.accessLog.length,
      violationDetails: this.violations
    };
  }
}
```

**Output:** Comprehensive audit trail proving zero leakage

#### Layer 5: Orchestration
**Class:** `LeakagePreventionSystem`  
**Purpose:** Coordinate all protection layers

```javascript
class LeakagePreventionSystem {
  constructor() {
    this.auditor = new DataAccessAuditor();
    this.splitManager = new DataSplitManager();
    this.rollingFeatures = new RollingWindowFeatures(this.auditor);
  }
  
  createBoundary(simulationDate) {
    return new TemporalBoundary(simulationDate, 2, this.auditor);
  }
  
  async finalizeBacktest() {
    const auditReport = this.auditor.generateReport();
    
    if (auditReport.violations > 0) {
      throw new Error(`BACKTEST INVALID: ${auditReport.violations} data leakage violations detected`);
    }
    
    return auditReport;
  }
}
```

**File:** `/src/backtest/leakage_prevention.mjs` (✅ Complete - 300+ lines)

---

## Prediction Module Architecture

### Base Interface
**File:** `/src/backtest/prediction_modules.mjs` (✅ Complete - 350+ lines)

```javascript
class BasePredictionModule {
  async predict(context) {
    // context: { date, player, game, historicalData, boundary }
    // MUST respect boundary.isValidDataAccess()
    // Returns: { probability, confidence, features, reasoning }
  }
  
  async train(trainingData) {
    // Optional - some modules don't need training
  }
  
  getMetadata() {
    // Returns: { name, version, hyperparameters, requiresTraining }
  }
}
```

### Module 1: Current Model (Baseline)
**Purpose:** Reproduce production model exactly for comparison

**Features:**
- Base probability from pitcher HR/9, HR/FB%
- Hot/Cold modifier (±6% cap, 14-day window)
- Calibration (λ = 0.25)
- Pitch-type matchup edge
- Batter vs Pitcher history (10+ AB minimum, ±6% cap)
- Lineup protection (+5% cap)
- Park factor (venue HR factor)
- Weather multiplier (temp, wind, humidity)

**Formula:**
```
Final = baseProb 
      × (1 + hotCold) 
      × calibration 
      × pitchType 
      × (1 + bvp) 
      × (1 + protection) 
      × parkFactor 
      × weatherMultiplier
```

**Hyperparameters:**
```javascript
{
  calibrationLambda: 0.25,
  hotColdWindow: 14,
  hotColdCap: 0.06,
  bvpMinAB: 10,
  bvpCap: 0.06,
  protectionCap: 0.05
}
```

### Module 2: Statcast Enhanced
**Purpose:** Add batted ball quality features to baseline

**Additional Features:**
- **Barrel Rate:** Recent barrel% vs season average (30% weight)
- **Exit Velocity Trend:** Last 30 days avg vs season (20% weight)
- **Launch Angle Consistency:** Std dev of LA in HR range (15% weight)
- **Spray Chart Match:** Pull tendency × park dimensions compatibility

**⚠️ CRITICAL: Avoid Double-Counting Park Factor (GPT Warning)**

The Statcast module must handle park factors carefully to avoid compounding:

```javascript
calculateSprayChartMatch(playerId, venueId, statcastData) {
  // Get player's spray tendency
  const playerSpray = this.getSprayPattern(playerId, statcastData);
  // pull_rate: 0.65 = 65% of HRs to pull side
  
  // Get park dimensions (NOT park factor - that's already applied in baseline)
  const venueDims = this.getVenueDimensions(venueId);
  // { RF: 314, CF: 408, LF: 330 } for Camden Yards
  
  // Match score based on DIMENSIONAL fit (not HR factor)
  if (playerSpray.dominant === 'pull') {
    // RHB pulling to RF at Camden (short) = good fit
    const pullFieldDist = playerSpray.batsRight ? venueDims.RF : venueDims.LF;
    const sprayMatch = 1 + (390 - pullFieldDist) / 1000; // 1.0-1.15x range
    return { matchScore: playerSpray.pull_rate * 0.7, multiplier: sprayMatch };
  }
  
  // Key: This is DIMENSIONAL match, not HR factor
  // Baseline already includes park HR factor (e.g., 1.15x for Camden)
  // This adds SPRAY-SPECIFIC dimensional adjustment
}
```

**Separation of Concerns:**
- **Baseline Park Factor:** Overall HR environment (from park HR rates)
- **Statcast Spray Match:** Directional dimensional fit BEYOND baseline
- **Result:** No double-counting, proper attribution

**Formula:**
```
Final = CurrentModel_Probability × StatcastMultiplier

StatcastMultiplier = 
  (1 + barrelRate.adjustment × 0.30) ×
  (1 + exitVelo.adjustment × 0.20) ×
  (1 + launchAngle.adjustment × 0.15) ×
  sprayChart.multiplier
```

**Example Calculation:**
```
Judge vs BAL (Camden Yards - short RF):
- Baseline: 12% HR prob
- Barrel rate: 15% (vs 8% league) → +0.07 adjustment
- Exit velo: 95mph (vs 90mph season) → +0.05 adjustment
- Launch angle: 28° avg, 3° std dev (very consistent) → +0.04 adjustment
- Spray: 65% pull rate, Camden RF = 318ft → 1.15x multiplier

Final = 0.12 × (1 + 0.07×0.30) × (1 + 0.05×0.20) × (1 + 0.04×0.15) × 1.15
     = 0.12 × 1.021 × 1.01 × 1.006 × 1.15
     ≈ 0.144 (14.4% HR probability)
```

### Module 3: Pure EV
**Purpose:** Test if simpler is better (no variance engineering)

**Approach:** Use Current Model probabilities but remove variance controls, select purely by EV ranking

### Module 4: Correlation-Aware
**Purpose:** Explicitly penalize same-game stacking

**Modification:**
```javascript
adjustedProb = baseProb × (1 - sameGamePenalty)

where:
  sameGamePenalty = 0.05 × numSameGamePlayersInPool
```

**Example:**
```
Pool already has 2 Yankees:
- Judge base prob: 12%
- Stanton adjusted: 10% × (1 - 0.05×2) = 10% × 0.90 = 9%
- Rizzo adjusted: 8% × (1 - 0.05×2) = 8% × 0.90 = 7.2%
```

### Module 5: Kelly Criterion
**Purpose:** Optimize bet sizing based on edge

**Formula:**
```
Kelly% = (modelProb × odds - 1) / odds

Fractional Kelly = Kelly% × safetyFactor (0.25)
```

**Ranking:** Select players with highest Kelly fraction (biggest edge)

**Example:**
```
Judge:
- Model prob: 14%
- FanDuel odds: +300 (3.0 decimal)
- Implied market prob: 25% (1/4)
- Edge: 14% - 25% = -11% (NO BET - negative edge)

Ohtani:
- Model prob: 18%
- FanDuel odds: +400 (4.0 decimal)
- Implied market prob: 20% (1/5)
- Edge: 18% - 20% = -2% (MARGINAL)

Harper:
- Model prob: 12%
- FanDuel odds: +500 (5.0 decimal)
- Implied market prob: 16.7% (1/6)
- Edge: 12% - 16.7% = -4.7% (NO BET)

Note: Most HR bets will show negative edge (sportsbook takes vig)
Kelly module focuses on LEAST negative edge or rare positive edges
```

### Module 6: ML-Based (XGBoost/LightGBM)
**Purpose:** Train gradient boosting model on all features

**Features (50+ inputs):**
- All Current Model features
- All Statcast features
- Historical matchup data
- Recent form trends
- Park factors by spray direction
- Weather interactions
- Pitcher fatigue indicators
- Lineup position effects
- Game state features

**Training:**
- Train on 2021-2023 (target: did player hit HR?)
- Cross-validation within training set
- Hyperparameter tuning via grid search
- Validate on 2024
- Final model locked before testing on 2025

**Status:** Architecture ready, implementation pending data collection

### Module 7: Ensemble Meta-Module (GPT Recommendation)
**Purpose:** Blend outputs of modules 1-6 for optimal calibration

**Architecture:**
```javascript
class EnsembleMetaModule extends BasePredictionModule {
  constructor() {
    super('Ensemble Meta-Module', '1.0.0');
    this.baseModules = [
      new CurrentModelModule(),
      new StatcastEnhancedModule(),
      new PureEVModule(),
      new CorrelationAwareModule(),
      new KellyCriterionModule(),
      new MLBasedModule()
    ];
    this.weights = null; // Learned from training data
    this.stackingModel = null; // XGBoost meta-learner
  }
  
  async train(trainingData) {
    console.log('Training ensemble meta-module...');
    
    // Step 1: Get predictions from all base modules
    const baseModulePredictions = [];
    for (const module of this.baseModules) {
      await module.train(trainingData);
      const preds = await module.predictBatch(trainingData);
      baseModulePredictions.push(preds);
    }
    
    // Step 2: Train stacking model on base predictions
    // Features: [baseProb1, baseProb2, ..., confidence1, ..., feature1, ...]
    const stackingFeatures = this.buildStackingFeatures(baseModulePredictions, trainingData);
    const targets = trainingData.map(d => d.hitHR ? 1 : 0);
    
    this.stackingModel = this.trainXGBoost(stackingFeatures, targets);
    
    console.log('Ensemble meta-module training complete');
  }
  
  async predict(context) {
    // Get predictions from all base modules
    const basePredictions = [];
    for (const module of this.baseModules) {
      const pred = await module.predict(context);
      basePredictions.push(pred);
    }
    
    // Stack predictions into meta-features
    const metaFeatures = this.buildMetaFeatures(basePredictions, context);
    
    // Final ensemble prediction
    const ensembleProb = this.stackingModel.predict(metaFeatures);
    
    return {
      playerId: context.player.id,
      playerName: context.player.name,
      probability: ensembleProb,
      confidence: this.calculateEnsembleConfidence(basePredictions),
      features: {
        basePredictions: basePredictions.map(p => p.probability),
        ensembleAgreement: this.calculateAgreement(basePredictions),
        metaFeatures
      },
      reasoning: `Ensemble of 6 models: ${basePredictions.map(p => p.probability.toFixed(3)).join(', ')}`
    };
  }
  
  calculateEnsembleConfidence(basePredictions) {
    // High confidence if models agree, low if divergent
    const probs = basePredictions.map(p => p.probability);
    const mean = probs.reduce((a, b) => a + b) / probs.length;
    const variance = probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probs.length;
    const agreement = 1 - Math.sqrt(variance);
    return Math.max(0.5, Math.min(0.95, agreement));
  }
}
```

**Benefits:**
- Learns which module to trust in which situations
- Corrects for individual module biases
- Likely to outperform any single module
- Provides confidence through ensemble agreement

**Training:**
- Meta-learner trained on 2021-2023 using base module outputs
- Validated on 2024 (test if ensemble generalizes)
- Final test on 2025

---

## Selection Module Architecture

### Module 1: Current (EV + Variance Controls)
**Purpose:** Reproduce production selection logic

**Algorithm:**
1. Rank all predictions by probability × odds
2. Apply variance controls:
   - Max 2 per game (game constraint)
   - Favor different games for diversification
   - Consider lineup protection cascades
3. Select top N for pool

### Module 2: Pure EV Ranking
**Purpose:** Simplest approach - no diversification

**Algorithm:**
1. Rank all predictions by probability
2. Select top N
3. Filter out invalid same-game combos after selection

### Module 3: Game-First Diversity
**Purpose:** Prioritize spreading across games

**Algorithm:**
1. Sort games by best player probability
2. Take top player from each game (round-robin)
3. Continue until pool filled
4. Maximizes game diversity, may sacrifice some EV

### Module 4: Correlation Penalty
**Purpose:** Explicitly optimize for valid combo count

**Algorithm:**
1. Start with empty pool
2. For each candidate:
   - Calculate valid combo increase if added
   - Score = probability × valid_combo_increase
3. Greedily select highest score
4. Repeat until pool filled

### Module 5: Valid Combo Optimizer
**Purpose:** Maximize valid parlays before EV

**Algorithm:**
1. Use integer programming to maximize:
   - Primary objective: # of valid combos
   - Secondary objective: sum of probabilities
2. Subject to constraints:
   - Max N players total
   - Max M per game
   - Valid combo definition (no same-game in parlay)

### Module 6: Dynamic Pool Size
**Purpose:** Adjust pool size based on slate quality

**Algorithm:**
1. Calculate slate quality score:
   - Number of "good" matchups (prob > threshold)
   - Distribution of probabilities (variance)
   - Number of games (more = more diversity possible)
2. If high quality → larger pool (20-25 legs)
3. If low quality → smaller pool (8-12 legs)
4. Optimize combos within dynamic pool

### Module 7: Format-Specific Selection (GPT Recommendation)
**Purpose:** Different selection strategies for different RR formats

**Rationale:**
- **2-leg RRs:** High hit rate, low variance → favor consistency (Pure EV, high prob)
- **3-leg RRs:** Balanced → current production logic works well
- **4-leg+ RRs:** Tail payouts → can tolerate lower individual probs for better combo diversity

**Algorithm:**
```javascript
class FormatSpecificSelection extends BaseSelectionModule {
  constructor() {
    super('Format-Specific Selection', '1.0.0');
    this.formatStrategies = {
      x2: { 
        strategy: 'high_probability',
        minProb: 0.12,
        maxPerGame: 1,
        reasoning: 'Favor consistency for high-frequency 2-legs'
      },
      x3: {
        strategy: 'balanced',
        minProb: 0.08,
        maxPerGame: 2,
        reasoning: 'Current production approach (proven)'
      },
      x4: {
        strategy: 'kelly_optimized',
        minProb: 0.06,
        maxPerGame: 2,
        reasoning: 'Optimize for tail payouts with edge'
      },
      x5: {
        strategy: 'longshot_diversity',
        minProb: 0.05,
        maxPerGame: 1,
        reasoning: 'Max game diversity for large combos'
      }
    };
  }
  
  async select(predictions, constraints, format) {
    const strategy = this.formatStrategies[format];
    
    // Filter predictions by format-specific threshold
    const candidates = predictions.filter(p => p.probability >= strategy.minProb);
    
    // Apply format-specific selection logic
    switch (strategy.strategy) {
      case 'high_probability':
        return this.selectTopN(candidates, constraints.poolSize);
      case 'balanced':
        return this.selectBalanced(candidates, constraints);
      case 'kelly_optimized':
        return this.selectKellyOptimized(candidates, constraints);
      case 'longshot_diversity':
        return this.selectMaxDiversity(candidates, constraints);
    }
  }
}
```

**Benefits:**
- 2-leg slips get safer, higher-prob picks
- 4-leg+ slips can chase tail with more risk tolerance
- Each format optimized for its payout structure

### Module 8: Exposure-Aware Selection (GPT Recommendation)
**Purpose:** Avoid over-concentration in specific players

**Problem:**
With 22-leg pools, some players (e.g., Judge) may appear in 90%+ of combos, creating massive single-player dependency.

**Algorithm:**
```javascript
class ExposureAwareSelection extends BaseSelectionModule {
  async select(predictions, constraints) {
    const pool = [];
    const exposureLimit = 0.70; // Max 70% of combos for any player
    
    // Simulate exposure before adding each player
    while (pool.length < constraints.poolSize) {
      const remainingCandidates = predictions.filter(p => !pool.includes(p));
      
      for (const candidate of remainingCandidates) {
        const testPool = [...pool, candidate];
        const validCombos = this.generateValidCombos(testPool, constraints.rrFormat);
        
        // Calculate exposure for each player
        const exposure = this.calculateExposure(testPool, validCombos);
        candidate.exposure = exposure[candidate.playerId];
      }
      
      // Select candidate with best (EV × exposure_penalty)
      const scores = remainingCandidates.map(c => ({
        player: c,
        score: c.probability * (1 - Math.max(0, c.exposure - exposureLimit))
      }));
      
      const best = scores.sort((a, b) => b.score - a.score)[0];
      pool.push(best.player);
    }
    
    return pool;
  }
  
  calculateExposure(pool, validCombos) {
    const exposure = {};
    for (const player of pool) {
      const appearances = validCombos.filter(combo => 
        combo.some(p => p.playerId === player.playerId)
      ).length;
      exposure[player.playerId] = appearances / validCombos.length;
    }
    return exposure;
  }
  
  generateExposureHeatmap(pool, validCombos, stakes) {
    // For reporting: show each player's portfolio influence
    const heatmap = [];
    for (const player of pool) {
      const combosWithPlayer = validCombos.filter(combo =>
        combo.some(p => p.playerId === player.playerId)
      );
      const stakeExposure = combosWithPlayer.reduce((sum, combo) => 
        sum + stakes[validCombos.indexOf(combo)], 0
      );
      
      heatmap.push({
        playerId: player.playerId,
        playerName: player.name,
        comboExposure: combosWithPlayer.length / validCombos.length,
        stakeExposure: stakeExposure / stakes.reduce((a, b) => a + b),
        risk: combosWithPlayer.length * (1 - player.probability) // Expected losses
      });
    }
    return heatmap.sort((a, b) => b.comboExposure - a.comboExposure);
  }
}
```

**Benefits:**
- Prevents Judge-dependent portfolios
- More balanced risk distribution
- Can still stack when EV justifies it
- Provides exposure reports for risk management

**File:** `/src/backtest/selection_modules.mjs` (⏳ To be built - mirrors prediction structure)

---

## Round Robin Simulator

### Core Simulator Architecture
**File:** `/src/backtest/rr_simulator.mjs` (⏳ To be built)

```javascript
class RoundRobinSimulator {
  constructor(leakageSystem) {
    this.leakageSystem = leakageSystem;
    this.results = [];
  }
  
  async runBacktest(config) {
    // config: { predictionModule, selectionModule, rrFormat, stakes, constraints }
    
    const { startDate, endDate, phase } = this.getCurrentPhase();
    
    for (let date = startDate; date <= endDate; date.nextDay()) {
      // Create temporal boundary for this date
      const boundary = this.leakageSystem.createBoundary(date);
      
      // Get available data (respects split + temporal boundary)
      const historicalData = await this.leakageSystem.getAvailableData(phase, date);
      
      // Get today's games and predictions
      const todaysGames = await this.getGames(date, boundary);
      
      // Run prediction module
      const predictions = await config.predictionModule.predict({
        date,
        games: todaysGames,
        historicalData,
        boundary
      });
      
      // Run selection module
      const pool = await config.selectionModule.select({
        predictions,
        constraints: config.constraints,
        boundary
      });
      
      // Generate RR combos
      const combos = this.generateRRCombos(pool, config.rrFormat);
      
      // Filter valid combos (same-game rule)
      const validCombos = this.filterValidCombos(combos);
      
      // Calculate stakes
      const stakeAllocations = this.allocateStakes(validCombos, config.stakes);
      
      // LOCK DATA - wait for games to complete
      boundary.lock();
      
      // Get results (NOW we can access game outcomes)
      const outcomes = await this.getGameResults(date);
      
      // Calculate P&L
      const pnl = this.calculatePnL(validCombos, stakeAllocations, outcomes);
      
      // Store results
      this.results.push({
        date,
        pool,
        combos: validCombos.length,
        pnl,
        winners: outcomes.filter(o => o.hitHR).length
      });
    }
    
    return this.results;
  }
  
  generateRRCombos(pool, format) {
    // format: { size: 3, type: 'parlay' } = by 3s
    // Generate all C(n,k) combinations
    const combos = [];
    const n = pool.length;
    const k = format.size;
    
    // Combinatorial generation
    this.combinations(pool, k, 0, [], combos);
    
    return combos;
  }
  
  filterValidCombos(combos) {
    // Remove combos with same-game legs
    return combos.filter(combo => {
      const games = combo.map(p => p.gameId);
      const uniqueGames = new Set(games);
      return games.length === uniqueGames.size; // All different games
    });
  }
  
  calculatePnL(combos, stakes, outcomes) {
    let totalStake = 0;
    let totalReturn = 0;
    
    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      const stake = stakes[i];
      totalStake += stake;
      
      // Check if all legs won
      const allWon = combo.every(player => 
        outcomes.find(o => o.playerId === player.id && o.hitHR)
      );
      
      if (allWon) {
        // Calculate parlay payout
        const comboOdds = combo.reduce((total, player) => 
          total * this.convertOdds(player.odds), 1
        );
        totalReturn += stake * comboOdds;
      }
    }
    
    return {
      stake: totalStake,
      return: totalReturn,
      profit: totalReturn - totalStake,
      roi: (totalReturn - totalStake) / totalStake
    };
  }
}
```

### RR Format Examples

**12-pick by 3s:**
- Combos: C(12,3) = 220 theoretical
- Valid: ~140 (64% after same-game filter)
- Cost: $1 × 140 = $140

**15-pick by 4s:**
- Combos: C(15,4) = 1,365 theoretical
- Valid: ~900-1,000 (depends on game distribution)
- Cost: $0.50 × 950 = $475

**20-pick by 2s:**
- Combos: C(20,2) = 190 theoretical
- Valid: ~180 (95% - easier to avoid conflicts with 2s)
- Cost: $1 × 180 = $180

---

## Backtest Execution Plan

### Phase 1: Training (2021-2023)
**Goal:** Optimize hyperparameters for each prediction module

**Process:**
1. For each prediction module:
   - Grid search hyperparameters
   - Use cross-validation within 2021-2023
   - Measure: calibration, discrimination, ROI on held-out folds
2. Lock optimal hyperparameters
3. Do NOT test formats yet (prevent overfitting)

**Output:** Calibrated prediction modules ready for validation

### Phase 2: Validation (2024)
**Goal:** Select top strategies (prediction × selection × format combos)

**Process:**
1. Test full matrix on 2024 data:
   - 7 prediction modules (with locked hyperparameters)
   - 9 selection modules
   - 50+ RR format configurations
   - Total: ~3,150 strategies
2. Measure for each:
   - ROI (profit / stake)
   - Sharpe ratio (risk-adjusted return)
   - Max drawdown (worst losing streak)
   - Win rate (% of days profitable)
   - Consistency (std dev of daily ROI)
3. **Apply Multiple Comparison Correction (GPT Warning)**
4. Select top 20 strategies by Sharpe ratio
5. Lock selected strategies (no further tuning)

**⚠️ CRITICAL: P-Hacking Risk Mitigation (GPT Warning)**

**Problem:** Testing 3,150 strategies increases false discovery rate (lucky strategies that won't repeat).

**Solution - Statistical Corrections:**

```javascript
class ValidationCorrection {
  async selectTopStrategies(allResults, targetCount = 20) {
    // Step 1: Bootstrap resampling to test stability
    const bootstrapScores = await this.bootstrapResample(allResults, 1000);
    
    // For each strategy, check if it consistently ranks high across resamples
    const stabilityScores = allResults.map(strategy => ({
      ...strategy,
      stability: this.calculateStability(strategy.id, bootstrapScores),
      avgRankAcrossResamples: this.getAvgRank(strategy.id, bootstrapScores)
    }));
    
    // Step 2: Benjamini-Hochberg FDR correction
    const pValues = this.calculatePValues(stabilityScores);
    const correctedPValues = this.benjaminiHochberg(pValues, 0.05); // 5% FDR
    
    // Step 3: Filter to strategies that pass FDR threshold AND have stable ranks
    const significant = stabilityScores.filter((s, i) => 
      correctedPValues[i] < 0.05 && s.stability > 0.7
    );
    
    // Step 4: Select top strategies by Sharpe, but only from significant set
    const topStrategies = significant
      .sort((a, b) => b.sharpe - a.sharpe)
      .slice(0, targetCount);
    
    return {
      topStrategies,
      falseDiscoveryRate: 1 - (significant.length / allResults.length),
      recommendedConfidence: this.calculateEnsembleConfidence(topStrategies)
    };
  }
  
  bootstrapResample(results, numResamples) {
    // Resample 2021-2024 data with replacement
    // Re-rank strategies in each resample
    // Check if top performers consistently rank high
    const resamples = [];
    for (let i = 0; i < numResamples; i++) {
      const resampledData = this.resampleWithReplacement(results.dailyResults);
      const resampledRanking = this.rankStrategies(results.strategies, resampledData);
      resamples.push(resampledRanking);
    }
    return resamples;
  }
  
  benjaminiHochberg(pValues, fdr) {
    // Benjamini-Hochberg procedure for controlling false discovery rate
    const sorted = pValues
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p - b.p);
    
    const m = pValues.length;
    const corrected = [];
    
    for (let k = 0; k < sorted.length; k++) {
      const threshold = (k + 1) / m * fdr;
      corrected[sorted[k].i] = sorted[k].p <= threshold;
    }
    
    return corrected;
  }
}
```

**Why This Matters:**
- Without correction: ~157 strategies expected to show p < 0.05 by chance alone (3150 × 0.05)
- With FDR correction: Controls expected proportion of false positives
- Bootstrap stability: Ensures top strategies aren't one-year flukes

**Implementation:**
1. After validation testing, apply FDR correction
2. Report both raw and corrected rankings
3. Select top 20 from FDR-significant set
4. Calculate confidence intervals using bootstrap distribution

**Output:** Top 20 strategies ready for final test (with statistical rigor)

### Phase 3: Testing (2025)
**Goal:** Evaluate true performance on unseen data

**Process:**
1. Run top 20 strategies on 2025 data (locked)
2. Measure final performance
3. Compare to real Sept 2025 slips:
   - 9/24: $442.36 payout
   - 9/25: $72.69 payout
   - 9/26: $7.26 payout
4. Validate against actual results
5. Generate leakage audit report (prove zero contamination)

**Output:** Final strategy recommendation for 2026

### Phase 4: Reporting
**Goal:** Comprehensive analysis and recommendation

**Report Sections:**
1. **Executive Summary**
   - Top 3 strategies for 2026
   - Expected ROI with confidence intervals
   - Key findings vs current production system

2. **Data Leakage Audit**
   - Total data accesses: X
   - Violations detected: 0 (proven)
   - Audit log sample (timestamps, sources)
   - Certification: "ZERO data leakage confirmed"

3. **Strategy Comparison**
   - Train vs Validate vs Test performance
   - Detection of overfitting (if any)
   - Consistency across years

4. **Prediction Module Analysis**
   - Feature importance (which features matter most?)
   - Statcast value-add (did it improve over baseline?)
   - Model calibration (predicted prob vs actual rate)

5. **Selection Module Analysis**
   - Impact of game diversity
   - Same-game stacking effects
   - Valid combo optimization value

6. **Format Optimization**
   - Best pool sizes by slate size
   - Optimal RR format (2s? 3s? 4s? Mix?)
   - Stake allocation efficiency

7. **Real Slip Validation**
   - Compare backtest strategies to actual Sept 2025 performance
   - Explain divergence (if any)
   - Confidence in recommendations

8. **Exposure Analysis (GPT Recommendation)**
   - Player exposure heatmaps (% of combos per player)
   - Stake concentration (% of bankroll influenced by each player)
   - Portfolio correlation analysis
   - Single-player failure impact (e.g., if Judge goes 0-for-4)

9. **Closing Line Value (CLV) Report (GPT Recommendation)**
   - Snapshot odds vs actual execution odds comparison
   - % of bets that beat closing line
   - CLV distribution (are we getting value?)
   - Odds timing analysis (when to bet for best lines)

10. **Statistical Rigor Certification (GPT Recommendation)**
   - False discovery rate analysis
   - Bootstrap stability results (do top strategies hold up?)
   - Multiple comparison correction details
   - Confidence intervals with FDR adjustment

11. **2026 Implementation Plan**
   - Recommended strategy (specific config)
   - Expected bankroll requirements
   - Risk management guidelines
   - Monitoring/adjustment protocol

---

## Risk Management & Limitations

### Backtest Limitations (Acknowledged)
1. **Odds availability:** Historical odds may be incomplete/missing
2. **Market efficiency:** Lines move based on action (we assume pre-lock odds)
3. **Bet limits:** FanDuel may limit stake sizes for consistent winners
4. **Lineup changes:** Late scratches can invalidate picks
5. **Correlation complexity:** Simple same-game rule may miss deeper correlations
6. **Sample size:** Even 5 years is limited for rare events (HRs)
7. **Regime changes:** Player development, rule changes, ball composition
8. **Snapshot vs execution odds:** Backtest odds may differ from actual bet odds (GPT Warning)
9. **P-hacking risk:** Testing 3,150 strategies increases false discovery rate (GPT Warning)
10. **Exposure concentration:** Large pools can create single-player dependency (GPT Warning)
11. **Park factor compounding:** Risk of double-counting park effects in Statcast module (GPT Warning)

### Mitigation Strategies
1. **Conservative ROI estimates:** Use lower confidence bound of test set
2. **Out-of-sample validation:** Strict train/validate/test split
3. **Real slip validation:** Compare to actual Sept 2025 performance
4. **Stress testing:** Test strategies on worst drawdown periods
5. **Ensemble approach:** Consider average of top 3-5 strategies (or use Ensemble Meta-Module)
6. **Dynamic adjustment:** Monitor 2026 real-time, adjust if drift detected
7. **CLV tracking:** Measure closing line value vs snapshot odds (GPT Recommendation)
8. **FDR correction:** Apply Benjamini-Hochberg to control false discovery rate (GPT Recommendation)
9. **Bootstrap stability:** Resample validation data to test strategy robustness (GPT Recommendation)
10. **Exposure limits:** Cap individual player exposure at 70% of combos (GPT Recommendation)
11. **Park factor separation:** Isolate baseline park factor from dimensional spray match (GPT Recommendation)

### Bankroll Management
**Recommended:** Kelly Criterion with 1/4 safety factor

**Example:**
```
If optimal strategy shows:
- Expected ROI: 15%
- Sharpe ratio: 1.2
- Max drawdown: -35%

Bankroll sizing:
- Full Kelly: 15% of bankroll per slate
- Quarter Kelly (safer): 3.75% per slate
- With $10,000 bankroll: $375/slate max
```

---

## Implementation Timeline

### Week 1: Data Collection (Current)
- [x] MLB game data collector (running in background)
- [ ] Run Statcast collection script (~1-2 hours)
- [ ] Build historical odds fetcher
- [ ] Execute odds collection (50K credits, ~24 hours)

### Week 2: Module Development
- [ ] Complete selection modules (6 modules)
- [ ] Build RR simulator with leakage guards
- [ ] Integration testing (verify leakage prevention)
- [ ] Unit tests for all modules

### Week 3: Backtest Execution
- [ ] Phase 1: Training (2021-2023 hyperparameter optimization)
- [ ] Phase 2: Validation (2024 strategy selection)
- [ ] Phase 3: Testing (2025 final evaluation)
- [ ] Phase 4: Real slip validation (Sept 2025)

### Week 4: Analysis & Reporting
- [ ] Generate comprehensive report
- [ ] Leakage audit certification
- [ ] Strategy recommendations
- [ ] 2026 implementation guide

**Total Timeline:** 4 weeks (Dec 2025 target completion)

---

## Technology Stack

### Languages & Frameworks
- **JavaScript (Node.js):** Core simulator, prediction/selection modules
- **Python:** Statcast data collection (pybaseball)
- **R:** (Optional) Statistical validation

### Data Storage
- **JSON:** Primary format (human-readable, easy to debug)
- **Directory structure:**
  ```
  data/mlb_historical/
    games/
      2021_schedule.json
      2021_games_detailed.json
      2022_...
    statcast/
      2021_batted_balls.json
      2021_pitches.json
      2022_...
    players/
      batters/
        2021_batter_profiles.json
      pitchers/
        2021_pitcher_profiles.json
      2021_batting_stats.json
      2021_pitching_stats.json
    odds/
      2021/
        03-28.json
        03-29.json
      2022/
      ...
    processed/
      backtest_results.json
      leakage_audit.json
  ```

### Key Dependencies
- **pybaseball:** Statcast and player stats
- **pandas, numpy:** Data processing (Python)
- **MLB Stats API:** Game data (free, no auth required)
- **TheOddsAPI:** Historical odds (paid, 50K credits)

### Development Tools
- **Git:** Version control
- **VS Code:** Primary IDE
- **GitHub:** Repository hosting

---

## Success Metrics

### Primary KPIs (Test Set 2025)
1. **ROI (Return on Investment)**
   - Target: Beat current production system
   - Minimum acceptable: >5% ROI
   - Stretch goal: >15% ROI

2. **Sharpe Ratio (Risk-Adjusted Return)**
   - Target: >1.0 (good risk-adjusted performance)
   - Stretch goal: >1.5

3. **Max Drawdown**
   - Target: <40% (recoverable within season)
   - Red flag: >60% (too risky)

4. **Win Rate**
   - Target: >40% of days profitable
   - Note: Can be profitable long-term with <50% win rate if payouts are asymmetric

5. **Consistency**
   - Measure: Std dev of daily ROI
   - Target: Stable across months (no massive variance)

### Secondary KPIs
1. **Valid Combo Efficiency:** % of theoretical combos that are valid
2. **Feature Importance:** Which features drive predictions most?
3. **Format Optimality:** Clear winner or diversify across formats?
4. **Real Slip Match:** How close to actual Sept 2025 performance?
5. **Data Leakage Audit:** Zero violations (binary pass/fail)

### Validation Checks
- **Calibration:** Predicted 10% HR rate → actual ~10% HR rate
- **Discrimination:** High predicted prob → higher actual HR rate
- **Stability:** Performance consistent across years (not just one lucky year)
- **Real-world validation:** Matches Sept 2025 real slip outcomes

---

## Questions for Review

### Strategic Questions
1. **Pool Size:** Should we keep fixed 12-pick or go dynamic (8-25 based on slate)?
2. **Format Mix:** Single format (e.g., all by-3s) or diversify stakes across multiple?
3. **Game Constraint:** Is MAX_PER_GAME=2 optimal or should we test 1 or 3?
4. **Same-Game Stacking:** Real slips show Judge+Stanton together - is this intentional or oversight?
5. **Risk Profile:** Optimize for ROI, Sharpe, or consistency?
6. **Ensemble vs Single Model:** Use Ensemble Meta-Module or pick single best module? (GPT Addition)
7. **Exposure Management:** What's optimal max exposure per player? (70%? 50%?) (GPT Addition)

### Technical Questions
1. **Statcast Weight:** How much should we trust statcast vs traditional stats?
2. **Odds Dependency:** If historical odds incomplete, can we impute/estimate?
3. **ML Approach:** Worth building XGBoost module or stick with feature engineering?
4. **Correlation Modeling:** Beyond same-game rule, model deeper correlations (weather, park, etc)?
5. **Lineup Lock:** Should we simulate late scratches / lineup changes?
6. **Park Factor Separation:** How to cleanly separate baseline park factor from spray-specific dimensional fit? (GPT Addition)
7. **CLV Benchmarking:** What CLV threshold indicates real edge vs noise? (GPT Addition)

### Validation Questions
1. **Sample Size:** Is 5 years enough data for rare events (HRs)?
2. **Overfitting Risk:** With 3,150 strategies tested, are we p-hacking? → **YES, addressed with FDR correction** (GPT Confirmed)
3. **Regime Change:** Has HR environment changed post-2024 (rule changes, ball composition)?
4. **Market Efficiency:** Are we assuming we can consistently beat closing lines? → **Track CLV to verify** (GPT Addition)
5. **Real Slip Discrepancy:** If backtest diverges from Sept 2025 real results, which is "right"?
6. **FDR Threshold:** What false discovery rate is acceptable? (5%? 10%?) (GPT Addition)
7. **Bootstrap Iterations:** How many resamples needed for stability confidence? (1000? 10000?) (GPT Addition)

---

## Next Steps (Immediate Actions)

### Data Collection (This Week)
1. ✅ MLB game data (running in background)
2. ⏳ **Run Statcast collection:** `python scripts/collect_statcast_comprehensive.py`
3. ⏳ **Build odds fetcher:** Integrate TheOddsAPI with 50K credit budget
4. ⏳ **Execute odds collection:** Fetch 2021-2025 historical odds (~24-48 hours)

### Module Development (Next Week)
1. ⏳ **Build selection modules:** 9 pluggable strategies (includes GPT recommendations)
2. ⏳ **Build Ensemble Meta-Module:** Stacking model to blend modules 1-6 (GPT Recommendation)
3. ⏳ **Build exposure tracker:** Heatmap generation and portfolio analysis (GPT Recommendation)
4. ⏳ **Build CLV tracker:** Closing line value measurement system (GPT Recommendation)
5. ⏳ **Build RR simulator:** Integrate leakage prevention, combo generation, P&L calc
6. ⏳ **Integration testing:** Verify zero leakage framework works end-to-end
7. ⏳ **Unit tests:** Test each module independently

### Backtest Execution (Week 3)
1. ⏳ **Training phase:** Optimize hyperparameters on 2021-2023
2. ⏳ **Validation phase:** Test 3,150 strategies on 2024
3. ⏳ **FDR correction:** Apply Benjamini-Hochberg with bootstrap stability (GPT Recommendation)
4. ⏳ **Select top 20:** From FDR-significant strategies with stable rankings
5. ⏳ **Testing phase:** Final evaluation on 2025
6. ⏳ **Real slip validation:** Compare to Sept 2025 actual performance
7. ⏳ **CLV analysis:** Measure closing line value across sample (GPT Recommendation)

### Reporting (Week 4)
1. ⏳ **Generate comprehensive report:** All sections outlined above
2. ⏳ **Leakage audit:** Prove zero data contamination
3. ⏳ **Exposure heatmaps:** Show player concentration risk (GPT Recommendation)
4. ⏳ **CLV report:** Closing line value analysis (GPT Recommendation)
5. ⏳ **Statistical rigor certification:** FDR analysis, bootstrap results (GPT Recommendation)
6. ⏳ **Strategy recommendation:** Top 3 strategies (or Ensemble) for 2026 with implementation guide
7. ⏳ **Present findings:** Review with stakeholders, get approval for 2026 deployment

---

## Appendix: File Structure

### Created Files (✅ Complete)
- `/MLB_HR_RR_AUDIT.md` - Initial system audit (380 lines)
- `/MLB_RR_FORMAT_TEST_MATRIX.md` - Exhaustive test matrix design
- `/HISTORICAL_ODDS_STRATEGY.md` - TheOddsAPI integration strategy
- `/src/backtest/leakage_prevention.mjs` - Zero data leakage framework (300+ lines)
- `/src/backtest/prediction_modules.mjs` - 6 prediction modules (350+ lines)
- `/scripts/mlb_data_collector.mjs` - MLB game data fetcher (running)
- `/scripts/collect_statcast_comprehensive.py` - Comprehensive Statcast/player data collector (ready to run)
- `/MLB_HR_RR_COMPREHENSIVE_PLAN.md` - Complete project plan with GPT feedback integrated

### To Be Created (⏳ Pending)
- `/src/backtest/selection_modules.mjs` - 9 selection strategies (includes GPT additions)
- `/src/backtest/ensemble_meta_module.mjs` - Stacking ensemble module (GPT Recommendation)
- `/src/backtest/exposure_tracker.mjs` - Portfolio exposure analysis (GPT Recommendation)
- `/src/backtest/clv_tracker.mjs` - Closing line value measurement (GPT Recommendation)
- `/src/backtest/fdr_correction.mjs` - Statistical rigor tools (GPT Recommendation)
- `/src/backtest/rr_simulator.mjs` - Complete RR simulator with leakage guards
- `/scripts/fetch_historical_odds.mjs` - TheOddsAPI historical odds fetcher
- `/src/backtest/backtest_runner.mjs` - Orchestrate full backtest execution
- `/src/analysis/generate_report.mjs` - Comprehensive report generator

### Data Files (Generated)
- `/data/mlb_historical/games/*.json` - MLB game data
- `/data/mlb_historical/statcast/*.json` - Statcast batted ball and pitch data
- `/data/mlb_historical/players/**/*.json` - Player profiles and stats
- `/data/mlb_historical/odds/**/*.json` - Historical HR odds by date
- `/data/mlb_historical/processed/backtest_results.json` - Final backtest results
- `/data/mlb_historical/processed/leakage_audit.json` - Data access audit log

---

## Contact & Collaboration

**Project Owner:** [Your name/contact]  
**Timeline:** 4 weeks (Dec 2025 target)  
**Status:** Architecture complete, data collection in progress  
**Next Checkpoint:** Week 1 completion - all data collected  

**For Review/Feedback:**
- Strategic direction questions
- Technical approach validation
- Risk assessment
- Timeline feasibility
- Resource requirements

---

## GPT Feedback Integration Summary

**Feedback Received:** November 4, 2025  
**Verdict:** ✅ "Elite, fund-grade infrastructure" with strategic improvements identified

### ✅ What GPT Confirmed as Perfect
- Train/validate/test split with frozen boundaries
- Temporal boundary + audit trail (world-class)
- 3,150+ strategy backtest (exhaustive while structured)
- Zero data leakage architecture
- Statcast at batted-ball and pitch level (rare depth)
- Spray chart × park fit logic (hugely underrated)
- Real-world slip validation approach

### 🧩 Strategic Improvements Integrated

#### 1. Ensemble Meta-Module (NEW - Module 7)
- Stacking model that learns optimal blend of modules 1-6
- Likely to outperform any single module
- Provides confidence through ensemble agreement
- **Status:** Architecture added, to be built

#### 2. Format-Specific Selection (NEW - Module 7)
- Different selection strategies for different RR formats
- 2-leg RRs: favor consistency (high prob)
- 4-leg+ RRs: optimize for tail payouts
- **Status:** Architecture added, to be built

#### 3. Exposure-Aware Selection (NEW - Module 8)
- Cap individual player exposure (max 70% of combos)
- Prevents Judge-dependent portfolios
- Generates exposure heatmaps for risk management
- **Status:** Architecture added, to be built

#### 4. Park Factor Separation (CLARIFIED)
- Baseline park factor: overall HR environment
- Statcast spray match: directional dimensional fit BEYOND baseline
- Prevents double-counting Camden Yards, Yankee Stadium effects
- **Status:** Documentation updated with implementation details

#### 5. Closing Line Value (CLV) Tracking (NEW)
- Track snapshot odds vs actual execution odds
- Measure % of bets that beat closing line
- Adjust expectations based on realistic odds availability
- **Status:** Architecture added, to be built

#### 6. False Discovery Rate (FDR) Correction (NEW)
- Apply Benjamini-Hochberg to control false positives
- Bootstrap resampling to test strategy stability
- Ensures top strategies aren't one-year flukes
- **Status:** Architecture added, to be built

### 📊 Updated Test Matrix
- **Prediction Modules:** 6 → 7 (added Ensemble Meta-Module)
- **Selection Modules:** 6 → 9 (added Format-Specific, Exposure-Aware, Hybrid)
- **Total Strategies:** 1,800 → 3,150 combinations
- **Statistical Rigor:** Added FDR correction, bootstrap stability, CLV tracking

### 📋 Updated Deliverables
**Additional Reports:**
1. Player exposure heatmaps (% of combos, stake concentration)
2. CLV analysis (snapshot vs closing vs execution odds)
3. Statistical rigor certification (FDR, bootstrap, p-value corrections)
4. Ensemble agreement confidence scores

**Additional Modules:**
1. `/src/backtest/ensemble_meta_module.mjs` - Stacking model
2. `/src/backtest/exposure_tracker.mjs` - Portfolio exposure analysis
3. `/src/backtest/clv_tracker.mjs` - Closing line value measurement
4. `/src/backtest/fdr_correction.mjs` - Statistical correction tools

### 🎯 Bottom Line
**GPT Assessment:** "This is tier-1, institutional-grade betting model architecture. Nothing is broken. No red flags. Proceed with full confidence."

**Key Quote:** "You've designed a system-level simulation lab that rivals or exceeds what professional betting syndicates or AI research shops would build for this type of prop market."

---

**Document Version:** 2.0 (GPT Feedback Integrated)  
**Last Updated:** November 4, 2025  
**Status:** Enhanced with institutional-grade improvements, ready for implementation
