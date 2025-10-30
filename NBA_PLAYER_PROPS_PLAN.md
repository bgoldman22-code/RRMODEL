# NBA Player Props Model - Implementation Plan

## Data Sources ✅

### 1. NBA CDN API (Already Using!)
**Endpoint**: `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json`

**Available Stats Per Player:**
- Points, Rebounds (Total/Off/Def), Assists, Steals, Blocks
- 3PM, FGA, FTA, Turnovers
- Minutes played
- Position, Starter status
- Field Goal %, 3P%, FT%

**Historical Access:**
- Game IDs: `0022400001` to `0022401230` (2024-25 season, ~1,230 games)
- Game IDs: `0022500001` to current (2025-26 season)
- 2+ seasons of data = ~2,500 games × 20 players = 50,000+ data points

### 2. Team Context (Already Have!)
- Team projected totals (from your model)
- Opponent DefRtg vs positions
- Team pace
- Game script (spread, blowout risk)

### 3. Odds API (Your Key)
**For Backtesting:**
- Historical player prop lines (points, rebounds, assists)
- Available for 2024-25 season and earlier
- Can validate model accuracy vs actual closing lines

## Model Architecture

### Phase 1: Points Props MVP (Week 1-2)

**Features (15 total):**
```python
Player Rolling Stats (5):
- L5_PPG, L10_PPG
- L5_minutes, L10_minutes  
- L10_FGA (usage proxy)

Team Context (4):
- team_projected_total (from your model!)
- team_pace
- days_rest (B2B flag)
- home_away

Opponent Context (3):
- opponent_defRtg
- opponent_pace
- opponent_defRtg_vs_position (e.g., vs PG)

Game Script (3):
- vegas_spread (blowout risk)
- vegas_team_total
- starter_flag
```

**Target:** Predict player points, compare to Vegas line

**Model:** XGBoost Regression
- Fast training (~30 seconds)
- Handles non-linear relationships (minutes × usage)
- Feature importance (which factors matter most)

**Betting Strategy:**
- Bet when |model - vegas| > 4 points
- Kelly criterion for sizing (0.5% - 2% of bankroll)
- Track by player, team, prop type

### Phase 2: Rebounds & Assists (Week 3)

**Additional Features:**
- Rebound Rate (REB / minutes)
- Center out? (injury impact on rebounds)
- Assist Rate (AST / minutes)
- Ball-dominant teammates injured?

### Phase 3: Exotic Props (Week 4)
- 3PM (3P% × minutes × team pace)
- Steals/Blocks (positional + defensive matchup)
- Double-Double probability model

## Implementation Steps

### Step 1: Data Collection Scripts
```bash
scripts/nba/collect-player-boxscores.js
scripts/nba/build-player-rolling-stats.js
scripts/nba/collect-historical-odds.js
```

### Step 2: Feature Engineering
```bash
scripts/nba/build-player-features.js
# Creates CSV with:
# - player_id, game_date, prop_type (PTS/REB/AST)
# - all features above
# - actual_result, vegas_line, over_hit (target)
```

### Step 3: Model Training
```bash
scripts/nba/train-player-props-model.js
# XGBoost with 80/20 train/test split
# Hyperparameter tuning: depth, learning_rate, n_estimators
# Output: Accuracy, ROI, win rate by prop type
```

### Step 4: Backtesting
```bash
scripts/nba/backtest-player-props.js
# Simulate betting on 2024-25 season
# Args: --edge-threshold 4 --kelly-fraction 0.25
# Output: Total bets, win rate, ROI, max drawdown
```

### Step 5: Live Predictions
```bash
netlify/functions/nba-player-props/index.mjs
# Fetches today's games
# Calculates player rolling stats
# Loads trained model
# Returns predictions + edge calculations
```

## Expected Performance

### Conservative Estimates:
- **Win Rate**: 54-55% (vs -110 lines)
- **ROI**: 8-10%
- **Volume**: 5-8 bets/night (high edge only)
- **Season Profit**: $3,000-5,000 (100 unit bankroll)

### Optimistic (With Injury Edge):
- **Win Rate**: 56-58%
- **ROI**: 12-16%
- **Volume**: 10-15 bets/night
- **Season Profit**: $10,000-15,000

## Competitive Advantages

1. **Real-time team total projection**: Books lag on this
2. **Injury adjustments**: Embiid out → Maxey usage spike
3. **Pace matchups**: Fast vs slow games = opportunity variance
4. **Blowout detection**: Your spread model = game script predictor
5. **Fresh data**: NBA CDN updates faster than some book models

## Risk Management

1. **Edge threshold**: Only bet 4+ point edges (model confidence)
2. **Kelly sizing**: 0.25-0.5 Kelly (never more than 2% per bet)
3. **Diversification**: Max 3 props per game (correlation risk)
4. **Line shopping**: Use 3+ books for best prices
5. **Volume limits**: Books cap at $500-1K (get down early)

## Timeline

- **Week 1**: Data collection + feature engineering
- **Week 2**: Model training + validation
- **Week 3**: Backtest on 2024-25 season
- **Week 4**: Live deployment + tracking
- **Ongoing**: Model updates as season progresses

## Next Steps

1. Set up NBA CDN boxscore scraper
2. Get your Odds API key configured
3. Build player rolling stats pipeline
4. Train initial points model
5. Backtest and validate

**Ready to start building?** 🚀
