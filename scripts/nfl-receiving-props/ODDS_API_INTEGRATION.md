# The Odds API Integration - Setup Guide

## 🔑 API Key Setup

1. **Get API Key**: Sign up at https://the-odds-api.com/
   - Free tier: 500 requests/month
   - Paid tier: $40/month for 10k requests

2. **Add to .env file**:
```bash
THEODDS_API_KEY=your_actual_key_here
```

3. **Test connection**:
```bash
node scripts/nfl-receiving-props/fetch-current-odds.mjs
```

## 📊 Available Markets

### NFL Player Props
- `player_receptions` - Receptions over/under
- `player_receiving_yards` - Receiving yards over/under
- `player_pass_tds` - Passing touchdowns (QB)
- `player_pass_yds` - Passing yards (QB)
- `player_rush_yds` - Rushing yards (RB)

### What We're Using
- ✅ `player_receptions` - Primary market (lower variance)
- ✅ `player_receiving_yards` - Secondary market (higher variance)

## 🎯 Integration Strategy

### Phase 1: Live Odds Fetching (CURRENT)
```bash
# Fetch current week's odds
node scripts/nfl-receiving-props/fetch-current-odds.mjs

# Output: data/nfl_receiving_props/current_odds.json
```

### Phase 2: Historical Odds (For Backtest)
**Problem**: The Odds API doesn't provide historical odds
**Solutions**:
1. **Manual Collection** (What we'll do):
   - Fetch odds Friday/Saturday before games
   - Archive in `data/nfl_receiving_props/historical_odds/2024_week7.json`
   - Build historical database over time

2. **Paid Service** (Optional):
   - OddsJam, Pikkit, or similar ($100-300/month)
   - Historical odds dating back years

3. **Simulated Market** (Temporary):
   - Use model probabilities + realistic vig (5-7%)
   - Validate model works before buying historical data

### Phase 3: Real-Time Integration
```javascript
// Scanner runs daily
1. Fetch latest odds from The Odds API
2. Generate model predictions
3. Calculate edge: model_prob - market_implied_prob
4. Filter: Edge >= 5%, Usage >= 3 targets/game
5. Output: Best bets for the day
```

## 📈 Market Odds Structure

### Example Response
```json
{
  "player": "CeeDee Lamb",
  "market": "player_receptions",
  "line": 5.5,
  "side": "over",
  "odds": -115,
  "implied_prob": 0.535,
  "bookmaker": "draftkings"
}
```

### Converting Odds to Probability
```javascript
// American odds → Implied probability
if (odds > 0) {
  prob = 100 / (odds + 100)
} else {
  prob = abs(odds) / (abs(odds) + 100)
}

// Examples:
// -115 → 53.5% implied prob
// +105 → 48.8% implied prob
// -200 → 66.7% implied prob
```

### Removing Vig (True Probability)
```javascript
// Books add vig (juice) to both sides
// Over: -115 (53.5%), Under: -105 (51.2%)
// Total: 104.7% (4.7% vig)

// True probability (no-vig):
true_prob_over = over_prob / (over_prob + under_prob)
true_prob_under = under_prob / (over_prob + under_prob)
```

## 🔄 Backtest Integration

### Option A: With Historical Odds (Ideal)
```r
# For each prediction:
1. Load historical odds for that game/player/line
2. Get best market odds (across all books)
3. Calculate edge: model_prob - market_prob
4. Bet if edge >= 5%
```

### Option B: Without Historical Odds (Current)
```r
# Simulate realistic market:
1. Model predicts: 58% probability
2. Add realistic vig: 58% + 5% = 63% market price
3. Edge: 58% - 63% = -5% (no bet)
4. Calibrate model to match reality
```

### Our Current Approach
We're using **Option B** for initial validation:
- Simulated market: `model_prob + 0.05` (5% vig)
- Goal: Prove model finds value before investing in historical data
- Next: Once proven, collect real odds going forward

## 📊 Expected Market Efficiency

### Receptions Props
- **Efficiency**: Medium-High (70-80%)
- **Sharp money**: Moderate
- **Public action**: Heavy (fantasy players)
- **Expected edge**: 3-5% for good models

### Yards Props
- **Efficiency**: Medium (60-70%)
- **Sharp money**: Lower
- **Variance**: Higher (weather, game script)
- **Expected edge**: 4-6% for good models

## 🎯 Real-World Example

### CeeDee Lamb - Week 7 vs NYG

**Model Prediction**:
- Receptions: 7.2 average, 65% over 5.5

**Market Odds** (best available):
- Over 5.5: -125 (55.6% implied)
- Under 5.5: +105 (48.8% implied)

**Analysis**:
- True market prob (no-vig): 55.6% / (55.6% + 48.8%) = 53.3%
- Model edge: 65% - 53.3% = **+11.7% edge** ✅
- Kelly stake: 11.7% * (0.65 * 1.8 - 0.35) / 1.8 = **5.2% of bankroll**

## 💾 Data Storage

### Current Odds
```
data/nfl_receiving_props/current_odds.json
```

### Historical Odds (For Backtest)
```
data/nfl_receiving_props/historical_odds/
  2024_week5.json
  2024_week6.json
  2024_week7.json
  ...
```

### Odds Archive Structure
```json
{
  "week": 7,
  "season": 2024,
  "fetched_at": "2024-10-18T10:00:00Z",
  "props": [
    {
      "player": "CeeDee Lamb",
      "team": "DAL",
      "opponent": "NYG",
      "game_date": "2024-10-20",
      "market": "player_receptions",
      "line": 5.5,
      "over_odds": -125,
      "under_odds": +105,
      "over_implied": 0.556,
      "under_implied": 0.488,
      "best_book_over": "draftkings",
      "best_book_under": "fanduel"
    }
  ]
}
```

## 🚀 Next Steps

### This Week (Week 7)
1. ✅ Create odds fetcher script
2. ⏳ Fetch Friday odds for Week 7 games
3. ⏳ Save to historical archive
4. ⏳ Run model predictions
5. ⏳ Compare: model_prob vs market_prob
6. ⏳ Identify bets with 5%+ edge

### Going Forward
1. **Weekly routine**:
   - Friday 6pm ET: Fetch odds, save to archive
   - Saturday 10am ET: Re-fetch (odds may move)
   - Sunday 11am ET: Final fetch, generate picks
   
2. **Build historical database**:
   - Week 7 onwards: Save all odds
   - By Week 18: Full season of data
   - Next year: Can backtest with real market odds

3. **Validate model**:
   - Compare model edge vs actual CLV
   - Track: Model 60% → Market 53% → Actual 58%
   - Adjust calibration as needed

## 📈 ROI Projections

### With Real Market Odds
- **Opportunities**: ~3,000 props/week
- **Actionable** (5%+ edge): ~200-300 bets/week
- **Win rate**: 54-56% (after calibration)
- **ROI**: +4-6%
- **Weekly profit**: 250 bets × $100 × 5% = **$1,250/week**
- **Season profit** (17 weeks): **$21,000+**

### Key Success Factors
1. ✅ Model calibration (5-7% adjustment)
2. ✅ Real market odds (not simulated)
3. ✅ Injury integration (8-12% win rate boost)
4. ✅ Usage filters (3+ targets/game only)
5. ✅ Sharp bookmakers (Pinnacle, Circa preferred)
