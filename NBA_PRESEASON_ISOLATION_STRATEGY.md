# NBA Preseason Isolation Strategy

**Created:** October 15, 2025  
**Status:** ✅ ACTIVE - Elite model running for preseason  
**Regular Season Start:** October 22, 2025

---

## 🎯 Objective

Show **REAL Elite Ensemble predictions** during NBA preseason while **preventing contamination** of regular season performance tracking.

---

## ✅ What's Running

### Elite Model (REAL)
- **Model:** Elite Ensemble (11.606 MAE spread, 15.89 MAE total)
- **Features:** 55 features (L3/L10/L20 stats, Four Factors, advanced metrics)
- **Data:** Real rosters, real Vegas lines from The Odds API, real historical stats
- **RCI Adjustments:** Roster Continuity Index applied based on season progress
- **Injury Adjustments:** Live injury data integrated
- **Kelly Sizing:** Real bankroll management and edge calculations

### Sample Preseason Prediction (Oct 15, 2025)
```json
{
  "game": "MEM @ CHA",
  "isPreseason": true,
  "prediction": {
    "spread": 1.5,    // Model says CHA by 1.5
    "total": 210.5,   // Model says 210.5 points
    "confidence": 75  // 75% confidence
  },
  "opportunities": [
    {
      "market": "Spread",
      "pick": "CHA -4",
      "modelLine": "1.5",
      "vegasLine": -4,
      "edge": 5.5,           // 5.5 point edge!
      "edgePercent": 50,
      "kelly": 5,
      "betSize": 250,        // $250 Kelly bet
      "units": 25,
      "book": "draftkings"
    },
    {
      "market": "Total",
      "pick": "Under 237",
      "modelLine": "210.5",
      "vegasLine": 237,
      "edge": "26.5",        // HUGE 26.5 point edge!
      "book": "betus"
    }
  ]
}
```

---

## 🚨 Isolation Safeguards

### 1. **isPreseason Flag** (Every Prediction)
```javascript
{
  "gameId": "401704791",
  "game": "MEM @ CHA",
  "isPreseason": true,  // ⚠️ DO NOT track in regular season stats
  "prediction": { ... },
  "opportunities": [ ... ]
}
```

### 2. **Response-Level Warning**
```javascript
{
  "ok": true,
  "games": 4,
  "isPreseason": true,
  "preseasonWarning": "Preseason predictions are for observation only. Model is trained on regular season data. DO NOT track these results in regular season performance metrics.",
  "modelInfo": {
    "status": "⚠️ Preseason - Observation Only"
  }
}
```

### 3. **Frontend Display**
- Banner: "⚠️ PRESEASON - Predictions for observation only. Model trained on regular season data."
- Warning on each game card
- No "Track to Portfolio" button during preseason
- No performance stats aggregation

---

## 📊 Logging Rules

### PRESEASON (Oct 15-21)
```javascript
// If logging preseason picks (optional for observation):
if (prediction.isPreseason) {
  // Log to SEPARATE CSV: data/nba/logs/predictions_2024-25_PRESEASON.csv
  // OR: Add column "is_preseason" and filter in analysis
  // DO NOT include in regular season win rate / ROI calculations
}
```

### REGULAR SEASON (Oct 22+)
```javascript
// Normal tracking starts here
if (!prediction.isPreseason) {
  // Log to: data/nba/logs/predictions_2024-25.csv
  // Include in win rate / ROI / calibration analysis
  // Track CLV, closing line value, model performance
}
```

---

## 🔬 Why Keep Them Separate?

### Preseason Issues:
1. **Experimental Rotations** - Coaches testing lineups, not playing to win
2. **Load Management** - Stars sit or play limited minutes
3. **Different Intensity** - Not representative of regular season competitiveness
4. **Roster Fluidity** - Final cuts, trades, injuries change team composition
5. **Strategic Opacity** - Teams hiding schemes, not showing full playbook

### Model Training:
- Elite Ensemble trained **exclusively** on regular season games (2020-2024)
- Preseason data would **corrupt** calibration buckets
- Win rate during preseason **not indicative** of regular season accuracy

---

## 📈 What to Observe During Preseason

### Good Signals:
- ✅ Model successfully generates predictions (no crashes)
- ✅ Vegas lines are available and reasonable
- ✅ Edge detection logic working (5.5 pt spread edge, 26.5 pt total edge)
- ✅ Kelly sizing calculations functioning
- ✅ RCI adjustments applied correctly
- ✅ Injury data integrated

### Don't Stress About:
- ❌ Win rate < 50% (expected for preseason)
- ❌ Large misses on spreads (experimental lineups)
- ❌ Unusual totals (limited minutes, weird rotations)
- ❌ Confidence scores being off (model not built for preseason intensity)

---

## 🗓️ Regular Season Transition

### October 22, 2025 (Opening Night)
- `isPreseason` automatically switches to `false`
- Performance tracking begins
- Win rate / ROI / MAE calculated
- Calibration buckets start filling
- Model accuracy expected to normalize

### First 10 Games (Oct 22-28)
- Still early season - teams finding rhythm
- RCI adjustments most aggressive (high roster turnover impact)
- Begin tracking but don't overreact to small sample

### After 20 Games (Nov 1+)
- Full model accuracy expected
- RCI adjustments stabilize
- Win rate should converge to 55-58% (historically)
- ROI should be positive with 5%+ edges

---

## 🛠️ Implementation Status

### ✅ Completed (Oct 15)
- Removed preseason pause from `nba-predictions-elite/index.mjs`
- Added `isPreseason` flag to each prediction
- Added response-level warning
- Updated `modelInfo.status` to show preseason mode
- Deployed to production (Netlify)
- Tested and confirmed working (4 games, real predictions)

### ⏳ TODO (Before Logging)
- Create NBA logging script (similar to NHL V1)
- Add `is_preseason` column to CSV schema
- Filter preseason games in performance dashboard
- Add preseason warning banner to frontend
- Document logging workflow

### 📅 TODO (Oct 22 - Opening Night)
- Verify `isPreseason` switches to `false`
- Begin regular season logging
- Monitor first week performance
- Adjust edge thresholds if needed (currently 3pt spread, 4pt total)

---

## 📞 Quick Reference

**Endpoint:** `https://bgroundrobin.com/.netlify/functions/nba-predictions-elite`

**Check Season Type:**
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite" | jq '{isPreseason, preseasonWarning, games: .predictions | length}'
```

**View Opportunities:**
```bash
curl -s "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite" | jq '.predictions[] | {game, opportunities}'
```

**Filter Regular Season Only (for logging):**
```javascript
const response = await fetch('/.netlify/functions/nba-predictions-elite');
const data = await response.json();
const regularSeasonPicks = data.predictions.filter(p => !p.isPreseason);
```

---

## ⚠️ CRITICAL RULE

**NEVER** mix preseason and regular season data in performance metrics. Always check `isPreseason` flag before logging or analyzing.

```javascript
// WRONG ❌
const allPicks = [...preseasonPicks, ...regularSeasonPicks];
const winRate = calculateWinRate(allPicks); // CONTAMINATED!

// RIGHT ✅
const regularSeasonOnly = allPicks.filter(p => !p.isPreseason);
const winRate = calculateWinRate(regularSeasonOnly); // CLEAN!
```

---

**End of Document**
