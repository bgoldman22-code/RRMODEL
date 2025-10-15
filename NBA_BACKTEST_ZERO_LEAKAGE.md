# 🔬 NBA RCI Backtest - Zero Leakage Analysis

## ❌ CURRENT PROBLEM: Data Leakage

### **How Production Works (ZERO Leakage ✅):**
```javascript
// Production: Predicting FUTURE games
1. Fetch TODAY's upcoming games (not started yet)
2. Load historical games (games_2024_25.json - only past games)
3. Calculate L3, L10, L20 from HISTORICAL GAMES ONLY
4. Apply RCI adjustments (based on offseason roster changes)
5. Fetch CURRENT injuries (real-time from ESPN)
6. Make prediction for upcoming game
```

**No leakage because:**
- Historical data stops BEFORE the game we're predicting
- RCI based on offseason moves (known before season starts)
- Injuries fetched in real-time (current status before game)
- We NEVER see the game result we're predicting

---

### **How Naive Backtest Would Work (MASSIVE Leakage ❌):**
```javascript
// BAD APPROACH: Using future data
1. Load ALL 2024-25 games (including games we want to test)
2. For game on 2024-11-15:
   - Calculate L10 using games AFTER 2024-11-15 ❌❌❌
   - RCI includes trades that happened AFTER 2024-11-15 ❌❌❌
   - Injuries from AFTER the game ❌❌❌
3. Predict game we already know the result of
```

**Leakage sources:**
- ❌ Future games in rolling windows (L3, L10, L20)
- ❌ Future roster moves in RCI
- ❌ Using final-season RCI instead of start-of-season
- ❌ Knowing which injuries to include

---

## ✅ ZERO-LEAKAGE BACKTEST DESIGN

### **Proper Time-Travel Simulation:**

```javascript
// For each historical game to test:
function backtestGame(targetDate, homeTeam, awayTeam) {
  
  // 1. TIME CUTOFF: Only use data BEFORE target date
  const historicalGames = allGames.filter(g => 
    new Date(g.date) < new Date(targetDate)
  );
  
  // 2. RCI: Use START-OF-SEASON values (no future trades)
  const seasonStart = getSeasonStart(targetDate);
  const rciData = calculateRCIAsOf(seasonStart); // Fixed at season start
  
  // 3. INJURIES: Historical snapshot from day before game
  const injuries = getInjuriesAsOf(targetDate - 1); // Day before game
  
  // 4. ROLLING WINDOWS: Only past games
  const homeL10 = calculateStats(
    historicalGames.filter(g => g.teamId === homeTeam),
    10
  );
  
  // 5. PREDICT: Never see actual result
  const prediction = makePrediction(homeL10, awayL10, rciData, injuries);
  
  // 6. EVALUATE: Compare to actual result (loaded separately)
  const actual = getActualResult(targetDate, homeTeam, awayTeam);
  const error = Math.abs(prediction.spread - actual.spread);
  
  return { prediction, actual, error };
}
```

---

## 🎯 Specific Leakage Prevention

### **1. Rolling Windows (L3, L10, L20)**
```javascript
// ❌ WRONG: Uses future games
const homeL10 = calculateAdvancedStats(allGames, homeId, 10);

// ✅ CORRECT: Time-bounded
const homeL10 = calculateAdvancedStats(
  allGames.filter(g => g.date < targetDate && g.date >= targetDate - 30),
  homeId,
  10
);
```

### **2. RCI Values**
```javascript
// ❌ WRONG: Uses mid-season RCI (includes December trades)
const rci = getCurrentRCI(homeTeam); // RCI at end of season

// ✅ CORRECT: Uses start-of-season RCI only
const rci = getRCIAsOf('2024-10-22', homeTeam); // Opening night RCI
```

### **3. Injury Data**
```javascript
// ❌ WRONG: Uses current injuries or historical archive
const injuries = getCurrentInjuries(homeTeam);

// ✅ CORRECT: Point-in-time snapshot
const injuries = getInjuriesAsOf(targetDate - 1, homeTeam);
```

