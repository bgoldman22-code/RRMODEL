# 🇩🇪 Bundesliga BTTS — Profile C Training Plan

**Target League**: German Bundesliga  
**Priority**: HIGH (Perfect Profile C candidate after EPL success)  
**Estimated Effort**: 1 week  
**Data Sources**: openfootball + soccerdata Python library

---

## 🎯 **Why Bundesliga is Perfect**

### Strong Fundamentals
- **BTTS Rate**: 58% (highest in top-5 leagues)
- **Sample Size**: 306 games/season (18 teams × 34 games ÷ 2)
- **Roster Stability**: Lower turnover than Serie A/La Liga
- **Tactical Style**: Attacking, high-pressing (Bundesliga DNA)
- **Data Quality**: openfootball has clean data back to 2012+

### Comparison to EPL Profile C
| Metric | EPL | Bundesliga |
|--------|-----|------------|
| BTTS Baseline | 52% | **58%** |
| Games/Season | 380 | 306 |
| Profile C ROI | **27.5%** | TBD (target >20%) |
| Profitable Band | [0.61, 0.66] | TBD |
| Tactical Style | Varied | **Consistent attacking** |

**Hypothesis**: Bundesliga might have **even better** Profile C performance due to:
- Higher BTTS rate = more signal
- More attacking style = more predictable scoring
- Less tactical variance = easier to model

---

## 📚 **Data Collection Plan**

### Phase 1: Historical Match Results (openfootball)

**Source**: https://github.com/openfootball/bundesliga

**Seasons to Collect**: 
- **Training**: 2020-21, 2021-22, 2022-23 (3 seasons = 918 matches)
- **Validation**: 2023-24 (306 matches, holdout)
- **Live**: 2024-25 (current season)

**Script**: `scripts/bundesliga/fetch_bundesliga_history.py`

```python
import requests
import pandas as pd
from datetime import datetime

SEASONS = ['2020-21', '2021-22', '2022-23', '2023-24']
BASE_URL = 'https://raw.githubusercontent.com/openfootball/bundesliga/master'

def parse_bundesliga_season(season):
    """
    Parse Bundesliga season from openfootball format
    Returns DataFrame with: date, home, away, home_score, away_score, btts
    """
    url = f'{BASE_URL}/{season}/bundesliga.txt'
    response = requests.get(url)
    
    # Parse custom format (see openfootball docs)
    matches = []
    # ... parsing logic ...
    
    df = pd.DataFrame(matches)
    df['btts'] = ((df['home_score'] > 0) & (df['away_score'] > 0)).astype(int)
    df['season'] = season
    
    return df

# Collect all seasons
all_matches = pd.concat([parse_bundesliga_season(s) for s in SEASONS])
all_matches.to_csv('data/bundesliga/historical_results.csv', index=False)

# Calculate baseline BTTS rate
btts_rate = all_matches['btts'].mean()
print(f"Bundesliga BTTS Rate: {btts_rate:.1%}")  # Should be ~58%
```

**Output**: `data/bundesliga/historical_results.csv`
```csv
date,home,away,home_score,away_score,btts,season
2020-09-18,Bayern München,FC Schalke 04,8,0,0,2020-21
2020-09-19,Borussia Dortmund,Borussia Mönchengladbach,3,0,0,2020-21
2020-09-19,1. FC Köln,TSG 1899 Hoffenheim,1,3,1,2020-21
...
```

---

### Phase 2: Team Stats (soccerdata library)

**Source**: https://github.com/probberechts/soccerdata

**Installation**:
```bash
pip install soccerdata
```

**Script**: `scripts/bundesliga/fetch_bundesliga_stats.py`

```python
import soccerdata as sd

# Initialize FBref scraper (free, comprehensive stats)
fbref = sd.FBref(leagues='GER-Bundesliga', seasons=['2021', '2022', '2023', '2024'])

# Fetch team stats
team_stats = fbref.read_team_season_stats()

# Key columns we need for Dixon-Coles:
# - goals_for, goals_against (raw totals)
# - xg_for, xg_against (expected goals)
# - npxg_for, npxg_against (non-penalty xG - GOLD STANDARD)
# - games_played
# - home_goals, away_goals (venue splits)

team_stats.to_csv('data/bundesliga/team_stats_by_season.csv')

# Also fetch match-level xG data
match_xg = fbref.read_schedule()  # Includes xG for each match
match_xg.to_csv('data/bundesliga/match_level_xg.csv')
```

