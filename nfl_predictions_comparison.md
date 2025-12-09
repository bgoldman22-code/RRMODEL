# NFL Week 14 Predictions Comparison
## Generated: December 3, 2025

---

## 📊 **V1 (Complete Betting System)**
**Source**: `nfl_v1_week14_predictions.json`  
**Production URL**: https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025&week=14

### Features:
✅ **Live TheOddsAPI integration** - Real-time lines from DraftKings/FanDuel  
✅ **Edge calculations** - Model prediction vs market line comparison  
✅ **Kelly sizing** - Bankroll-based bet unit recommendations  
✅ **Injury analysis** - Canonical availability v5 with EPA impacts  
✅ **Parlay suggestions** - 2-leg, 3-leg, 4-leg smart combos  
✅ **Confidence bands** - 55-65% calibration fix applied  
✅ **Safety limits** - Edge capping, divergence flags, stake reduction  

### Sample Game (IND @ JAX):
```json
{
  "game_id": "2025_14_IND_JAX",
  "predictions": {
    "spread": {
      "pick": "IND",
      "line": -7.8,
      "predicted": -7.8,
      "edge": 7.8,
      "confidence": 68,
      "betRecommendation": "BET",
      "recommended_units": 2.125
    }
  },
  "injuryAnalysis": {
    "away": {
      "adjustments": [
        {
          "player": "Anthony Richardson Sr.",
          "position": "QB",
          "status": "out",
          "impact": 7.5,
          "epaImpact": 0.375
        }
      ]
    }
  }
}
```

---

## 🎯 **V5 (Pure Prediction Model)**
**Source**: `nfl_v5_week14_predictions.json`  
**Local Generator**: `node scripts/nfl/run-v5-local.mjs 2025 14`

### Features:
✅ **Frozen coefficients** - No refitting, deterministic output  
✅ **Rolling 8-game window** - Time-causal feature engineering  
✅ **EPA-based predictions** - Multi-feature OLS for spreads, Ridge for totals  
✅ **Spread & total models** - Separate predictions for each market  
❌ **NO live odds** - Only generates model predictions  
❌ **NO edge calculation** - Can't compare to market without real lines  
❌ **NO betting recommendations** - Just raw predictions  

### Sample Game (DAL @ DET):
```json
{
  "game_id": "2025_14_DAL_DET",
  "spread_model": {
    "predicted_spread": 5.7,
    "line": 5.7,  // ⚠️ NOT a Vegas line - just model output
    "favorite_team": "DAL",
    "confidence": 0.5,
    "features": {
      "epa_diff": 0.072,
      "success_diff": 1.476,
      "explosive_diff": 0.448,
      "hfa": 2
    }
  },
  "total_model": {
    "p50": 48.5,
    "p25": 39,
    "p75": 57
  }
}
```

---

## 🔍 **Key Differences**

| Feature | V1 (Complete System) | V5 (Pure Model) |
|---------|---------------------|----------------|
| **Live Odds** | ✅ TheOddsAPI | ❌ None |
| **Edge Calculation** | ✅ Model vs Market | ❌ No market data |
| **Bet Sizing** | ✅ Kelly criterion | ❌ None |
| **Recommended Bets** | ✅ BET/NO BET | ❌ None |
| **Injury Data** | ✅ Live ESPN + depth charts | ❌ Historical only |
| **Output** | Actionable bets | Raw predictions |
| **Use Case** | Place actual bets | Compare model to lines manually |

---

## 💡 **How to Use Both**

### **V1 - For Automated Betting:**
```bash
# Get complete betting recommendations with live odds
curl "https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025&week=14" | jq '.predictions[] | select(.predictions.spread.betRecommendation == "BET")'
```

### **V5 - For Model Analysis:**
```bash
# Generate pure predictions without odds
node scripts/nfl/run-v5-local.mjs 2025 14

# Then manually compare to your sportsbook:
# - V5 predicts DAL -5.7
# - Your book has DAL -3.5
# - Edge = 2.2 points in your favor!
```

---

## 📈 **V1 Week 14 Highlights**
- **14 games analyzed**
- **Recommended bets**: 11 spreads, 6 moneylines, 8 totals
- **Biggest edge**: BUF +17.0 vs CIN (Jake Browning starting)
- **Parlay suggestions**: 5 combos (2-leg to 4-leg)
- **Injury impacts**: 33 teams with data, 14 games affected

## 📈 **V5 Week 14 Highlights**
- **14 games generated**
- **Spread range**: [-4.5, 6.6]
- **Total range**: [42.0, 48.5]
- **Avg spread**: 1.8 pts
- **Avg total**: 46.3 pts

