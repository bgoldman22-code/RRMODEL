# NFL Model V2 - System Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     NFL Model V2 Pipeline                        │
└─────────────────────────────────────────────────────────────────┘

STEP 1: Data Collection
┌──────────────────┐         ┌──────────────────┐
│   TheOddsAPI     │         │    NFLVerse      │
│  (Historical)    │         │   (Free Data)    │
│                  │         │                  │
│ • Closing Lines  │         │ • Play-by-Play   │
│ • Spreads        │         │ • Game Stats     │
│ • Totals         │         │ • Team Metrics   │
│ • Moneylines     │         │ • EPA Data       │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         │ 01-fetch-odds              │ 02-prepare-nflverse
         │                            │
         ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│ historical-odds/ │         │   nflverse/      │
│  2020-2024       │         │  Play-by-play    │
│  week1.json      │         │  Game summaries  │
│  week2.json      │         │  Aggregates      │
│  ...             │         │                  │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         └────────────┬───────────────┘
                      │
                      │ BOTH INPUTS
                      ▼

STEP 2: Feature Engineering (Time-Causal)
┌─────────────────────────────────────────────────┐
│        03-generate-features.mjs                  │
│                                                  │
│  For each game in Week Y:                       │
│   ✅ Use ONLY data from Weeks 1 to Y-1          │
│   ✅ Calculate rolling team stats                │
│   ✅ Apply recency weights                       │
│   ✅ Generate 55+ features                       │
│   ❌ NEVER use future data                       │
│                                                  │
│  Output: features_2020.json ... 2024.json       │
└────────────────────┬────────────────────────────┘
                     │
                     ▼

STEP 3: Model Predictions
┌─────────────────────────────────────────────────┐
│         04-predict-games.mjs                     │
│                                                  │
│  For each game with features:                   │
│   • Predict Spread (home margin)                │
│   • Predict Total (combined points)             │
│   • Predict Moneyline (win probability)         │
│                                                  │
│  Output: predictions_2020.json ... 2024.json    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼

STEP 4: Edge Calculation
┌─────────────────────────────────────────────────┐
│         05-calculate-edges.mjs                   │
│                                                  │
│  For each prediction + closing line:            │
│   • Compare model line vs market line           │
│   • Calculate probability edge                  │
│   • Match with actual results                   │
│   • Determine win/loss/push                     │
│                                                  │
│  Output: all_edges.json                         │
└────────────────────┬────────────────────────────┘
                     │
                     ▼

STEP 5: Performance Analysis
┌─────────────────────────────────────────────────┐
│         06-generate-reports.mjs                  │
│                                                  │
│  • Performance by Season (ROI, Accuracy)        │
│  • Edge Bucket Analysis (0-2%, 2-4%, etc.)      │
│  • Monotonicity Score (Signal Quality)          │
│  • Win Rate Analysis                            │
│                                                  │
│  Output:                                         │
│   - performance_by_season.json                  │
│   - edge_bucket_table.json                      │
│   - monotonicity_score.txt                      │
└─────────────────────────────────────────────────┘
```

## Key Principles

### 1. Time-Causal Constraint
```
Game: Week 5, 2024
├─ ✅ Can use: All games from Weeks 1-4 of 2024
├─ ✅ Can use: All games from 2023, 2022, 2021, 2020
└─ ❌ Cannot use: Week 5+ of 2024 (future data)
```

### 2. Feature Generation Flow
```
Team Performance History
      ↓
Last 3 Games (50% weight)
      ↓
Last 5 Games (30% weight)
      ↓
Season Average (20% weight)
      ↓
Weighted Features: EPA, Success Rate, Explosive Rate, etc.
```

### 3. Edge Calculation
```
Model Prediction: Home -4.5
Market Line: Home -3.0
Edge: 1.5 points = ~3.75% probability edge

If actual result beats market line → Win
If actual result loses to market line → Loss
```

### 4. Monotonicity Check
```
Edge Bucket    Games    Win Rate    Expected Pattern
0-2%           120      51%         ✅ Baseline
2-4%           85       54%         ✅ Improving
4-6%           52       58%         ✅ Strong
6%+            28       64%         ✅ Excellent