**Output**: `data/bundesliga/team_stats_by_season.csv`
```csv
season,team,games,goals_for,goals_against,xg_for,xg_against,npxg_for,npxg_against
2021,Bayern München,34,97,37,93.2,41.3,85.1,38.9
2021,Borussia Dortmund,34,85,52,79.4,58.7,72.3,55.1
2021,RB Leipzig,34,72,37,74.8,42.1,68.9,39.4
...
```

---

### Phase 3: Closing Odds (TheOddsAPI Historical)

**Challenge**: Historical odds are HARD to get (usually paywalled)

**Options**:
1. **TheOddsAPI Historical** (if you have paid plan)
   - API endpoint: `/historical/sports/soccer_germany_bundesliga/odds`
   - Need: BTTS YES/NO closing lines per match
   
2. **Oddsportal Scraping** (gray area, but effective)
   ```python
   # Scrape Bundesliga BTTS closing odds from oddsportal.com
   # NOTE: Check their ToS, may need to respect rate limits
   ```

3. **Pinnacle Historical** (best data, hardest to get)
   - Contact Pinnacle for research access
   - They sometimes provide historical data for academic use

**Script**: `scripts/bundesliga/fetch_closing_odds.py`

```python
import requests
import time

def fetch_historical_btts_odds(season, api_key):
    """
    Fetch closing BTTS odds for Bundesliga season
    Requires TheOddsAPI paid historical access
    """
    url = f'https://api.the-odds-api.com/v4/historical/sports/soccer_germany_bundesliga/odds'
    
    params = {
        'apiKey': api_key,
        'regions': 'eu',
        'markets': 'btts',
        'dateFrom': f'{season}-08-01',
        'dateTo': f'{int(season)+1}-05-31',
        'oddsFormat': 'decimal'
    }
    
    response = requests.get(url, params=params)
    return response.json()

# Fallback: Use implied odds from FiveThirtyEight if no API access
# FTE publishes team ratings → can derive implied BTTS
```

**Output**: `data/bundesliga/closing_odds_by_match.csv`
```csv
date,home,away,btts_yes_close,btts_no_close,bookmaker
2023-08-18,Bayern München,Werder Bremen,1.61,2.25,Pinnacle
2023-08-19,Borussia Dortmund,1. FC Köln,1.50,2.65,Pinnacle
...
```

---

## 🧮 **Model Training Pipeline**

### Step 1: Feature Engineering

**Script**: `scripts/bundesliga/engineer_features.py`

```python
import pandas as pd
import numpy as np

def calculate_bundesliga_features(matches_df, team_stats_df):
    """
    Generate Dixon-Coles features for each match:
    - Attack/Defense ratings (log scale, shrunk to league prior)
    - Recent form (last 5 games)
    - Home/away splits
    - Head-to-head history
    """
    
    features = []
    
    for idx, match in matches_df.iterrows():
        home_team = match['home']
        away_team = match['away']
        date = match['date']
        
        # Get team stats up to this date (no data leakage!)
        home_stats = get_team_stats_before_date(home_team, date, team_stats_df)
        away_stats = get_team_stats_before_date(away_team, date, team_stats_df)
        
        # Calculate attack/defense ratings
        league_avg_goals = 2.9  # Bundesliga historical average
        
        home_attack = np.log(home_stats['npxg_for_per_game'] / league_avg_goals)
        home_defense = np.log(league_avg_goals / home_stats['npxg_against_per_game'])
        away_attack = np.log(away_stats['npxg_for_per_game'] / league_avg_goals)
        away_defense = np.log(league_avg_goals / away_stats['npxg_against_per_game'])
        
        # Shrink to league prior (k=7 for Bundesliga)
        home_attack_shrunk = shrink_to_prior(home_attack, home_stats['games'], k=7)
        home_defense_shrunk = shrink_to_prior(home_defense, home_stats['games'], k=7)
        away_attack_shrunk = shrink_to_prior(away_attack, away_stats['games'], k=7)
        away_defense_shrunk = shrink_to_prior(away_defense, away_stats['games'], k=7)
        
        # Calculate expected goals (Dixon-Coles formula)
        lambda_home = league_avg_goals * np.exp(home_attack_shrunk - away_defense_shrunk + home_advantage)
        lambda_away = league_avg_goals * np.exp(away_attack_shrunk - home_defense_shrunk)
        
        # BTTS probability (1 - P(home=0) - P(away=0) + P(both=0))
        prob_home_zero = np.exp(-lambda_home)
        prob_away_zero = np.exp(-lambda_away)
        prob_both_zero = prob_home_zero * prob_away_zero  # Independent assumption
        
        btts_prob = 1 - prob_home_zero - prob_away_zero + prob_both_zero
        
        features.append({
            'date': date,
            'home': home_team,
            'away': away_team,
            'lambda_home': lambda_home,
            'lambda_away': lambda_away,
            'btts_prob_model': btts_prob,
            'actual_btts': match['btts'],
            'home_attack': home_attack_shrunk,
            'home_defense': home_defense_shrunk,
            'away_attack': away_attack_shrunk,
            'away_defense': away_defense_shrunk
        })
    
    return pd.DataFrame(features)

# Run on training data (2020-23)
features_df = calculate_bundesliga_features(train_matches, team_stats)
features_df.to_csv('data/bundesliga/model_features_train.csv', index=False)
```

