# NBA Elite Betting System - Quick Reference

## 🚀 Quick Commands

```bash
# Train models
node scripts/train-nba-models.js

# Start dev server
netlify dev

# Generate predictions
curl http://localhost:8888/.netlify/functions/nba-predictions-generate

# View frontend
open http://localhost:8888/nba
```

## 📊 Feature Categories (83 Total)

| Category | Count | Key Metrics |
|----------|-------|-------------|
| **Form** | 20 | L5/L10/L20 net rating, win%, trends |
| **Pace** | 15 | Tempo, Four Factors, efficiency |
| **Shooting** | 12 | 3PT%, eFG%, TS%, shot distribution |
| **Rebounding** | 8 | OREB%, DREB%, second-chance |
| **Defense** | 10 | Opp shooting, steals, blocks |
| **Context** | 10 | Rest, B2B, travel, altitude |
| **Clutch** | 8 | Close games, 4th quarter |

## 🎯 Betting Thresholds

| Edge | Confidence | Units | Opportunity |
|------|-----------|-------|-------------|
| >10% | >70% | 5u | 🔥 ELITE |
| >7% | >60% | 4u | ⚡ STRONG |
| >5% | >55% | 3u | ✨ GOOD |
| >3% | >50% | 2u | → MODERATE |
| >2% | >45% | 1u | WEAK |

## 💰 Kelly Criterion

```
Kelly % = (bp - q) / b

Fractional Kelly (25%) = Kelly % × 0.25
Max bet size = 5% of bankroll
```

## 🧠 Model Ensemble

| Model | Weight | Purpose |
|-------|--------|---------|
| XGBoost | 50% | Feature importance, robustness |
| Neural Net | 30% | Non-linear patterns |
| Bayesian | 20% | Uncertainty quantification |

## 📈 Performance Targets

- **Spread MAE**: <5.5 points
- **Total MAE**: <7.0 points
- **Win Rate**: >52.4% (breakeven at -110)
- **ROI**: >5% (elite tier)
- **CLV**: Positive average (beating closing line)

## 🔧 API Response Structure

```json
{
  "prediction": {
    "predictedSpread": 3.2,
    "predictedTotal": 224.5,
    "homeWinProb": 62.3,
    "confidence": 73,
    "marketOdds": { "spread": 4.5, "total": 221.0 },
    "edge": {
      "spread": { "edge": 1.3, "edgePercent": 8.7 },
      "total": { "edge": 3.5, "edgePercent": 12.1 }
    },
    "recommendations": [...]
  }
}
```

## 🎨 Frontend Views

1. **Predictions**: All games with model outputs
2. **Market Inefficiencies**: Sorted by edge %
3. **Kelly Portfolio**: Optimal bet sizing
4. **Bet Ladder**: Progressive staking
5. **Analytics**: Performance insights

## ⚠️ Best Practices

✅ **DO:**
- Use fractional Kelly (0.25x)
- Shop lines across books
- Track CLV for every bet
- Retrain weekly
- Diversify bets
- Set stop-losses

❌ **DON'T:**
- Chase losses
- Bet drunk/emotional
- Ignore bankroll management
- Bet full Kelly
- Put all money on one game
- Bet without fresh data

## 📚 Key Files

```
netlify/functions/_lib/nba/
├── loaders.mjs        # Data fetching
├── features.mjs       # Feature engineering
├── analytics.mjs      # Pro tools
└── models/
    ├── ensemble.mjs   # 3-model system
    └── training.mjs   # Training pipeline

data/nba/
├── teams/team-info.json
├── schedule/
└── games/

src/pages/
├── NBAPredictions.jsx
└── NBAPredictions.css
```

## 🔗 Resources

- **NBA Stats API**: https://stats.nba.com/stats/
- **TheOddsAPI**: https://the-odds-api.com/
- **Kelly Criterion**: https://en.wikipedia.org/wiki/Kelly_criterion
- **Full Docs**: See NBA-ELITE-SYSTEM-README.md

---

**Built for serious bettors. Use responsibly. 🏀**
