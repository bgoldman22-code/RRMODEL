# 🚀 V5 Quick Start - Week 11 Predictions

**TL;DR:** Generate THIS WEEKEND's NFL predictions in 30 seconds.

---

## 📅 Generate Week 11 Predictions (NOW)

```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL/nfl-model-v4.1

# Generate predictions
node scripts/generate-v5-week.mjs --season 2025 --week 11

# View output
cat output/bundle_v5_2025_week11.json | jq '.games[] | {
  matchup: (.away_team + "@" + .home_team),
  spread: .spread_model.predicted_spread,
  favorite: .spread_model.favorite_team,
  total: .total_model.p50
}'
```

**Output location:** `output/bundle_v5_2025_week11.json`

---

## 🎯 What You Get

**15 Games This Weekend:**
```
NYJ @ NE:  NE -5.6, Total 46.5
WAS @ MIA: MIA -1.6, Total 44.5
CAR @ ATL: ATL -1.1, Total 44.0
TB @ BUF:  TB -5.2, Total 47.0
LAC @ JAX: JAX +1.4, Total 47.5
CHI @ MIN: MIN -0.1, Total 47.0
GB @ NYG:  NYG +1.0, Total 48.0
HOU @ TEN: TEN +6.3, Total 43.5
CIN @ PIT: PIT -2.0, Total 47.0
SF @ ARI:  ARI +1.4, Total 48.0
SEA @ LA:  LA -2.7, Total 48.5
BAL @ CLE: CLE +4.3, Total 45.0
KC @ DEN:  DEN +1.1, Total 46.0
DET @ PHI: PHI +3.0, Total 45.5
DAL @ LV:  LV +1.8, Total 47.0
```

---

## 📊 Deploy to Live Site

```bash
# 1. Copy bundle to Netlify data location
cp output/bundle_v5_2025_week11.json \
   netlify/data/nfl/2025/bundle_v5_2025_week11.json

# 2. Commit & deploy
git add netlify/data/nfl/2025/bundle_v5_2025_week11.json
git commit -m "🏈 V5 Week 11 predictions - 15 games"
git push origin main

# 3. Verify on site
# Visit: https://yoursite.netlify.app/nfl-v5
```

---

## 🧪 Validate Historical Accuracy

Want to check how good the model is? Test on last week:

```bash
# Generate historical predictions with actual scores
node scripts/generate-v5-week.mjs --season 2024 --week 9 --historical

# View prediction errors
cat output/bundle_v5_2024_week9.json | jq '.games[] | {
  game: (.away_team + "@" + .home_team),
  pred_spread: .spread_model.predicted_spread,
  actual_margin: .actual.margin,
  spread_error: (.spread_model.predicted_spread - .actual.margin | fabs),
  pred_total: .total_model.p50,
  actual_total: .actual.total,
  total_error: (.total_model.p50 - .actual.total | fabs)
}'
```

**Expected Performance:**
- Spread MAE: ~10-11 points
- Total MAE: ~10-11 points

---

## 🔄 Weekly Workflow

Every week:

```bash
# Step 1: Generate predictions for upcoming week
node scripts/generate-v5-week.mjs --season 2025 --week [WEEK]

# Step 2: Review sanity checks in terminal output
# - Spreads should be -8 to +8 points
# - Totals should be 40-52 points

# Step 3: Deploy to Netlify
cp output/bundle_v5_2025_week[WEEK].json \
   netlify/data/nfl/2025/bundle_v5_2025_week[WEEK].json
git add . && git commit -m "Week [WEEK] predictions" && git push
```

---

## ❓ Troubleshooting

### "No games found for week X"
```bash
# Check if schedule exists
ls netlify/data/nfl/2025/schedule.full.json

# Check if week is in schedule
cat netlify/data/nfl/2025/schedule.full.json | jq '.weeks["11"]'
```

### "Failed to load aggregates"
```bash
# Check if historical data exists
ls nfl-model-v3/data/nflverse/game_aggregates_2025.json

# Verify aggregates have data through Week 10
cat nfl-model-v3/data/nflverse/game_aggregates_2025.json | \
  jq '[.[] | .week] | max'
```

### Predictions look weird (all same value)
```bash
# Check rolling metrics have enough data
# Need at least 8-10 prior weeks for good predictions

# Verify data coverage
cat nfl-model-v3/data/nflverse/game_aggregates_2025.json | \
  jq 'group_by(.week) | map({week: .[0].week, games: length})'
```

---

## 📖 Full Documentation

- **Complete Pipeline Details:** `V5_UNIFIED_PIPELINE_COMPLETE.md`
- **Manual Testing Guide:** `V5_MANUAL_TESTING_GUIDE.md`
- **Original Deployment:** `BUILD_SUMMARY.md`

---

## 🎯 Next Week Checklist

- [ ] Generate Week 12 predictions
- [ ] Review spread/total ranges (sanity check)
- [ ] Deploy to Netlify
- [ ] Verify frontend shows new week
- [ ] (Optional) Backtest previous week for accuracy

---

**Need help?** All commands assume you're in `/RRMODEL/nfl-model-v4.1/` directory.
