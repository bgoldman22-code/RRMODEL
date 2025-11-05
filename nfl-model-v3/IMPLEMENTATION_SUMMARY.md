# 🏈 NFL Model V2 - Backtesting System Complete

**Created**: November 4, 2025  
**Status**: ✅ Ready to Run  
**Location**: `/nfl-model-v2/`

## What We Built

A **completely independent** NFL prediction backtesting system that:

1. ✅ Fetches historical closing lines from TheOddsAPI (2020-2024)
2. ✅ Uses NFLVerse play-by-play data (free, comprehensive)
3. ✅ Generates time-causal features (no data leakage)
4. ✅ Predicts all historical games
5. ✅ Calculates edge vs closing lines
6. ✅ Produces performance reports with monotonicity analysis

## Directory Structure

```
nfl-model-v2/
├── README.md              # Full documentation
├── QUICKSTART.md          # Quick start guide (READ THIS FIRST)
├── config.json            # All configuration settings
├── data/
│   ├── historical-odds/   # Closing lines from TheOddsAPI
│   ├── nflverse/          # Play-by-play and game summaries
│   └── processed-features/ # Time-causal features + predictions
├── scripts/
│   ├── 01-fetch-historical-odds.mjs
│   ├── 02-prepare-nflverse-data.mjs
│   ├── 03-generate-features.mjs
│   ├── 04-predict-games.mjs
│   ├── 05-calculate-edges.mjs
│   ├── 06-generate-reports.mjs
│   └── run-full-backtest.sh    # 👈 Run this
├── lib/                   # (Future: shared utilities)
└── output/                # Results appear here
    ├── performance_by_season.json
    ├── edge_bucket_table.json
    └── monotonicity_score.txt
```

## How to Run

### Quick Start (One Command)
```bash
./nfl-model-v2/scripts/run-full-backtest.sh
```

### Prerequisites
1. Add `ODDS_API_KEY` to `.env` file
2. Have `node-fetch` installed: `npm install node-fetch`

## What Gets Analyzed

### Data Coverage
- **Seasons**: 2020, 2021, 2022, 2023, 2024
- **Total Games**: ~1,280 games (256 per season)
- **Markets**: Spread, Total, Moneyline
- **Odds Source**: Closing lines (most reliable benchmark)

### Metrics Calculated
1. **Win Rate by Market**: How often predictions beat the market
2. **ROI by Season**: Profitability over time
3. **Edge Bucket Analysis**: Win rate by edge size
4. **Monotonicity Score**: Signal quality (higher edge → higher win rate?)

## Expected Output

### `performance_by_season.json`
```json
{
  "2024": {
    "total_games": 256,
    "spread": { "accuracy": 0.545, "roi": 0.03 },
    "total": { "accuracy": 0.532, "roi": 0.01 },
    "moneyline": { "accuracy": 0.625, "roi": 0.08 }
  }
}
```

### `edge_bucket_table.json`
```json
{
  "spread": {
    "0-2%": { "games": 45, "win_rate": 0.511 },
    "2-4%": { "games": 38, "win_rate": 0.553 },
    "4-6%": { "games": 29, "win_rate": 0.621 }
  }
}
```

### `monotonicity_score.txt`
```
Spread Monotonicity Score: 0.92 (Excellent)
Total Monotonicity Score: 0.85 (Good)
Moneyline Monotonicity Score: 0.88 (Good)
```

## Key Features

### ✅ Time-Causal Feature Generation
**Critical for valid backtesting!**

When predicting Game X in Week Y:
- ✅ Uses only data from Weeks 1 to Y-1
- ✅ Never sees future data
- ✅ Simulates real-time predictions

### ✅ Historical Closing Lines
- Most accurate benchmark for model evaluation
- Represents "wisdom of the crowd"
- Beating closing lines = real edge

### ✅ Edge-Based Analysis
- Not just accuracy - measures **profitable edge**
- Compares model probability vs market probability
- Identifies when model has genuine insight

### ✅ Monotonicity Testing
- Validates that model signal is real
- Higher edge should → higher win rate
- Score of 0.9+ indicates strong predictive power

## What Makes This Different

| Feature | Production Model | V2 Backtest |
|---------|------------------|-------------|
| **Purpose** | Live weekly picks | Historical evaluation |
| **Independence** | Powers live site | Completely separate |
| **Data Flow** | Real-time APIs | Historical snapshots |
| **Validation** | Directional only | Full statistical rigor |
| **Time Constraint** | Latest data | Time-causal only |
| **Output** | Pick recommendations | Performance metrics |

## API Credit Usage

