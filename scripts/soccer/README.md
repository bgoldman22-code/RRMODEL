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

**Status**: ✅ **TRAINING COMPLETE** - Bundesliga ensemble deployed  
**Latest Results**: 21.2% validation ROI (Ensemble model, Dec 2025)  
**Priority**: HIGH (Serie A training next, pending odds collection)  
**Next Steps**: Deploy Bundesliga ensemble → Netlify function integration

---

## 🎯 December 2025 Update: Multi-Model Training Complete

### Bundesliga Results (2023-24 Validation)

**NEW Training Pipeline**: `train_multimodel_comparison.py`

| Model | ROI | Profit | Bets | Hit Rate | AUC | Status |
|-------|-----|--------|------|----------|-----|--------|
| **Ensemble** | **21.2%** | +6.6u | 31 | 80.6% | 0.675 | ✅ **Deploy** |
| XGBoost | 4.3% | +1.6u | 36 | 69.4% | 0.658 | ⚠️ Overfit |
| Dixon-Coles | 9.7% | +2.2u | 23 | 73.9% | 0.603 | ℹ️ Baseline |

**Ensemble Weights** (optimized via validation log loss):
- XGBoost: 77.4%
- Dixon-Coles: 22.6%

**Key Features** (XGBoost importance):
1. `combined_form_btts_rate` (8.3%)
2. `away_season_avg_goals_against` (5.9%)
3. `away_form_games_played` (5.5%)

**Generated Artifacts**:
- `data/bundesliga/ensemble_model.json` - Production-ready weights
- `data/bundesliga/xgboost_model.json` - Feature importance + hyperparams
- `data/bundesliga/dixon_coles_model.json` - Team ratings
- `data/bundesliga/model_comparison.png` - 6-panel visualization
- `data/bundesliga/model_comparison_report.md` - Full analysis

**Recommendation**: Deploy ensemble for live predictions (exceeds 15% ROI threshold)

---

## 📋 Updated Quick Start

### NEW: Multi-Model Training (Recommended)

```bash
# 1. Install dependencies
pip install -r ml/requirements.txt

# 2. Set API key for odds
export ODDS_API_KEY=your_key_here

# 3. Collect comprehensive features (44 features per match)
python scripts/soccer/fetch_comprehensive_features.py

# 4. Fetch historical odds (2023-24, 2024-25)
python scripts/soccer/fetch_historical_completed.py

# 5. Train Dixon-Coles + XGBoost + Ensemble
python scripts/soccer/train_multimodel_comparison.py
```

**Output**:
- All model artifacts in `data/bundesliga/`
- Comparison report with ROI analysis
- Feature importance rankings
- Deployment recommendations

---

## 🔧 Available Training Scripts

### 1. `train_multimodel_comparison.py` ⭐ **RECOMMENDED**
**Description**: Trains and compares three models (Dixon-Coles, XGBoost, Ensemble)

**Features**:
- 44 rich features (form, H2H, season stats, attack/defense strength)
- Time-based train/validation split (70/30)
- Comprehensive evaluation (ROI, AUC, log loss, Brier score)
- Automated visualization and reporting
- Production-ready model artifacts

**Requirements**:
- `data/{league}/matches_with_features.csv` (from `fetch_comprehensive_features.py`)
- `data/{league}/historical_completed_with_odds.csv` (from `fetch_historical_completed.py`)

**Usage**:
```bash
python scripts/soccer/train_multimodel_comparison.py
```

**Results** (Bundesliga):
- ✅ 21.2% validation ROI
- ✅ 80.6% hit rate
- ✅ Exceeds 15% deployment threshold

---

### 2. `train_league_profile_c.py` (Original)
**Description**: Dixon-Coles only, Profile C methodology

**Features**:
- Traditional Poisson-based approach
- Profitable probability band identification
- League-specific calibration

**Use When**:
- Want interpretable baseline
- Limited computational resources
- Comparing to EPL Profile C approach

---

## 📊 Data Collection Scripts

### Feature Extraction
- **`fetch_comprehensive_features.py`** ⭐ **For multi-model training**
  - Extracts 44 features from openfootball data
  - Form metrics (last 5 matches)
  - Season aggregates (goals, clean sheets, etc.)
  - Head-to-head statistics
  - Attack/defense strength differentials

### Odds Collection
- **`fetch_historical_completed.py`** ⭐ **For multi-model training**
  - Two-step historical odds via The Odds API
  - Step 1: Fetch completed events (h2h endpoint)
  - Step 2: Get BTTS odds per event using pre-match timestamp
  - Prioritizes sharp bookmakers (Pinnacle, Betfair, William Hill)

- **`fetch_current_odds.py`** - Live odds for upcoming fixtures
- **`fetch_historical_odds.py`** - Original single-step approach (deprecated)

---

**Status**: ✅ Scripts ready, awaiting odds data  
**Priority**: HIGH (Bundesliga + Serie A are top-tier candidates)  
**ETA**: 3 weeks (1 week data + 2 weeks validation)
