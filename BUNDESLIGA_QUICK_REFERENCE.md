# Bundesliga BTTS - Quick Reference Card

## 🚀 Production Endpoint

**URL**: `https://YOUR-SITE.netlify.app/.netlify/functions/bundesliga-btts-predict`

**Method**: `POST`

**Request (Auto-Fetch)**:
```json
{
  "auto_fetch": true
}
```

**Response**:
```json
{
  "model": "Bundesliga BTTS Ensemble v1.0",
  "validation_roi": 0.212,
  "hit_rate": 0.806,
  "total_predictions": 5,
  "recommended_bets": 2,
  "bets": [...]
}
```

---

## 🔑 Environment Variable Required

**In Netlify Dashboard** → Site Settings → Environment Variables:

```
Name: ODDS_API_KEY
Value: <your-api-key-from-the-odds-api.com>
Scope: Production
```

**Without this variable**: Function falls back to manual fixtures mode only.

---

## 📊 Model Performance

| Metric | Training | Validation |
|--------|----------|------------|
| **ROI** | 16.1% | **21.2%** |
| **Hit Rate** | 75.3% | **80.6%** |
| **Log Loss** | 0.5832 | 0.5945 |
| **AUC** | 0.741 | 0.760 |

**Ensemble Weights**: 77.4% XGBoost + 22.6% Dixon-Coles

---

## 🎯 Betting Gates

All bets must pass these filters:

1. ✅ **Min Edge**: ≥5% (model prob - market prob)
2. ✅ **Max EV Cap**: ≤20% (prevents outliers)
3. ✅ **Min Odds**: ≥1.40 (avoid heavy favorites)
4. ✅ **Kelly Stake**: 25% fractional, capped at 3% bankroll

**Example**:
- Model: 72% BTTS probability
- Market: 57% (odds 1.75)
- Edge: 15% ✅
- Stake: 2.8% of bankroll

---

## 📁 Key Files

### Production
```
netlify/functions/bundesliga-btts-predict.mjs    # API endpoint
scripts/soccer/predict_live_bundesliga.py        # Prediction engine
data/bundesliga/ensemble_model.json              # Model weights
data/bundesliga/dixon_coles_model.json           # Team ratings
data/bundesliga/xgboost_model.json               # Feature importance
data/bundesliga/matches_with_features.csv        # Historical data
```

### Documentation
```
BUNDESLIGA_TRAINING_TO_PRODUCTION.md    # Complete guide
BUNDESLIGA_LIVE_PRODUCTION_FLOW.md      # Architecture & API details
SOCCER_BTTS_TRAINING_SUMMARY.md         # Training results
SOCCER_MODEL_ARCHIVE_INDEX.md           # Master index
```

---

## 🧪 Test Commands

### Local Development
```bash
# Test with sample data
node scripts/soccer/fetch_and_predict_bundesliga.mjs

# Test Python directly
echo '{"fixtures": [{"home_team": "Bayern", "away_team": "Dortmund", "odds": {"btts_yes": 1.65, "btts_no": 2.20}}]}' | python3 scripts/soccer/predict_live_bundesliga.py
```

### Production
```bash
# Test auto-fetch
curl -X POST https://your-site.netlify.app/.netlify/functions/bundesliga-btts-predict \
  -H "Content-Type: application/json" \
  -d '{"auto_fetch": true}'

# Test manual fixtures
curl -X POST https://your-site.netlify.app/.netlify/functions/bundesliga-btts-predict \
  -H "Content-Type: application/json" \
  -d '{"fixtures": [{"home_team": "Bayern München", "away_team": "Dortmund", "odds": {"btts_yes": 1.65, "btts_no": 2.20}}]}'
```

---

## 🔄 Update Workflow

### When to Retrain

**Monthly** (recommended):
```bash
# Collect latest data
python3 scripts/soccer/collect_bundesliga_data.py

# Retrain models
python3 scripts/soccer/train_multimodel_comparison.py

# Review performance
cat data/bundesliga/model_comparison_report.md

# If ROI > 15%, deploy new models
git add data/bundesliga/*.json
git commit -m "Update Bundesliga models - Month X"
git push
```

**Triggers for retraining**:
- ✅ New season starts
- ✅ Monthly (collect 30+ new matches)
- ⚠️ Validation ROI drops below 10%
- ⚠️ Edge detection rate < 5%

---

## 💰 API Costs

| Usage Pattern | Requests/Day | Monthly Cost |
|---------------|--------------|--------------|
| Cached (6hr) | 4 | ~$5 |
| Hourly updates | 24 | ~$30 |
| Real-time | 100+ | ~$150-300 |

**Optimization**: Set `Cache-Control: max-age=3600` (1 hour)

---

## 🚨 Monitoring

### Check API Quota
```bash
curl -I "https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds/?apiKey=$ODDS_API_KEY&regions=eu&markets=btts" | grep "x-requests-remaining"
```

### View Function Logs
```bash
netlify functions:log bundesliga-btts-predict
```

### Health Check
```bash
# Should return predictions
curl -X POST https://your-site.netlify.app/.netlify/functions/bundesliga-btts-predict \
  -d '{"auto_fetch": true}' \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n"
```

---

## 🎓 How It Works

```
1. FETCH ODDS
   └─► The Odds API: Get upcoming Bundesliga fixtures + BTTS odds

2. CALCULATE FEATURES (44 per match)
   ├─► Home form (last 5): goals, BTTS rate, avg total
   ├─► Away form (last 5): goals, BTTS rate, avg total
   ├─► Season stats: games, goals for/against, win rate
   ├─► H2H (last 5): BTTS rate, avg goals
   └─► Derived: combined form, strength differentials

3. DIXON-COLES PREDICTION
   └─► Poisson model: λ_home, λ_away → P(BTTS)

4. XGBOOST PREDICTION
   └─► Gradient boosting on 44 features → P(BTTS)

5. ENSEMBLE COMBINATION
   └─► 77.4% × XGB + 22.6% × DC = Final P(BTTS)

6. BETTING GATES
   ├─► Edge = Model - Market
   ├─► Check: Edge ≥ 5%? EV ≤ 20%? Odds ≥ 1.40?
   └─► If pass: Kelly stake = 25% × (edge / (odds - 1))

7. RETURN RECOMMENDATIONS
   └─► JSON with predictions + filtered bets
```

---

## ✅ Deployment Checklist

- [ ] `ODDS_API_KEY` set in Netlify
- [ ] Models deployed (`ensemble_model.json`, etc.)
- [ ] Historical data deployed (`matches_with_features.csv`)
- [ ] Python dependencies installed
- [ ] Netlify function tested locally
- [ ] Production endpoint tested
- [ ] Caching configured (1-6 hours)
- [ ] Monitoring set up
- [ ] Documentation reviewed

---

## 📞 Support

**Training Issues**: See `scripts/soccer/train_multimodel_comparison.py`  
**Prediction Issues**: See `scripts/soccer/predict_live_bundesliga.py`  
**API Issues**: Check The Odds API status  
**Deployment Issues**: Check Netlify function logs  

**Full Documentation**: `BUNDESLIGA_TRAINING_TO_PRODUCTION.md`

---

**Last Updated**: December 1, 2025  
**Model Version**: v1.0 (21.2% validation ROI)  
**Status**: ✅ Production Ready