Monotonicity Score = 1.0 (Perfect!)
```

## Component Responsibilities

### Script 01: Historical Odds Fetcher
- Fetches closing lines from TheOddsAPI
- Handles rate limiting (1 req/sec)
- Caches data locally to avoid re-fetching
- Extracts spread, total, moneyline markets

### Script 02: NFLVerse Data Loader  
- Downloads play-by-play CSV files
- Decompresses and parses game data
- Creates game-level aggregates (EPA, success rate, etc.)
- Organizes by season/week

### Script 03: Feature Generator
- Builds team performance histories
- Enforces time-causal constraints
- Calculates rolling averages with recency weights
- Generates 55+ features per game

### Script 04: Prediction Engine
- Applies linear regression-style models
- Predicts spread, total, moneyline for each game
- Outputs confidence scores
- Uses heuristic weights (can be trained later)

### Script 05: Edge Calculator
- Matches predictions with closing lines
- Compares model vs market probabilities
- Removes vig from market odds
- Links predictions to actual results

### Script 06: Report Generator
- Aggregates performance by season
- Creates edge bucket tables
- Calculates monotonicity scores
- Produces human-readable reports

## Configuration Options

### `config.json` Controls:

**Seasons**
```json
"seasons": [2020, 2021, 2022, 2023, 2024]
```

**Lookback Window**
```json
"lookback_window": 10  // Use last 10 games
```

**Recency Weights**
```json
"recency_weights": {
  "last_3_games": 0.5,   // Most recent: 50%
  "last_5_games": 0.3,   // Medium: 30%
  "season_avg": 0.2      // Historical: 20%
}
```

**Edge Thresholds**
```json
"min_bet_threshold": 0.03  // 3% edge required to bet
```

**Bookmaker Preferences**
```json
"preferred_bookmaker": "pinnacle",  // Sharpest lines
"fallback_bookmakers": ["fanduel", "draftkings"]
```

## Output Interpretation

### `performance_by_season.json`
```json
{
  "2024": {
    "spread": {
      "accuracy": 0.545,  // 54.5% win rate
      "roi": 0.03,        // 3% return on investment
      "units_won": 5.2    // Profit in units
    }
  }
}
```

**What it means:**
- Accuracy > 52.4% → Profitable (vs -110 odds)
- Positive ROI → Beating the market
- Units won → Actual profit/loss

### `edge_bucket_table.json`
```json
{
  "spread": {
    "4-6%": {
      "games": 29,
      "win_rate": 0.621,   // 62.1% wins
      "avg_edge": 0.051,   // 5.1% average edge
      "roi": 0.14          // 14% ROI
    }
  }
}
```

**What it means:**
- Higher edge buckets should have higher win rates
- 4-6% edge → 62% win rate is excellent
- ROI shows profitability of that bucket

### `monotonicity_score.txt`
```
Spread Monotonicity Score: 0.92 (Excellent)
```

**What it means:**
- 0.92 = 92% of edge buckets show increasing win rates
- Indicates real predictive signal
- Model isn't just noise

## Runtime Expectations

| Step | Time | API Calls | Notes |
|------|------|-----------|-------|
| 01-fetch-odds | 30-45 min | ~90 | Rate limited (1/sec) |
| 02-prepare-nflverse | 15-20 min | 6 | Large file downloads |
| 03-generate-features | 10-15 min | 0 | CPU intensive |
| 04-predict-games | 5 min | 0 | Fast computation |
| 05-calculate-edges | 5 min | 0 | Data matching |
| 06-generate-reports | 2 min | 0 | Aggregation |
| **Total** | **~2-3 hours** | **96** | Mostly wait time |

## Independence from Production

```
Production Model (netlify/functions/)
    ↓
    NO CONNECTION
    ↓
V2 Backtest (nfl-model-v2/)
```

**Guarantees:**
- ✅ Separate directories
- ✅ Different data sources
- ✅ No shared code
- ✅ Can't break production
- ✅ Can be deleted anytime

## Success Criteria

### Minimum Viable
- ✅ Monotonicity > 0.60
- ✅ ROI > 0% in any market
- ✅ Consistent across 3+ seasons

### Good Performance
- ✅ Monotonicity > 0.75
- ✅ ROI > 2% in spread/ML
- ✅ 53%+ win rate on bets

### Excellent Performance
- ✅ Monotonicity > 0.85
- ✅ ROI > 5% in multiple markets
- ✅ 55%+ win rate on bets
- ✅ Strong edge bucket progression

## Iteration Strategy

### Round 1: Baseline
Run as-is to establish baseline performance

### Round 2: Feature Tuning
- Adjust lookback window (5, 10, 15 games)
- Change recency weights
- Add/remove metrics
- Compare to baseline

### Round 3: Model Refinement
- Try different prediction formulas
- Adjust home field advantage
- Refine confidence calculations
- Compare to previous rounds

### Round 4: Production Consideration
- If V2 outperforms, plan migration
- If similar, use as validation
- If underperforms, investigate why

---

**Ready to run? See QUICKSTART.md**