---

### Step 2: Dixon-Coles Calibration

**Script**: `scripts/bundesliga/calibrate_dixon_coles.R` (or Python with statsmodels)

```r
library(tidyverse)
library(goalmodel)  # Dixon-Coles implementation

# Load data
matches <- read_csv('data/bundesliga/historical_results.csv')
features <- read_csv('data/bundesliga/model_features_train.csv')

# Fit Dixon-Coles model
dc_model <- goalmodel(
  goals1 = matches$home_score,
  goals2 = matches$away_score,
  team1 = matches$home,
  team2 = matches$away,
  dc = TRUE,  # Enable Dixon-Coles correlation
  rs = TRUE,  # Enable Rue-Salvesen time weighting
  maxiter = 100
)

# Extract tau parameters
tau_00 <- dc_model$parameters$rho  # 0-0 correlation
tau_10 <- ...  # 1-0 boost
tau_01 <- ...  # 0-1 boost
tau_11 <- ...  # 1-1 correlation

# Save calibrated parameters
write_json(list(
  tau_00 = tau_00,
  tau_10 = tau_10,
  tau_01 = tau_01,
  tau_11 = tau_11,
  home_advantage = dc_model$parameters$hfa,
  shrinkage_k = 7
), 'data/bundesliga/dixon_coles_params.json')
```

---

### Step 3: Profitable Band Detection (Profile C Magic!)

**Script**: `scripts/bundesliga/find_profitable_bands.py`

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

def backtest_profitable_bands(predictions_df, closing_odds_df):
    """
    Find optimal probability windows for betting
    Replicate EPL Profile C methodology
    """
    
    # Merge predictions with closing odds
    df = predictions_df.merge(closing_odds_df, on=['date', 'home', 'away'])
    
    # Calculate market probability (Shin method for vig removal)
    df['market_prob_yes'] = df.apply(lambda row: 
        shin_implied_prob(row['btts_yes_close'], row['btts_no_close']), 
        axis=1
    )
    
    # Calculate edge
    df['edge_yes'] = df['btts_prob_model'] - df['market_prob_yes']
    df['edge_no'] = (1 - df['btts_prob_model']) - (1 - df['market_prob_yes'])
    
    # Bin by model probability
    bins = np.arange(0, 1.05, 0.05)  # 5% buckets
    df['prob_bin'] = pd.cut(df['btts_prob_model'], bins=bins)
    
    # Calculate ROI per bin (betting YES)
    roi_by_bin = []
    
    for bin_label, group in df.groupby('prob_bin'):
        bets = len(group)
        wins = group['actual_btts'].sum()
        
        # Calculate ROI using closing odds
        profit = 0
        for _, row in group.iterrows():
            if row['actual_btts'] == 1:
                profit += (row['btts_yes_close'] - 1)  # Win
            else:
                profit -= 1  # Loss
        
        roi = (profit / bets) * 100 if bets > 0 else 0
        hit_rate = (wins / bets) * 100 if bets > 0 else 0
        
        roi_by_bin.append({
            'bin': str(bin_label),
            'min_prob': bin_label.left,
            'max_prob': bin_label.right,
            'bets': bets,
            'wins': wins,
            'hit_rate': hit_rate,
            'roi': roi,
            'avg_edge': group['edge_yes'].mean()
        })
    
    roi_df = pd.DataFrame(roi_by_bin)
    
    # Find profitable bands (ROI > 5%, bets > 20)
    profitable = roi_df[(roi_df['roi'] > 5) & (roi_df['bets'] > 20)]
    
    print("\\n=== PROFITABLE BANDS (BTTS YES) ===")
    print(profitable.to_string(index=False))
    
    # Visualize
    plt.figure(figsize=(12, 6))
    plt.bar(roi_df['min_prob'], roi_df['roi'], width=0.05, alpha=0.7)
    plt.axhline(y=0, color='red', linestyle='--', label='Break-even')
    plt.axhline(y=5, color='green', linestyle='--', label='5% ROI target')
    plt.xlabel('Model Probability (BTTS YES)')
    plt.ylabel('ROI (%)')
    plt.title('Bundesliga BTTS ROI by Model Probability')
    plt.legend()
    plt.savefig('data/bundesliga/roi_by_probability_band.png')
    
    return profitable

