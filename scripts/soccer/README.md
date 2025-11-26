# ⚽ Soccer BTTS Profile C Training Pipeline

Complete pipeline for training league-specific BTTS (Both Teams To Score) models using Dixon-Coles + Profile C methodology.

**Target Leagues**: Bundesliga 🇩🇪 | Serie A 🇮🇹

---

## 📋 Quick Start

### 1. Fetch Match Data (Free)
```bash
# Install dependencies
pip install pandas numpy requests matplotlib scipy

# Optional: Install soccerdata for enhanced stats
pip install soccerdata

# Fetch historical results and team stats
python scripts/soccer/fetch_all_leagues.py
```

**Output**:
- `data/bundesliga/historical_results.csv` (306 matches/season × 4 seasons)
- `data/bundesliga/team_stats_by_season.csv`
- `data/serie_a/historical_results.csv` (380 matches/season × 4 seasons)
- `data/serie_a/team_stats_by_season.csv`

---

### 2. Fetch Historical Odds (Paid API)

**Option A: The Odds API** (Recommended)
```bash
# Get API key from https://the-odds-api.com/
export ODDS_API_KEY=your_key_here

# Fetch historical BTTS odds
python scripts/soccer/fetch_historical_odds.py
```

**Option B: Manual Entry** (If API too expensive)
```bash
# Create templates
python scripts/soccer/fetch_historical_odds.py  # Creates templates

# Manually fill in odds from:
# - Oddsportal.com (historical archive)
# - Betfair historical data
# - Other bookmaker archives
```

**Output**:
- `data/bundesliga/closing_odds_by_match.csv`
- `data/serie_a/closing_odds_by_match.csv`

**Required Columns**:
```csv
date,home,away,season,btts_yes_close,btts_no_close,bookmaker
2023-08-18,Bayern München,Werder Bremen,2023-24,1.61,2.25,Pinnacle
2023-08-19,Borussia Dortmund,1. FC Köln,2023-24,1.50,2.65,Pinnacle
...
```

---

### 3. Train Models (Runs Both Leagues)
```bash
# Train Dixon-Coles + find profitable bands
python scripts/soccer/train_league_profile_c.py
```

**Output** (per league):
- `data/{league}/dixon_coles_params.json` - Calibrated τ parameters
- `data/{league}/profitable_bands.csv` - ROI by probability bucket
- `data/{league}/profile_c_config.json` - Kelly gates & profitable windows
- `data/{league}/backtest_visualizations.png` - Charts

---

### 4. Review Results

**Decision Criteria**:
- ✅ **Deploy** if backtest ROI > 15% AND validation ROI within 5%
- 🟡 **Monitor** if backtest ROI 10-15% AND validation within 10%
- ❌ **Skip** if backtest ROI < 10% OR validation fails

**Example Output**:
```
=============================================================
TRAINING SUMMARY
=============================================================

German Bundesliga:
  Training: 918 matches (2020-21, 2021-22, 2022-23)
  Validation: 306 matches (2023-24)
  Backtest ROI: 18.2%
  Profitable Band: [0.60, 0.72]
  Hit Rate: 71.3%

Italian Serie A:
  Training: 1140 matches (2020-21, 2021-22, 2022-23)
  Validation: 380 matches (2023-24)
  Backtest ROI: 14.5%
  Profitable Band: [0.55, 0.65]
  Hit Rate: 68.1%
```

---

## 🎯 What Each Script Does

### `fetch_all_leagues.py`
- Scrapes **openfootball** GitHub repos for match results
- Fetches **FBref** team stats via `soccerdata` library
- Calculates BTTS rates, goals/game
- Creates placeholder stats if FBref unavailable
- **100% Free**

### `fetch_historical_odds.py`
- Queries **The Odds API** for historical BTTS markets
- Prioritizes sharp bookmakers (Pinnacle, Betfair)
- Uses Shin method for vig removal
- Falls back to manual template if API unavailable
- **Requires Paid API** (~$50-100/month for historical access)

