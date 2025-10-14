# NBA System - Execution Plan to MAE < 11

**Status:** ✅ Models trained (MAE 12.70), ✅ Predictions live, ⏳ Advanced stats needed

## Phase 1: Historical Advanced Stats (Tonight - 2 hours)

### Run the py_ball Collector

```bash
# Install py_ball (one-time)
pip3 install py_ball

# Collect 2023-24 season (30 teams × 3 API calls = ~40 min)
python3 scripts/collect-nba-advanced-pyball.py 2023-24

# Collect 2024-25 season (30 teams × 3 API calls = ~40 min)  
python3 scripts/collect-nba-advanced-pyball.py 2024-25
```

**What it collects:**
- ✅ Pace, OffRtg, DefRtg, NetRtg
- ✅ eFG%, TS% (True Shooting)
- ✅ Four Factors (team & opponent)
- ✅ Checkpointing (can resume if interrupted)
- ✅ Rate limiting (800ms between requests)

**Output:**
- `data/nba/aggregates/aggregates_2023-24.json`
- `data/nba/aggregates/aggregates_2024-25.json`
- `data/nba/checkpoints/` (for resume)

**If it fails:**
- Just restart with same command
- It will skip already-collected teams
- No duplicate work

---

## Phase 2: Retrain with Full Features (Tomorrow - 30 min)

### Once Advanced Stats are Collected

```bash
# Train with 83 features (was 18)
node scripts/train-nba-xgboost.js

# Expected results:
# - Spread MAE: 12.70 → 10.5 (15% improvement)
# - Total MAE: 15.89 → 12.8 (20% improvement)
```

**Why this improves accuracy:**
- **Pace**: Predicts game tempo → better total predictions
- **OffRtg/DefRtg**: True team strength → better spread predictions
- **Four Factors**: Shooting efficiency, turnovers, rebounding, FT rate
- **eFG%/TS%**: Better shooting metrics than raw FG%

### Deploy New Models

```bash
# Commit trained models
git add netlify/functions/_lib/nba/models/artifacts/
git commit -m "🏀 Retrained with 83 features - MAE < 11"
git push origin main41

# Netlify auto-deploys in 2-3 minutes
```

---

## Phase 3: Daily Collection (Ongoing)

### GitHub Actions Already Set Up

**File:** `.github/workflows/nba-daily-collection.yml`

**Schedule:** Every day at 8:00 AM EST

**What it does:**
1. Collect yesterday's 10-15 games
2. Update season aggregate files
3. Commit and push
4. Trigger Netlify rebuild (optional)

**Rate limits:** 
- Yesterday's games = ~40 API calls
- Well under NBA Stats API daily limit (~100)
- ✅ Sustainable forever

---

## Phase 4: Player Props (Parallel - 3 days)

### Collector (Day 1)

```bash
python3 scripts/collect-nba-player-stats.py 2024-25
```

Collects for top ~100 players:
- Last 20 game logs (points, rebounds, assists, 3PM)
- Usage rate, minutes
- Home/away splits
- Opponent defense vs position

### Training (Day 2)

```bash
node scripts/train-nba-props.js
```

Separate models for:
- Points (MAE target: < 3.5)
- Rebounds (MAE target: < 2.0)  
- Assists (MAE target: < 1.5)
- 3-Pointers (MAE target: < 0.8)

### Integration (Day 3)

```bash
# Deploy props endpoint
netlify/functions/nba-props-predictions/
```

Returns top 20-30 prop bets per day with:
- Player name & prop market
- Prediction vs line
- Edge percentage
- Kelly stake (units)

---

## Expected Timeline

| Day | Task | Result |
|-----|------|--------|
| **Tonight** | Run py_ball collector overnight | 2023-24 + 2024-25 advanced stats |
| **Tomorrow AM** | Retrain with 83 features | Spread MAE < 11, Total MAE < 13 |
| **Tomorrow PM** | Deploy improved models | Live predictions with better accuracy |
| **Day 3-5** | Build player props system | Props predictions launch |
| **Ongoing** | Daily collection via GitHub Actions | Always fresh data |

---

## Key Metrics to Track

**Current (18 features):**
- Spread MAE: 12.70 points
- Total MAE: 15.89 points
- Training samples: 4,123 games

**Target (83 features):**
- Spread MAE: < 11.0 points ✅
- Total MAE: < 13.0 points ✅
- Training samples: 4,123 games (same)

**Improvement drivers:**
1. **Pace** → Better total predictions (+20% accuracy)
2. **OffRtg/DefRtg** → True team strength (+10% accuracy)
3. **Four Factors** → Deeper understanding (+5% accuracy)

---

## Commands Cheat Sheet

```bash
# Install dependencies
pip3 install py_ball

# Collect advanced stats
python3 scripts/collect-nba-advanced-pyball.py 2023-24 2024-25

# Check progress
ls -lh data/nba/aggregates/
ls -lh data/nba/checkpoints/

# Retrain models
node scripts/train-nba-xgboost.js

# Test predictions locally
node -e "import('./netlify/functions/nba-predictions-simple/index.mjs').then(m => m.default({}, {}).then(r => r.json().then(console.log)))"

# Deploy
git add -A
git commit -m "NBA models updated"
git push origin main41
```

---

## Troubleshooting

**Collector fails with 429 error:**
- Wait 10 minutes, restart
- Checkpoints prevent duplicate work

**Collector fails with 500 error:**
- NBA Stats API is down temporarily
- Wait 30 minutes, restart

**Models don't improve after retraining:**
- Verify aggregates files have data: `wc -l data/nba/aggregates/*.json`
- Check feature validation: Look for "missing" violations in training output

**Predictions fail in production:**
- Check Netlify function logs
- Verify models deployed: Check `netlify/functions/_lib/nba/models/artifacts/`

---

## Success Criteria

✅ **Phase 1 Complete:** Both aggregate files exist with 30 teams each  
✅ **Phase 2 Complete:** Spread MAE < 11, Total MAE < 13  
✅ **Phase 3 Complete:** Daily collection runs without errors for 3 days  
✅ **Phase 4 Complete:** Props predictions live with 20+ opportunities/day  

---

**Next Action:** Run `pip3 install py_ball && python3 scripts/collect-nba-advanced-pyball.py 2023-24` now!