### **4. Chemistry Decay**
```javascript
// ❌ WRONG: Uses total games played in season
const gamesPlayed = 50; // Season total

// ✅ CORRECT: Games played BEFORE target date
const gamesPlayed = historicalGames.filter(g => 
  g.teamId === homeTeam && 
  g.date < targetDate
).length;
```

---

## 📊 Implementation Plan

### **Step 1: Build Time-Travel Data Loader**
```javascript
// /scripts/nba/backtest/load-historical-data.mjs

export function getDataAsOf(targetDate) {
  return {
    // Only games before target date
    games: loadGames().filter(g => g.date < targetDate),
    
    // RCI from season start (fixed)
    rci: loadRCIAtSeasonStart(targetDate),
    
    // Injuries from day before (if available)
    injuries: loadInjuriesSnapshot(targetDate - 1),
    
    // No future information
    cutoffDate: targetDate
  };
}
```

### **Step 2: Validate No Leakage**
```javascript
// Sanity checks
function validateNoLeakage(data, targetDate) {
  // Check 1: No games after target date
  const futureGames = data.games.filter(g => g.date >= targetDate);
  if (futureGames.length > 0) {
    throw new Error('LEAKAGE: Future games detected');
  }
  
  // Check 2: RCI date <= target date
  if (data.rci.calculatedDate > targetDate) {
    throw new Error('LEAKAGE: RCI from future');
  }
  
  // Check 3: Injury data date < target date
  if (data.injuries.snapshotDate >= targetDate) {
    throw new Error('LEAKAGE: Future injury data');
  }
  
  return true;
}
```

### **Step 3: Run Backtest**
```javascript
// For each game in test set
const results = [];

for (const testGame of testGames) {
  // Load data as of day before game
  const data = getDataAsOf(testGame.date);
  
  // Validate no leakage
  validateNoLeakage(data, testGame.date);
  
  // Calculate stats (only from past games)
  const homeL10 = calculateStats(data.games, testGame.homeId, 10);
  const awayL10 = calculateStats(data.games, testGame.awayId, 10);
  
  // Apply RCI (from season start only)
  const gamesPlayed = data.games.filter(g => 
    g.teamId === testGame.homeId
  ).length;
  
  const homeAdjusted = applyRCIAdjustment(
    homeL10, 
    testGame.homeTeam, 
    gamesPlayed
  );
  
  // Apply injuries (from snapshot)
  const homeWithInjuries = applyInjuryAdjustment(
    homeAdjusted,
    data.injuries.filter(i => i.team === testGame.homeTeam)
  );
  
  // Predict
  const prediction = predict(homeWithInjuries, awayWithInjuries);
  
  // Evaluate (actual result loaded separately)
  const actual = testGame.actualResult;
  const error = Math.abs(prediction.spread - actual.spread);
  
  results.push({ prediction, actual, error });
}

// Calculate MAE
const mae = results.reduce((sum, r) => sum + r.error, 0) / results.length;
```

---

## 🚨 Challenges for NBA Backtest

### **Data Availability:**

1. **Historical Games** ✅
   - We have games_2024_25.json
   - Can filter by date easily
   - NO LEAKAGE RISK

2. **RCI Values** ⚠️
   - We have current RCI (2025-26 season)
   - We have historical rosters (2021-25)
   - Can reconstruct RCI for any past season
   - **Need to recalculate for each season start**

3. **Injury Data** ❌
   - ESPN API only returns CURRENT injuries
   - No historical injury snapshots available
   - **MAJOR PROBLEM**

### **Injury Data Problem:**

```javascript
// What we need:
const injuries_2024_11_15 = getInjuriesAsOf('2024-11-15');

// What we have:
const injuries_2025_10_14 = getCurrentInjuries(); // Only today's data

// Solution options:
// 1. Skip injury layer for backtest (RCI only)
// 2. Scrape historical injury data from other sources
// 3. Use injury reports from game recaps (manual)
// 4. Run "RCI-only" backtest first, add injuries later
```

---

## ✅ ZERO-LEAKAGE BACKTEST: Feasibility

### **What We CAN Backtest (No Leakage):**

✅ **RCI System**
- Reconstruct start-of-season rosters for 2024-25, 2023-24, 2022-23
- Calculate RCI as of opening night each season
- Apply chemistry decay based on games played BEFORE target date
- **ZERO LEAKAGE POSSIBLE**

