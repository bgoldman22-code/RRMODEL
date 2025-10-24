# 🎯 TWO-PASS EXECU```bash
THEODDS_API_KEY=your_api_key_here \
  node scripts/nhl/fetch-historical-odds.mjsN STRATEGY

## Overview

Split the 700-game validation into two passes for faster feedback and risk management.

## Pass 1: Quick Validation (30%)

### Stats
- **Games:** 210 player-games
- **Dates:** 85 unique dates (Oct 2023 - Feb 2024)
- **Cost:** 2,185 credits (15.5% of budget)
- **Time:** 30-45 minutes
- **Credits remaining after:** 91,645

### Purpose
Get quick read on model profitability before committing to full validation.

### Execute
```bash
node scripts/nhl/fetch-historical-odds-v2.mjs \
  --sample=smart_player_sample_pass1.json \
  --execute
```

### Decision Gate
After Pass 1 completes, analyze results:

```bash
node scripts/nhl/market-backtest.mjs \
  --odds=data/nhl/historical_odds_data_v2.json \
  --predictions=data/nhl/walkforward_backtest_improved_results.json
```

**Decision criteria:**
- ❌ **ROI < -2%:** STOP - Model loses money, don't waste credits on Pass 2
- ⚠️ **ROI -2% to 0%:** MARGINAL - Discuss before Pass 2
- ✅ **ROI 0% to 3%:** BREAKEVEN+ - Proceed to Pass 2 cautiously
- ✅ **ROI > 3%:** PROMISING - Definitely run Pass 2
- 🚀 **ROI > 5%:** STRONG - Run Pass 2 immediately!

## Pass 2: Full Validation (70%)

### Stats
- **Games:** 490 player-games
- **Dates:** 190 unique dates (Feb 2024 - Apr 2025)
- **Cost:** 5,090 credits (36.2% of budget)
- **Time:** 1.5-2 hours
- **Credits remaining after:** 86,555

### Purpose
Full statistical validation with larger sample size and more recent data.

### Execute (only if Pass 1 passes gate)
```bash
node scripts/nhl/fetch-historical-odds-v2.mjs \
  --sample=smart_player_sample_pass2.json \
  --execute
```

### Final Analysis
Combined Pass 1 + Pass 2 data:
```bash
node scripts/nhl/market-backtest-combined.mjs
```

## Benefits of Two-Pass Strategy

### 1. Faster Feedback ⚡
- See results in 45 mins vs 3 hours
- Make informed decision quickly
- Adjust strategy if needed

### 2. Risk Management 🛡️
- Stop early if model unprofitable
- Save 70% of credits (5,090 credits = $50+ value)
- Avoid wasting time on full run

### 3. Adaptive Strategy 🎯
- If Pass 1 marginal: Can improve model before Pass 2
- If Pass 1 strong: Continue with confidence
- If Pass 1 weak: Save credits for model improvements

### 4. Credit Conservation 💰
- Pass 1 only uses 15.5% of budget
- Still have 84.5% remaining if we stop
- Can use saved credits for:
  - Model improvements
  - Different sampling strategies
  - Other validation approaches

## Timeline

### Today (Oct 23, Evening)
1. **Run Pass 1** (~45 mins)
2. **Analyze results** (~15 mins)
3. **Make decision** (immediate)

### If Pass 1 Succeeds
4. **Run Pass 2** (~2 hours)
5. **Full analysis** (~30 mins)
6. **Deploy decision** (tomorrow)

### If Pass 1 Fails
4. **Model improvements** (1-2 days)
5. **Re-test** (when ready)

## Credit Budget Summary

| Item | Credits | % of Total |
|------|---------|------------|
| Starting balance | 93,730 | 100.0% |
| Test run (completed) | -32 | -0.03% |
| **Current balance** | **93,698** | **99.97%** |
| Pass 1 (30%) | -2,185 | -2.3% |
| Pass 2 (70%) | -5,090 | -5.4% |
| **Total if both run** | **-7,275** | **-7.8%** |
| **Final balance** | **86,423** | **92.2%** |
| **Credits reset** | **Nov 1** | **8 days** |

## Recommendation

✅ **Run Pass 1 now**

**Why:**
- Low risk (only 2,185 credits = 2.3% of budget)
- Fast feedback (45 minutes)
- Smart stopping point if model weak
- Can still improve model with remaining credits
- Credits expire in 8 days anyway

**What to look for in Pass 1:**
- Odds availability rate (target: >80%)
- Data quality (multiple bookmakers per game)
- Sample ROI (even breakeven is encouraging)
- Temporal patterns (improving over time?)

## Next Steps

Run Pass 1:
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL

node scripts/nhl/fetch-historical-odds-v2.mjs \
  --sample=smart_player_sample_pass1.json \
  --execute
```

Monitor progress - takes ~30-45 minutes. Script will save results to:
- `data/nhl/historical_odds_data_v2.json` (full data)
- `data/nhl/historical_odds_summary.json` (quick stats)

Then we analyze and decide on Pass 2! 🎯