### TheOddsAPI (Paid)
- ~90 requests total (18 weeks × 5 seasons)
- Check pricing: https://the-odds-api.com/pricing
- One-time fetch (data cached locally)

### NFLVerse (Free)
- Unlimited free usage
- Download once, reuse forever
- Comprehensive 2020-2024 data

## Safety Guarantees

✅ **Zero impact on production**
- Lives in separate `nfl-model-v2/` directory
- No shared code with production model
- Can be deleted anytime without risk

✅ **No API conflicts**
- Uses same ODDS_API_KEY but different endpoints
- Historical data doesn't affect live quotas
- NFLVerse is completely separate

✅ **Local execution**
- Runs on your machine
- No Netlify functions modified
- No deployment required

## Next Steps After Backtest

### If V2 Outperforms Production
1. Analyze which features drive the edge
2. Consider migrating logic to production
3. Run live paper trading first
4. Gradually increase confidence

### If Similar Performance
1. Use V2 as validation layer
2. Boost confidence in existing model
3. Look for complementary signals
4. Consider ensemble approach

### If Underperforms Production
1. Investigate feature overfitting
2. Check for data issues
3. Refine time-causal constraints
4. Iterate on model architecture

## Customization

Edit `nfl-model-v2/config.json` to adjust:
- Seasons analyzed
- Lookback window (default: 10 games)
- Recency weights
- Edge thresholds
- Bookmaker preferences
- Feature metrics used

## Documentation

- **Full Docs**: `nfl-model-v2/README.md`
- **Quick Start**: `nfl-model-v2/QUICKSTART.md`
- **Configuration**: `nfl-model-v2/config.json`
- **This Summary**: `nfl-model-v2/IMPLEMENTATION_SUMMARY.md`

## Troubleshooting

### Missing API Key
```bash
echo "ODDS_API_KEY=your_key_here" >> .env
```

### Node Packages
```bash
npm install node-fetch
```

### Permission Error
```bash
chmod +x nfl-model-v2/scripts/run-full-backtest.sh
```

### Script Fails
Run individual scripts to isolate issue:
```bash
node nfl-model-v2/scripts/01-fetch-historical-odds.mjs
```

## Timeline

- **Setup**: 5 minutes (add API key)
- **Odds Fetch**: 30-45 minutes (rate limited)
- **NFLVerse Download**: 15-20 minutes
- **Feature Generation**: 10-15 minutes
- **Predictions**: 5 minutes
- **Edge Calculation**: 5 minutes
- **Report Generation**: 2 minutes
- **Total**: ~2-3 hours (mostly API wait time)

## Success Metrics

### What to Look For

✅ **Monotonicity Score > 0.75**
- Indicates real predictive signal
- Higher edge correlates with higher win rate

✅ **Positive ROI in Most Markets**
- Especially spread and moneyline
- Even small positive ROI beats closing lines

✅ **Consistent Performance Across Seasons**
- Not just one lucky year
- Model adapts to different seasons

✅ **Edge Bucket Progression**
- Clear step-up in win rates
- 6%+ edge bucket performs best

### Red Flags

❌ **Monotonicity Score < 0.6**
- Model may be noisy
- Little predictive power

❌ **Negative ROI**
- Not beating closing lines
- Need feature refinement

❌ **Inconsistent Seasons**
- One great year, rest mediocre
- Possible overfitting

## Files Created

### Core System
- `README.md` - Full documentation
- `QUICKSTART.md` - Quick start guide
- `config.json` - Configuration
- `IMPLEMENTATION_SUMMARY.md` - This file

### Scripts (6 total)
- `01-fetch-historical-odds.mjs`
- `02-prepare-nflverse-data.mjs`
- `03-generate-features.mjs`
- `04-predict-games.mjs`
- `05-calculate-edges.mjs`
- `06-generate-reports.mjs`
- `run-full-backtest.sh` (runner)

### Output (Generated)
- `performance_by_season.json`
- `edge_bucket_table.json`
- `monotonicity_score.txt`
- `all_edges.json` (detailed data)

## Support & Iteration

### First Run
1. Follow `QUICKSTART.md`
2. Review monotonicity scores
3. Check ROI by season
4. Analyze edge buckets

### Second Run (Refinement)
1. Adjust features in `config.json`
2. Change lookback window
3. Modify recency weights
4. Re-run and compare

### Production Migration (If Warranted)
1. Document winning features
2. Create migration plan
3. Test in paper trading
4. Gradual rollout

---

## 🎉 You're Ready!

Run this command to start:
```bash
./nfl-model-v2/scripts/run-full-backtest.sh
```

Or read the Quick Start guide first:
```bash
cat nfl-model-v2/QUICKSTART.md
```

**Good luck! 🏈📊**
