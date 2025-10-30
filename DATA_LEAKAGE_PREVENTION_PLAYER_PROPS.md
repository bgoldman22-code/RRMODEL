# Data Leakage Prevention - NBA Player Props Model

**Date**: October 30, 2025  
**Model**: NBA Player Props (Points/Rebounds/Assists)  
**Critical Requirement**: ZERO data leakage in backtest

## The Problem

Data leakage occurs when the model has access to information during training/backtesting that wouldn't be available at prediction time in production. This leads to:

- **Inflated backtest performance** (model appears better than it actually is)
- **Production disappointment** (real-world results don't match backtest)
- **False confidence** (betting real money based on fake edge)

## Our Prevention Strategy

### 1. Temporal Filtering (Core Principle)

**RULE: For any game on date D, use ONLY data from dates < D**

```javascript
// WRONG - Uses all season data
const playerAvg = allGames.filter(g => g.player === 'LeBron James')
  .reduce((sum, g) => sum + g.points, 0) / allGames.length;

// RIGHT - Uses only historical data
const playerAvgAsOfDate = allGames
  .filter(g => g.player === 'LeBron James' && g.date < gameDate)
  .reduce((sum, g) => sum + g.points, 0) / historicalGames.length;
```

### 2. Feature Engineering (Leak-Free Implementation)

**File**: `scripts/nba/build-leak-free-features.js`

**Process**:
1. Sort all games chronologically
2. For each game date D:
   - Filter to games before D
   - Calculate rolling stats (L5, L10, L20) from historical games only
   - Calculate opponent stats from historical games only
   - Tag features with `as_of_date = D`
3. Join with odds data
4. Save as time-series dataset

**Output Schema**:
```json
{
  "game_id": "0022400150",
  "date": "2024-11-15",
  "player": "LeBron James",
  "team": "LAL",
  "opponent": "GSW",
  "home": false,
  "line_points": 24.5,
  "line_rebounds": 7.5,
  "line_assists": 7.5,
  "actual_points": 28,
  "actual_rebounds": 8,
  "actual_assists": 9,
  
  "features": {
    "as_of_date": "2024-11-15",
    "games_played_season": 12,
    
    "L5_ppg": 26.4,
    "L5_rpg": 7.8,
    "L5_apg": 8.2,
    "L5_minutes": 34.2,
    "L5_usage": 28.5,
    "L5_ts_pct": 58.3,
    
    "L10_ppg": 25.8,
    "L10_rpg": 7.6,
    "L10_apg": 7.9,
    "L10_minutes": 33.8,
    "L10_usage": 28.1,
    "L10_ts_pct": 57.8,
    
    "L20_ppg": 25.2,
    "L20_rpg": 7.4,
    "L20_apg": 7.7,
    
    "season_ppg": 25.5,
    "season_rpg": 7.5,
    "season_apg": 7.8,
    
    "opponent_def_rating": 112.3,
    "opponent_pace": 99.5,
    "opponent_ppg_allowed": 115.2,
    
    "rest_days": 1,
    "home": 0,
    "back_to_back": 0
  }
}
```

**Critical**: All opponent stats (def_rating, pace, ppg_allowed) calculated from games **before** the current date.

### 3. Training/Testing (Walk-Forward Validation)

**Approach**: Progressive retraining to simulate real-world deployment

**Windows**:
```javascript
const validationWindows = [
  {
    name: 'Feb 2025',
    trainStart: '2024-10-22',
    trainEnd: '2025-01-31',
    testStart: '2025-02-01',
    testEnd: '2025-02-28'
  },
  {
    name: 'Mar 2025',
    trainStart: '2024-10-22',
    trainEnd: '2025-02-28',
    testStart: '2025-03-01',
    testEnd: '2025-03-31'
  },
  {
    name: 'Apr 2025',
    trainStart: '2024-10-22',
    trainEnd: '2025-03-31',
    testStart: '2025-04-01',
    testEnd: '2025-04-13'
  }
];
```

**Why This Works**:
- Each test month uses a model trained on all **prior** data only
- Simulates real-world retraining schedule (monthly)
- No overlap between train and test sets
- Each prediction uses features available **before** that game

### 4. Backtesting (Validation Process)

**File**: `scripts/nba/backtest-leak-free.js`

**Process**:
```javascript
for (const window of validationWindows) {
  // Train model on data before test period
  const trainData = dataset.filter(d => 
    d.date >= window.trainStart && d.date <= window.trainEnd
  );
  
  const model = trainXGBoost(trainData);
  
  // Test on future period
  const testData = dataset.filter(d => 
    d.date >= window.testStart && d.date <= window.testEnd
  );
  
  for (const game of testData) {
    // Validate: all features are from before game date
    validateNoLeakage(game.features.as_of_date, game.date);
    
    // Make prediction
    const prediction = model.predict(game.features);
    
    // Calculate edge vs Vegas line
    const edge = prediction - game.line_points;
    
    // Simulate betting decision
    if (Math.abs(edge) > 4 && confidence > 60%) {
      const result = calculateProfit(prediction, game.actual_points, game.line_points);
      results.push(result);
    }
  }
}
```

### 5. Validation Checks (Automated Guards)

**Function**: `validateNoLeakage()`
```javascript
function validateNoLeakage(featuresDate, gameDate) {
  // Ensure feature calculation date is before game date
  if (featuresDate >= gameDate) {
    throw new Error(`LEAKAGE DETECTED: Features from ${featuresDate} used for game on ${gameDate}`);
  }
  
  // Ensure features don't include the game itself
  if (featuresDate === gameDate) {
    throw new Error(`LEAKAGE: Game data included in its own features`);
  }
  
  console.log(`✅ Leak-free: Features from ${featuresDate} used for ${gameDate}`);
}
```

## Examples of Leakage to AVOID

### ❌ WRONG: Season Averages Including Future Games
```javascript
// This includes games AFTER the prediction date!
const seasonAvg = allGames
  .filter(g => g.player === player)
  .reduce((sum, g) => sum + g.points, 0) / allGames.length;
```

### ✅ RIGHT: Season Averages Up To Date
```javascript
// Only games before the prediction date
const seasonAvgAsOfDate = allGames
  .filter(g => g.player === player && g.date < predictionDate)
  .reduce((sum, g) => sum + g.points, 0) / historicalGames.length;
```

### ❌ WRONG: Opponent Defense Including Future Games
```javascript
// This includes the game we're predicting!
const oppDefense = allGames
  .filter(g => g.team === opponent)
  .reduce((sum, g) => sum + g.points_allowed, 0) / allGames.length;
```

### ✅ RIGHT: Opponent Defense Before Game
```javascript
// Only games before our prediction date
const oppDefenseAsOfDate = allGames
  .filter(g => g.team === opponent && g.date < predictionDate)
  .reduce((sum, g) => sum + g.points_allowed, 0) / historicalGames.length;
```

### ❌ WRONG: Using Entire Test Set for Feature Scaling
```javascript
// Scales using stats from the future!
const scaler = new StandardScaler();
scaler.fit(testData);
const scaledFeatures = scaler.transform(testData);
```

### ✅ RIGHT: Fit Scaler on Train Data Only
```javascript
// Fit scaler on training data
const scaler = new StandardScaler();
scaler.fit(trainData);

// Apply same scaling to test data
const scaledTestFeatures = scaler.transform(testData);
```

## Production Deployment (Naturally Leak-Free)

In production, data leakage is **impossible** because:
1. We can only access games that have already happened
2. We can only calculate features from historical data
3. We can't know future outcomes

**Production Flow**:
```javascript
// Today's date
const today = new Date();

// Fetch recent games (all from the past)
const recentGames = await fetchRecentGames(player, today);

// Calculate features (only historical data available)
const features = calculateRollingStats(recentGames, today);

// Make prediction
const prediction = model.predict(features);
```

## Verification Checklist

Before deploying model, verify:

- [ ] All features calculated using `date < gameDate` filter
- [ ] Walk-forward validation used (no train/test overlap)
- [ ] No season aggregates that include test period
- [ ] No opponent stats calculated from future games
- [ ] Feature scaling fit on train data only
- [ ] Backtest results match expected production environment
- [ ] `validateNoLeakage()` passes for all test predictions

## Expected Impact on Backtest Performance

**With leakage** (accidentally):
- Win rate: 62-65%
- ROI: 20-25%
- Sharp line overfit

**Without leakage** (honest):
- Win rate: 54-58%
- ROI: 8-15%
- Realistic edge

**If backtest is TOO good** (>60% win rate), suspect leakage!

## Benefits of Leak-Free Approach

1. **Honest metrics** - Know true predictive power
2. **Production match** - Backtest results = live results
3. **Regulatory safe** - Defensible methodology
4. **Confidence** - Can trust the edge is real
5. **Bankroll protection** - Won't bet on fake signal

## Timeline Impact

**Added time**: ~30-45 minutes for leak-free implementation  
**Worth it**: Absolutely - prevents catastrophic losses from fake edge

---

**Remember**: Better to have a model with 55% win rate that's REAL than 65% win rate that's FAKE.
