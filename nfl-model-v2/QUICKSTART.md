# NFL Model V2 - Quick Start Guide

## 🎯 Goal
Backtest your NFL prediction model against historical closing lines (2020-2024) to measure real-world performance.

## ✅ Prerequisites

1. **Environment Variables**
   ```bash
   # Add to your .env file
   ODDS_API_KEY=your_theoddsapi_key_here
   ```

2. **Node.js Packages**
   ```bash
   npm install node-fetch
   ```

## 🚀 Run Complete Backtest

### Option 1: All-in-One (Recommended)
```bash
./nfl-model-v2/scripts/run-full-backtest.sh
```

### Option 2: Step-by-Step
```bash
# Step 1: Fetch historical closing odds (requires API credits)
node nfl-model-v2/scripts/01-fetch-historical-odds.mjs

# Step 2: Download NFLVerse data (free)
node nfl-model-v2/scripts/02-prepare-nflverse-data.mjs

# Step 3: Generate time-causal features
node nfl-model-v2/scripts/03-generate-features.mjs

# Step 4: Run predictions
node nfl-model-v2/scripts/04-predict-games.mjs

# Step 5: Calculate edges
node nfl-model-v2/scripts/05-calculate-edges.mjs

# Step 6: Generate reports
node nfl-model-v2/scripts/06-generate-reports.mjs
```

## 📊 View Results

```bash
# Monotonicity analysis (most important)
cat nfl-model-v2/output/monotonicity_score.txt

# Performance by season
cat nfl-model-v2/output/performance_by_season.json | jq

# Edge bucket analysis
cat nfl-model-v2/output/edge_bucket_table.json | jq
```

## 🎓 Understanding Results

### Monotonicity Score
- **0.9+**: Excellent - Model has strong predictive signal
- **0.75-0.9**: Good - Reliable but some noise
- **0.6-0.75**: Fair - Weak signal
- **<0.6**: Poor - Little predictive value

### Edge Buckets
Shows win rate by edge size. Ideal pattern:
- 0-2% edge → ~51% win rate
- 2-4% edge → ~54% win rate
- 4-6% edge → ~58% win rate
- 6%+ edge → ~62%+ win rate

### ROI (Return on Investment)
- **Positive ROI**: Model is profitable vs closing lines
- **Break-even**: ~52.4% win rate needed (with -110 pricing)
- **Target**: 5%+ ROI is excellent

## ⚙️ Configuration

Edit `nfl-model-v2/config.json` to customize:
- Seasons to analyze
- Feature engineering parameters
- Edge thresholds
- Bookmaker preferences

## 💰 API Credit Usage

TheOddsAPI charges per request:
- **Historical snapshots**: 30 credits per week (10 per region per market × 3 markets)
- **Total for 2020-2024**: 90 weeks × 30 = **2,700 credits**
- **Cost**: ~$50 for Starter plan (5,000 credits)
- **Alternative**: Start with free tier (500 credits) for 2024 season only

See `API_COSTS.md` for detailed breakdown and cost optimization strategies.

NFLVerse data is **free** and unlimited.

## 🔍 Troubleshooting

### "ODDS_API_KEY not set"
```bash
echo "ODDS_API_KEY=your_key" >> .env
```

### Scripts run but no output
Check that seasons in `config.json` match available data (2020-2024).

### Missing NFLVerse data
Re-run: `node nfl-model-v2/scripts/02-prepare-nflverse-data.mjs`

## 📈 Next Steps

1. **Analyze results** - Look for monotonicity and positive ROI
2. **Compare to production** - How does V2 compare to current model?
3. **Iterate** - Adjust features/thresholds and re-run
4. **Deploy improvements** - Migrate winning strategies to production

## 🔐 Safety

✅ Completely independent from production model
✅ No changes to `netlify/functions/` or `src/`
✅ All work done locally in `nfl-model-v2/`
✅ Can delete entire directory without affecting live site

## 📞 Support

Questions or issues? Check:
- `nfl-model-v2/README.md` - Full documentation
- `nfl-model-v2/config.json` - All configuration options
- Individual script files - Detailed comments

---

**Happy Backtesting! 🏈📊**