# Run on validation data (2023-24 holdout)
profitable_bands = backtest_profitable_bands(val_predictions, closing_odds)
profitable_bands.to_csv('data/bundesliga/profitable_bands.csv', index=False)
```

**Expected Output**:
```
=== PROFITABLE BANDS (BTTS YES) ===
       bin  min_prob  max_prob  bets  wins  hit_rate    roi  avg_edge
 (0.60-0.65)      0.60      0.65    45    32     71.1   12.4     0.08
 (0.65-0.70)      0.65      0.70    38    28     73.7   18.2     0.11
 (0.70-0.75)      0.70      0.75    22    18     81.8   25.3     0.15
```

**Hypothesis**: Bundesliga profitable band might be **[0.60, 0.72]** (wider than EPL's [0.61, 0.66])

---

### Step 4: Profile C Gate Calibration

**Script**: `scripts/bundesliga/calibrate_profile_c.py`

```python
def calibrate_bundesliga_profile_c(profitable_bands_df):
    """
    Set adaptive Kelly gates based on backtest
    """
    
    # Find optimal band (maximize Sharpe ratio)
    best_band = profitable_bands_df.sort_values('roi', ascending=False).iloc[0]
    
    profile_c_config = {
        'league': 'bundesliga',
        'profitable_band': {
            'min_prob': best_band['min_prob'],
            'max_prob': best_band['max_prob']
        },
        'gates': {
            'min_edge': 0.05,  # 5% minimum edge
            'max_ev_cap': 0.20,  # 20% EV cap (less conservative than UCL)
            'kelly_fraction': 0.25,  # Quarter-Kelly
            'max_stake': 0.03  # 3% bankroll max
        },
        'backtest_performance': {
            'roi': best_band['roi'],
            'hit_rate': best_band['hit_rate'],
            'sample_size': best_band['bets'],
            'avg_edge': best_band['avg_edge']
        }
    }
    
    return profile_c_config

bundesliga_profile_c = calibrate_bundesliga_profile_c(profitable_bands)
with open('data/bundesliga/profile_c_config.json', 'w') as f:
    json.dump(bundesliga_profile_c, f, indent=2)
```

---

## 🚀 **Production Implementation**

### File: `netlify/functions/_lib/soccer/bundesliga-profile-c.mjs`

```javascript
/**
 * Bundesliga Profile C: Adaptive Kelly betting on calibrated bands
 * Based on 2020-23 backtest + 2023-24 validation
 */

import bundesligaConfig from '../../../data/bundesliga/profile_c_config.json';