### `train_league_profile_c.py`
- **Calibrates Dixon-Coles** using maximum likelihood
- Finds **profitable probability bands** (like EPL's [0.61, 0.66])
- Sets **adaptive Kelly gates** (min edge, EV cap, stake limits)
- Generates **calibration curves** and ROI charts
- **Validates** on holdout season (2023-24)
- **Completely separate models** per league (no cross-contamination)

---

## 📊 Expected Results

### Bundesliga (High Confidence)
- **BTTS Baseline**: 58% (highest in top-5 leagues)
- **Expected ROI**: 18-25%
- **Profitable Band**: Likely [0.60-0.72] (wider than EPL)
- **Bet Frequency**: 20-30% of fixtures
- **Reasoning**: Attacking style = predictable scoring patterns

### Serie A (Moderate Confidence)
- **BTTS Baseline**: 50% (similar to EPL)
- **Expected ROI**: 12-18%
- **Profitable Band**: Likely [0.55-0.65] (EPL-like)
- **Bet Frequency**: 15-25% of fixtures
- **Reasoning**: Tactical variety = harder to model, but large sample helps

---

## 🔍 Data Quality Checks

### After `fetch_all_leagues.py`:
```python
import pandas as pd

# Bundesliga
df = pd.read_csv('data/bundesliga/historical_results.csv')
print(f"Matches: {len(df)}")
print(f"BTTS Rate: {df['btts'].mean():.1%}")  # Should be ~58%
print(f"Goals/Game: {df['total_goals'].mean():.2f}")  # Should be ~3.2

# Serie A
df = pd.read_csv('data/serie_a/historical_results.csv')
print(f"Matches: {len(df)}")
print(f"BTTS Rate: {df['btts'].mean():.1%}")  # Should be ~50%
print(f"Goals/Game: {df['total_goals'].mean():.2f}")  # Should be ~2.7
```

### After `fetch_historical_odds.py`:
```python
import pandas as pd

# Check odds coverage
df = pd.read_csv('data/bundesliga/closing_odds_by_match.csv')
print(f"Matches with odds: {len(df)}")
print(f"Bookmakers: {df['bookmaker'].value_counts()}")
print(f"Avg BTTS YES odds: {df['btts_yes_close'].mean():.2f}")  # Should be ~1.70-1.90
print(f"Avg BTTS NO odds: {df['btts_no_close'].mean():.2f}")   # Should be ~2.00-2.20
```

---

## 🚨 Common Issues & Solutions

### Issue: openfootball parsing fails
**Solution**: 
- Check GitHub repo structure (may have changed)
- Update URL patterns in `fetch_all_leagues.py`
- Manually download CSVs from openfootball as fallback

### Issue: soccerdata library errors
**Solution**:
```bash
pip install --upgrade soccerdata
# OR use placeholder stats (script auto-generates from results)
```

### Issue: The Odds API quota exceeded
**Solution**:
- Use manual template (see Option B above)
- Contact The Odds API for bulk historical export
- Use Oddsportal scraper (legal gray area)

### Issue: Dixon-Coles calibration fails
**Solution**:
- Check team names match between results & stats files
- Ensure sufficient data (min 200 matches per league)
- Increase `maxiter` in `minimize()` call

### Issue: No profitable bands found
**Solution**:
- Check odds quality (need real closing lines, not placeholders)
- Verify Shin vig removal is working
- Try lowering ROI threshold from 5% to 3%

---

## 📁 File Structure

```
data/
├── bundesliga/
│   ├── historical_results.csv              # Match results (openfootball)
│   ├── team_stats_by_season.csv            # Team stats (FBref)
│   ├── closing_odds_by_match.csv           # BTTS odds (The Odds API)
│   ├── dixon_coles_params.json             # Calibrated parameters
│   ├── profitable_bands.csv                # ROI analysis
│   ├── profile_c_config.json               # Production config
│   └── backtest_visualizations.png         # Charts
│
├── serie_a/
│   └── (same structure as bundesliga)
│
scripts/soccer/
├── fetch_all_leagues.py                    # Fetch results + stats
├── fetch_historical_odds.py                # Fetch BTTS odds
└── train_league_profile_c.py               # Train models
```

---

## 🎓 Methodology

### Dixon-Coles Model
- **Log-linear**: `log(λ_home) = baseline + home_adv + attack_home - defense_away`
- **Bivariate Poisson** with correlation adjustment (τ parameters)
- **Calibrated via MLE** on training data (2020-23)
- **League-specific** parameters (Bundesliga ≠ Serie A)

### Profile C Strategy (from EPL success)
1. **Find profitable bands**: Probability windows with ROI > 5%
2. **Set adaptive gates**: Min edge, max EV cap, Kelly fraction
3. **Validate on holdout**: 2023-24 season must confirm backtest
4. **Deploy cautiously**: Start with paper trading, monitor calibration

### Why Separate Models?
- Different **BTTS baselines** (58% vs 50%)
- Different **tactical styles** (attacking vs defensive)
- Different **Dixon-Coles τ** (low-scoring correlations vary)
- Different **profitable bands** (what works in one league may not transfer)

---

## 🔗 External Resources

### Data Sources
- **openfootball**: https://github.com/openfootball/
- **soccerdata**: https://github.com/probberechts/soccerdata
- **The Odds API**: https://the-odds-api.com/

### Theory
- **Dixon & Coles (1997)**: "Modelling Association Football Scores"
- **Shin (1991)**: "Measuring the Incidence of Insider Trading"
- **Kelly Criterion**: Optimal bet sizing under uncertainty

### Similar Projects
- **EPL Profile C**: 27.5% ROI using probability band [0.61, 0.66]
- **UCL Quick Fix**: 37.5% baseline correction + 25% domestic discount

---

## ✅ Next Steps After Training

1. **If ROI > 15%**: Deploy to production
   - Build `bundesliga-profile-c.mjs` module
   - Integrate with `soccer-btts-predictions.js`
   - Paper trade for 2 weeks before going live

2. **If ROI 10-15%**: Monitor closely
   - Deploy with reduced stakes (1-2 units max)
   - Track calibration weekly
   - Recalibrate if performance drifts

3. **If ROI < 10%**: Don't deploy
   - Investigate: data quality? model assumptions? market efficiency?
   - Try alternate approaches (team-specific adjustments, xG models)
   - Consider league is too efficient for edge

---

## 💰 Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| **openfootball data** | $0 | Free GitHub repo |
| **soccerdata library** | $0 | Open source Python package |
| **The Odds API** | $50-100/mo | Historical access required |
| **Compute** | $0 | Runs locally in ~10 minutes |
| **Total** | **$50-100** | One-time for historical data |

**Tip**: The Odds API historical data is one-time purchase per league. After fetching, you can cancel subscription.

---

## 📞 Support

**Issues?**
- Check data files exist and have correct format
- Verify API key is set: `echo $ODDS_API_KEY`
- Run scripts with `-v` flag for verbose output
- Review backtest visualizations for obvious problems

**Questions?**
- See `BUNDESLIGA_PROFILE_C_PLAN.md` for detailed methodology
- See `LEAGUE_PRIORITY_MATRIX.md` for league comparisons
- See `UCL_LONGTERMFIX.md` for similar multi-league approach

---

**Status**: ✅ Scripts ready, awaiting odds data  
**Priority**: HIGH (Bundesliga + Serie A are top-tier candidates)  
**ETA**: 3 weeks (1 week data + 2 weeks validation)
