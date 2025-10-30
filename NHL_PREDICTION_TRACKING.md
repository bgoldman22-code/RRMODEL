# NHL Prediction Tracking System

## 🎯 Purpose

Automatically logs all NHL SOG predictions for:
- Historical performance analysis
- Machine learning training data
- Edge calibration validation
- Hit rate tracking by edge bucket

## 📝 How It Works

### 1. **Automatic Logging**
Every time the scanner runs, it automatically logs all predictions to Netlify Blobs:
- Player details (name, team, opponent)
- Prediction details (projection, line, side, edge)
- ZINB parameters (μ, r, π)
- Market details (odds, implied probability)
- Exposure management (adjusted units, correlation penalty)

### 2. **Result Fetching**
The next day, fetch actual game results:
```bash
curl "https://your-site.netlify.app/.netlify/functions/nhl-fetch-results?date=2025-10-30"
```

This updates predictions with:
- Actual SOG from NHL API
- Result (win/loss/push)
- Profit/loss calculation

### 3. **Performance Analysis**
View stats for any date range:
```bash
curl "https://your-site.netlify.app/.netlify/functions/nhl-prediction-stats?start=2025-10-01&end=2025-10-31"
```

Returns:
- Overall hit rate
- Hit rate by edge bucket (5-10%, 10-15%, 15-20%, 20%+)
- Total profit/loss
- ROI
- Average edge

### 4. **CSV Export for ML**
Export predictions to CSV for training:
```bash
curl "https://your-site.netlify.app/.netlify/functions/nhl-export-predictions?start=2025-10-01&end=2025-10-31" -o predictions.csv
```

CSV includes all prediction details + actual results

## 🚀 Daily Workflow

### **Before Games:**
Scanner automatically logs predictions (no action needed)

### **After Games (Next Day):**
```bash
# Fetch yesterday's results
curl "https://your-site.netlify.app/.netlify/functions/nhl-fetch-results"

# View last 30 days stats
curl "https://your-site.netlify.app/.netlify/functions/nhl-prediction-stats"
```

### **Weekly/Monthly:**
```bash
# Export to CSV for analysis
curl "https://your-site.netlify.app/.netlify/functions/nhl-export-predictions?start=2025-10-01&end=2025-10-31" -o october_predictions.csv

# Open in Excel/Python for deep analysis
python analyze_predictions.py october_predictions.csv
```

## 📊 Example Stats Output

```json
{
  "dateRange": {
    "startDate": "2025-10-01",
    "endDate": "2025-10-31"
  },
  "overall": {
    "total": 127,
    "wins": 79,
    "losses": 45,
    "pushes": 3,
    "hitRate": "63.7%",
    "profit": "18.45",
    "roi": "14.9%"
  },
  "byEdgeBucket": {
    "5-10%": {
      "count": 45,
      "hitRate": "58.7%",
      "wins": 26,
      "losses": 18
    },
    "10-15%": {
      "count": 52,
      "hitRate": "63.2%",
      "wins": 33,
      "losses": 18
    },
    "15-20%": {
      "count": 21,
      "hitRate": "71.4%",
      "wins": 15,
      "losses": 6
    },
    "20%+": {
      "count": 9,
      "hitRate": "77.8%",
      "wins": 7,
      "losses": 2
    }
  },
  "avgEdge": "12.3%"
}
```

## 🤖 ML Training Data

CSV exports include features for machine learning:
- `zinbMu`, `zinbR`, `zinbPi` - Statistical model parameters
- `projection` - Model's SOG projection
- `modelProbability` - Model's win probability
- `edge` - Calculated edge percentage
- `isHome` - Home/away indicator
- `adjustedUnits` - Correlation-adjusted bet size
- `actualSOG` - Actual result
- `result` - Win/loss/push

Perfect for training XGBoost to learn residual patterns!

## 🔧 Technical Details

**Storage:** Netlify Blobs (same as player data)
**Retention:** 90 days per prediction
**Cost:** Free tier covers ~10,000 predictions/month
**Performance:** Non-blocking (doesn't slow scanner)

## 📈 Usage Timeline

**Week 1-2:** Data collection starts (scanner logs automatically)
**Week 3-4:** Can start viewing stats (need completed games)
**Month 2:** Enough data for ML training (~500-1000 predictions)
**Month 3+:** Full historical dataset for advanced analysis

## 🎓 Pro Tips

1. **Fetch results daily** - Don't wait weeks, easier to debug issues
2. **Export monthly** - Archive CSV files for long-term storage
3. **Monitor edge calibration** - If 15% edges only hit 60%, model needs tuning
4. **Track by date added** - Compare v4.0 vs v4.1 performance

## 🚨 Important Notes

- Results only available **after games finish** (usually ~3 hours post-game)
- Predictions without results show `resultFetched: false`
- System is **automatic** - no manual logging required
- CSV format compatible with pandas/Excel/XGBoost

## 📝 Next Steps

1. **Today:** System starts logging predictions automatically
2. **Tomorrow:** Run `nhl-fetch-results` to test result fetching
3. **Week 2:** Check stats with `nhl-prediction-stats`
4. **Month 2:** Export CSV and start ML experiments

---

**Status:** ✅ ACTIVE - Logging starts with next scanner run
**Version:** v4.1-elite with prediction tracking
**Last Updated:** October 30, 2025