export function calculateBundesligaProfileC(finalProb, odds, modelUncertainty) {
  const { min_prob, max_prob } = bundesligaConfig.profitable_band;
  const { min_edge, max_ev_cap, kelly_fraction, max_stake } = bundesligaConfig.gates;
  
  // Market probability (Shin vig removal)
  const marketProb = shinImpliedProb(odds.btts_yes, odds.btts_no);
  const edge = finalProb - marketProb;
  
  // Gate 1: Probability band
  if (finalProb < min_prob || finalProb > max_prob) {
    return {
      recommendation: 'NO_VALUE',
      reason: `Outside profitable band [${min_prob.toFixed(2)}, ${max_prob.toFixed(2)}]`
    };
  }
  
  // Gate 2: Minimum edge
  if (edge < min_edge) {
    return {
      recommendation: 'NO_VALUE',
      reason: `Insufficient edge (${(edge*100).toFixed(1)}% < ${min_edge*100}%)`
    };
  }
  
  // Calculate Kelly
  const fullKelly = (finalProb * odds.btts_yes - 1) / (odds.btts_yes - 1);
  const adjustedKelly = Math.min(fullKelly * kelly_fraction, max_stake);
  
  // Cap EV
  const expectedValue = Math.min(edge * odds.btts_yes, max_ev_cap);
  
  return {
    recommendation: 'BET',
    selection: 'YES',
    kelly_fraction: adjustedKelly,
    expected_value: expectedValue,
    edge: edge,
    confidence: modelUncertainty < 0.12 ? 'HIGH' : 'MEDIUM',
    backtest_roi: bundesligaConfig.backtest_performance.roi
  };
}
```

### Integration: `netlify/functions/soccer-btts-predictions.js`

```javascript
// Add to league configs (line ~85)
'bundesliga': {
  id: '4331',
  name: 'German Bundesliga',
  season: '2025-26',
  btts_baseline: 0.58,  // High scoring league
  goals_per_game: 3.2,
  ha_log: 0.10,
  dc_tau: {
    tau_00: -0.18,  // From calibration
    tau_10: -0.09,
    tau_01: -0.09,
    tau_11: 0.04
  },
  profile_c_enabled: true,  // ← NEW!
  shrinkage_games: 7,
  alpha_high_confidence: 0.65,
  alpha_low_confidence: 0.45
},

