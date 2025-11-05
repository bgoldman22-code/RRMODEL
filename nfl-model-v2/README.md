# NFL Model V2 - Historical Backtesting System

**COMPLETELY INDEPENDENT FROM PRODUCTION MODEL**

This is a research and backtesting system to evaluate predictive performance using historical data. Nothing in this directory affects the production predictions at `bggroundrobin.com/predictions`.

## Directory Structure

```
nfl-model-v2/
├── data/
│   ├── historical-odds/      # Historical closing lines from TheOddsAPI (2020-2024)
│   ├── nflverse/              # NFLVerse play-by-play and game summaries (cached locally)
│   └── processed-features/    # Time-causal features for each season/week
├── scripts/
│   ├── 01-fetch-historical-odds.mjs      # Pull historical closing lines
│   ├── 02-prepare-nflverse-data.mjs      # Load/cache NFLVerse data locally
│   ├── 03-generate-features.mjs          # Build time-causal features
│   ├── 04-predict-games.mjs              # Generate predictions for all games
│   ├── 05-calculate-edges.mjs            # Compare predictions vs closing lines
│   └── 06-generate-reports.mjs           # Create final output reports
├── lib/
│   ├── odds-fetcher.mjs       # TheOddsAPI historical data utilities
│   ├── nflverse-loader.mjs    # NFLVerse data loading utilities
│   ├── feature-engine.mjs     # Time-causal feature generation
│   └── prediction-engine.mjs  # Model prediction logic
├── output/
│   ├── performance_by_season.json
│   ├── edge_bucket_table.json
│   └── monotonicity_score.txt
└── config.json                # Configuration for backtest parameters
```

## Goal

Evaluate the predictive accuracy of our NFL model by:
1. Fetching historical closing lines (spreads, totals, moneylines) for 2020-2024
2. Generating time-causal features using only past data (no future leakage)
3. Predicting every game using our model logic
4. Calculating edge vs closing lines
5. Analyzing edge bucket performance and monotonicity

## Data Sources

### TheOddsAPI (Historical Odds)
- **Endpoint**: `/v4/historical/sports/americanfootball_nfl/odds`
- **Markets**: spreads, totals, h2h (moneyline)
- **Time Range**: 2020-2024 regular season + playoffs
- **Line Type**: Closing lines (most reliable benchmark)

### NFLVerse
- **play-by-play data**: Game-level EPA, efficiency metrics
- **game summaries**: Final scores, team stats
- **Time-causal constraint**: Only use data from games BEFORE the target prediction

## Time-Causal Feature Generation

**Critical Rule**: When predicting Game X in Week Y of Season Z:
- ✅ Can use: All games from Week 1 to Week Y-1 of Season Z
- ✅ Can use: All games from prior seasons (Z-1, Z-2, etc.)
- ❌ Cannot use: Game X itself or any games after it

This ensures we're simulating real-time predictions without data leakage.

## Running the Backtest

### Prerequisites
```bash
# Ensure you have ODDS_API_KEY in .env file
echo "ODDS_API_KEY=your_key_here" >> .env
```

### Step-by-Step Execution

```bash
# 1. Fetch historical closing odds from TheOddsAPI
node nfl-model-v2/scripts/01-fetch-historical-odds.mjs

# 2. Download and cache NFLVerse data locally
node nfl-model-v2/scripts/02-prepare-nflverse-data.mjs

# 3. Generate time-causal features for all games
node nfl-model-v2/scripts/03-generate-features.mjs

# 4. Run model predictions for all games
node nfl-model-v2/scripts/04-predict-games.mjs

# 5. Calculate edges vs closing lines
node nfl-model-v2/scripts/05-calculate-edges.mjs

# 6. Generate final reports
node nfl-model-v2/scripts/06-generate-reports.mjs
```

### All-in-One Command
```bash
# Run complete backtest pipeline
./nfl-model-v2/scripts/run-full-backtest.sh
```

## Output Files

### 1. `performance_by_season.json`
```json
{
  "2020": {
    "total_games": 256,
    "moneyline": { "accuracy": 0.625, "roi": 0.08, "units_won": 12.5 },
    "spread": { "accuracy": 0.545, "roi": 0.03, "units_won": 5.2 },
    "total": { "accuracy": 0.532, "roi": 0.01, "units_won": 1.8 }
  },
  "2021": { ... },
  "2022": { ... },
  "2023": { ... },
  "2024": { ... }
}
```

### 2. `edge_bucket_table.json`
```json
{
  "spread": {
    "0-2%": { "games": 45, "wins": 23, "win_rate": 0.511 },
    "2-4%": { "games": 38, "wins": 21, "win_rate": 0.553 },
    "4-6%": { "games": 29, "wins": 18, "win_rate": 0.621 },
    "6%+": { "games": 15, "wins": 11, "win_rate": 0.733 }
  },
  "total": { ... },
  "moneyline": { ... }
}
```

### 3. `monotonicity_score.txt`
```
Spread Monotonicity Score: 0.92 (Excellent)
Total Monotonicity Score: 0.85 (Good)
Moneyline Monotonicity Score: 0.88 (Good)

Edge Buckets show strong monotonic relationship:
Higher edge → Higher win rate ✅
```

## Key Differences from Production Model

| Aspect | Production Model | V2 Backtest |
|--------|------------------|-------------|
| **Purpose** | Live predictions | Historical evaluation |
| **Data** | Real-time feeds | Historical snapshots |
| **Deployment** | Netlify functions | Local scripts |
| **Odds** | Live market odds | Historical closing lines |
| **Time** | Current week only | 2020-2024 (5 seasons) |
| **Features** | Latest available | Time-causal only |
| **Output** | Weekly picks | Performance metrics |

## Next Steps After Backtest

1. **If V2 outperforms**: Consider migrating logic to production
2. **If similar**: Use V2 as validation/confidence boost
3. **If underperforms**: Investigate which features are overfitting

## Notes

- Historical odds API calls cost credits - budget accordingly
- NFLVerse data is free and comprehensive (2020-2024)
- Expected runtime: ~2-3 hours for complete 5-season backtest
- Results saved in `output/` directory for further analysis

---

**Created**: November 4, 2025
**Purpose**: Independent backtesting and model validation
**Status**: Initial setup complete, ready for implementation