✅ **Baseline Model**
- Calculate L3, L10, L20 using only games before target date
- No RCI, no injuries (pure historical stats)
- **ZERO LEAKAGE POSSIBLE**

### **What We CANNOT Backtest (Data Unavailable):**

❌ **Injury System**
- No historical injury snapshots from ESPN
- Would need to scrape from Basketball-Reference or other sources
- Extremely time-consuming
- **Skip for Phase 2, add in Phase 3**

---

## 🎯 RECOMMENDED APPROACH

### **Phase 2a: RCI-Only Backtest (ZERO Leakage)**
```javascript
// Test RCI system on 2024-25 early season

for (const game of earlySeasonGames) {
  // 1. Get games before target date
  const pastGames = allGames.filter(g => g.date < game.date);
  
  // 2. Calculate raw stats (no leakage)
  const homeL10 = calculateStats(pastGames, game.homeId, 10);
  
  // 3. Get RCI from season start (fixed value)
  const rci = seasonStartRCI[game.homeTeam]; // Calculated once on Oct 22
  
  // 4. Calculate games played before target
  const gamesPlayed = pastGames.filter(g => 
    g.teamId === game.homeId
  ).length;
  
  // 5. Apply RCI with proper chemistry decay
  const adjusted = applyRCIAdjustment(homeL10, game.homeTeam, gamesPlayed);
  
  // 6. Predict and measure error
  const prediction = predict(adjusted, ...);
  const error = Math.abs(prediction.spread - game.actualSpread);
}
```

### **Phase 2b: Baseline Comparison**
```javascript
// Same games, NO RCI adjustments
const baselineMAE = calculateBaselineMAE(earlySeasonGames);
const rciMAE = calculateRCIMAE(earlySeasonGames);

console.log('Improvement:', baselineMAE - rciMAE);
```

### **Phase 3: Add Injuries (When Data Available)**
```javascript
// Scrape historical injury data
// Add injury layer to backtest
// Measure RCI + Injury combined improvement
```

---

## 🔍 Validation Checklist

### **Before Running Backtest:**
- [ ] Verify no games after target date in dataset
- [ ] Verify RCI values fixed at season start
- [ ] Verify games_played counted only before target
- [ ] Verify no future roster moves included
- [ ] Verify chemistry decay uses correct game count
- [ ] Run sanity checks on sample games

### **During Backtest:**
- [ ] Log every data source with timestamps
- [ ] Assert no future data at each step
- [ ] Compare predictions to actual results AFTER prediction made
- [ ] Track which games skipped due to insufficient data

### **After Backtest:**
- [ ] Verify MAE makes sense (should be ~11.6 baseline)
- [ ] Check RCI improves early season (games 1-10)
- [ ] Verify improvement fades by game 20
- [ ] Validate no overfitting

---

## 📝 Summary

### **Can We Backtest With Zero Leakage?**

**YES** ✅ - But with caveats:

| Component | Backtest Feasible | Leakage Risk | Data Available |
|-----------|------------------|--------------|----------------|
| **Baseline Model** | ✅ Yes | None | ✅ Yes |
| **RCI System** | ✅ Yes | None | ✅ Yes |
| **Rolling Windows** | ✅ Yes | Low (if filtered) | ✅ Yes |
| **Chemistry Decay** | ✅ Yes | Low (if counted correctly) | ✅ Yes |
| **Injury System** | ❌ Limited | N/A | ❌ No historical data |

### **Recommended Timeline:**

1. **Now (Oct 14):** Build time-travel data loader with leakage checks
2. **Oct 22-Nov 15:** Collect live data for future backtests
3. **Nov 15:** Run RCI-only backtest on 2024-25 early season
4. **Nov 22:** Optimize RCI parameters based on results
5. **Dec 1:** Add injury data collection for Phase 3
6. **Jan 2026:** Full RCI + Injury backtest with historical injury data

---

**ANSWER:** Yes, we can backtest RCI with ZERO leakage. Injury layer requires historical data we don't have yet, so we'll backtest RCI-only first, then add injuries later.

---

*The key is proper time-travel simulation: pretend you're making predictions in the past with only the information you would have had at that moment.* 🕰️