// In prediction logic (line ~3900)
if (league === 'bundesliga' && effectiveOdds.btts_yes && effectiveOdds.btts_no) {
  const bundesligaProfileC = calculateBundesligaProfileC(
    finalProb,
    effectiveOdds,
    modelUncertainty
  );
  
  if (bundesligaProfileC.recommendation === 'BET') {
    professionalValueBet = bundesligaProfileC;
  }
}
```

---

## 📋 **Implementation Checklist**

### Week 1: Data Collection
- [ ] **Day 1-2**: Fetch historical results (openfootball)
  - Script: `scripts/bundesliga/fetch_bundesliga_history.py`
  - Output: `data/bundesliga/historical_results.csv` (4 seasons)
  - Validate: BTTS rate ~58%

- [ ] **Day 2-3**: Fetch team stats (soccerdata)
  - Script: `scripts/bundesliga/fetch_bundesliga_stats.py`
  - Output: `data/bundesliga/team_stats_by_season.csv`
  - Validate: Bayern/Dortmund stats look reasonable

- [ ] **Day 3-4**: Fetch closing odds
  - Script: `scripts/bundesliga/fetch_closing_odds.py`
  - Output: `data/bundesliga/closing_odds_by_match.csv`
  - Fallback: Use FiveThirtyEight implied odds if no API access

### Week 2: Model Training
- [ ] **Day 5-6**: Feature engineering
  - Script: `scripts/bundesliga/engineer_features.py`
  - Output: `data/bundesliga/model_features_train.csv`
  - Validate: No data leakage (use only past data for each match)

- [ ] **Day 6-7**: Calibrate Dixon-Coles
  - Script: `scripts/bundesliga/calibrate_dixon_coles.R`
  - Output: `data/bundesliga/dixon_coles_params.json`
  - Validate: tau parameters reasonable (compare to EPL)

- [ ] **Day 7**: Find profitable bands
  - Script: `scripts/bundesliga/find_profitable_bands.py`
  - Output: `data/bundesliga/profitable_bands.csv` + visualization
  - Validate: ROI > 5% in at least one band

### Week 3: Production Deployment
- [ ] **Day 8-9**: Build Profile C module
  - File: `netlify/functions/_lib/soccer/bundesliga-profile-c.mjs`
  - Integrate with main prediction function
  - Add config to `LEAGUES` object

- [ ] **Day 9-10**: Testing & Validation
  - Generate predictions for current Bundesliga season
  - Compare to market odds (spot-check obvious games)
  - Paper trade for 2 weeks before going live

- [ ] **Day 10**: Documentation
  - File: `BUNDESLIGA_PROFILE_C_DOCUMENTATION.md`
  - Include backtest results, calibration details, usage guide

---

## 🎯 **Success Metrics**

### Backtest Performance (2020-23 Training)
- **Target ROI**: > 15% (similar to EPL Profile C)
- **Hit Rate**: 65-75% (within profitable band)
- **Bet Frequency**: 20-30% of fixtures (~60-90 bets/season)
- **Sharpe Ratio**: > 1.5

### Validation Performance (2023-24 Holdout)
- **ROI within 5% of training**: If backtest shows 18%, validation should be 13-23%
- **Calibration MAE**: < 0.10 (well-calibrated)
- **No catastrophic losses**: Max drawdown < 20 units

### Production Monitoring (2024-25 Live)
- **Weekly ROI tracking**: Compare to backtest
- **Calibration curve updates**: Are we still well-calibrated?
- **Alert triggers**: If ROI drops >10% below backtest, investigate

---

## 📖 **Data Sources Summary**

### Match Results
- **Source**: https://github.com/openfootball/bundesliga
- **Format**: Custom text format (requires parsing)
- **Coverage**: 2012-13 to present
- **Cost**: Free

### Team Stats (xG, NPxG, etc.)
- **Source**: https://github.com/probberechts/soccerdata
- **Provider**: FBref (via soccerdata library)
- **Coverage**: 2017-18 to present (NPxG from 2020-21)
- **Cost**: Free

### Closing Odds
- **Source 1**: TheOddsAPI (paid, most reliable)
- **Source 2**: Oddsportal scraping (gray area, but effective)
- **Source 3**: FiveThirtyEight implied odds (free, but less precise)
- **Cost**: $0-$50/month depending on source

---

## ⚠️ **Risks & Mitigation**

### Risk #1: Overfitting on Small Sample
- **Issue**: 3 seasons = 918 matches (not huge)
- **Mitigation**: 
  - Use 2023-24 as strict holdout
  - Conservative gates (5% min edge, not 3%)
  - Out-of-sample validation required

### Risk #2: Bundesliga Style Changes
- **Issue**: Post-COVID tactical shifts, Bayern dominance ending
- **Mitigation**:
  - Weight recent seasons more (Rue-Salvesen time decay)
  - Monitor calibration drift in production
  - Recalibrate annually

### Risk #3: Odds Quality
- **Issue**: Bundesliga liquidity lower than EPL
- **Mitigation**:
  - Require 3+ books for consensus (not 2)
  - Higher edge threshold (5% vs EPL's 4%)
  - Smaller max stakes (2-3 units vs EPL's 3-5)

---

## 🚦 **Go / No-Go Decision**

### GREEN LIGHT (Proceed with Bundesliga Profile C) if:
- ✅ Backtest ROI > 15%
- ✅ Validation ROI within 5% of backtest
- ✅ Profitable band has >50 bets in validation
- ✅ Calibration MAE < 0.10

### YELLOW LIGHT (Deploy but Monitor Closely) if:
- ⚠️ Backtest ROI 10-15%
- ⚠️ Validation within 10% of backtest
- ⚠️ Profitable band has 30-50 bets

### RED LIGHT (Don't Deploy) if:
- ❌ Backtest ROI < 10%
- ❌ Validation fails (negative ROI)
- ❌ Massive calibration drift (MAE > 0.15)
- ❌ Profitable band has <30 bets (too few to trust)

---

## 📞 **Next Steps**

1. **Get API keys** for data sources:
   - TheOddsAPI (historical access)
   - OR set up Oddsportal scraper

2. **Run Week 1 scripts** (data collection)
   - Should take 2-3 days if APIs cooperate
   - May need troubleshooting for parsing openfootball format

3. **Review Week 1 output** before proceeding:
   - Check BTTS rate is ~58%
   - Validate team stats are reasonable
   - Ensure no obvious data quality issues

4. **Decision point**: If Week 1 data looks good, proceed to Week 2 (modeling)

---

**Status**: ✅ Plan ready, awaiting execution  
**Owner**: TBD  
**Priority**: HIGH (perfect Profile C candidate)  
**ETA**: 2-3 weeks (1 week per phase)
