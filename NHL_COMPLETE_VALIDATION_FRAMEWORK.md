# NHL ELITE MODEL - COMPLETE VALIDATION FRAMEWORK

## Overview

This system implements a **two-layer validation approach** for NHL SOG betting:

1. **Prediction Accuracy Layer**: Validates model quality (MAE, correlation, bias)
2. **Betting Profitability Layer**: Validates real-world profitability (ROI, risk, drawdown)

**Critical Insight from GPT**: Backtesting against a universal 2.5 line is NOT a true guide to success. We need to validate against:
- Actual game outcomes (for prediction quality)
- Market lines with vig removal (for betting profitability)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTO-TRAIN-COMPLETE.SH                       │
│                  (Fully Automated Pipeline)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │  STEP 1: Historical Data Fetch         │
        │  - 4 seasons (2021-2025)               │
        │  - 60,000+ player-games                │
        └────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │  STEP 2: Parameter Fitting (MLE)       │
        │  - TOI power law                       │
        │  - Streak effects                      │
        │  - Team/opponent adjustments           │
        │  - ZINB dispersion                     │
        └────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │  STEP 3: Backtest (Accuracy)           │
        │  - MAE vs actual outcomes              │
        │  - Pearson correlation                 │
        │  - Bias analysis                       │
        │  - Confidence calibration              │
        └────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │  STEP 4: Market Backtest (Profit)      │
        │  - Vig removal (fair probabilities)    │
        │  - EV calculation per bet              │
        │  - ROI by confidence bucket            │
        │  - Kelly-optimal stakes                │
        │  - Monte Carlo risk (DD, ruin)         │
        └────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │  STEP 5: Deployment Decision           │
        │  - All metrics pass? ✅ Deploy         │
        │  - Some fail? ⚠️  Improve              │
        │  - Many fail? 🚨 Not ready             │
        └────────────────────────────────────────┘
```

---

## Validation Metrics

### Layer 1: Prediction Accuracy

| Metric | Target | Elite | Good | Acceptable | Weak |
|--------|--------|-------|------|------------|------|
| **MAE** (Mean Absolute Error) | < 1.0 | < 0.8 | 0.8-1.0 | 1.0-1.2 | > 1.2 |
| **Correlation** (Pearson ρ) | > 0.55 | > 0.65 | 0.55-0.65 | 0.45-0.55 | < 0.45 |
| **Bias** (Systematic Error) | < ±0.15 | < ±0.10 | ±0.10-0.15 | ±0.15-0.25 | > ±0.25 |

**Purpose**: Ensures projections are accurate predictors of actual outcomes.

### Layer 2: Betting Profitability

| Metric | Target | Meaning |
|--------|--------|---------|
| **ROI** (Return on Investment) | > 3% | Profit per dollar bet |
| **Win Rate** | > 52% | Percentage of bets won (context-dependent) |
| **Max Drawdown (P95)** | < 35% | Worst-case bankroll decline (95th percentile) |
| **Ruin Probability** | < 5% | Chance of bankruptcy in 10k simulations |
| **Sample Size** | > 100 bets | Minimum for statistical significance |

**Purpose**: Ensures model is profitable vs market and risk is acceptable.

---

## Key Components

### 1. Vig Removal (Fair Probability Calculation)

**Why it matters**: Bookmakers embed margin (vig) in odds. To calculate true edge, we must:
1. Convert American odds to implied probabilities
2. Normalize (remove vig) to get fair probabilities
3. Compare model probability vs fair probability = edge

```javascript
function removeVig(overOdds, underOdds) {
  const overImplied = oddsToImpliedProb(overOdds);
  const underImplied = oddsToImpliedProb(underOdds);
  const total = overImplied + underImplied;
  
  return { 
    overProb: overImplied / total,  // Fair probability (no vig)
    underProb: underImplied / total,
    vigPct: (total - 1.0) * 100     // Bookmaker margin
  };
}
```

**Example**:
- Over 2.5 at -110 → 52.38% implied
- Under 2.5 at -110 → 52.38% implied
- Total = 104.76% (4.76% vig)
- Fair probabilities: 50% each (after vig removal)

### 2. Expected Value (EV) Calculation

```
EV = (Model Probability × Payout) - (1 - Model Probability) × Stake

Edge = Model Probability - Fair Market Probability
```

**Bet only when**:
- EV > 3% (per dollar)
- Edge > 5% (model prob > fair prob + 5%)

### 3. Kelly Criterion (Stake Sizing)

```
Kelly Fraction = (bp - q) / b

Where:
  b = decimal odds - 1
  p = model probability
  q = 1 - p
```

**Safety adjustments**:
- Fractional Kelly: Multiply by 0.25 (25% Kelly)
- Variance discount: Reduce further if high dispersion
- Hard cap: Never stake > 5% of bankroll

### 4. Monte Carlo Risk Analysis

**Simulates 10,000 trials** of a full season using:
- Each bet's stake, EV, win probability
- Random outcomes per bet
- Tracks bankroll, drawdown, ruin

**Outputs**:
- **P95 Max Drawdown**: 95th percentile worst decline
- **P5 Final Bankroll**: 5th percentile ending bankroll (worst 5% scenario)
- **Ruin Probability**: % of trials ending at $0

---

## Deployment Criteria

### ✅ READY TO DEPLOY

All of the following must pass:
- [x] MAE < 1.0 shots
- [x] Correlation > 0.55
- [x] Bias < ±0.15 shots
- [x] ROI > 3%
- [x] Max Drawdown < 35%
- [x] Ruin Risk < 5%

**Action**: Deploy with 0.25 Kelly fraction, max 3-5% stake per bet.

### ⚠️ CONDITIONAL DEPLOYMENT

Accuracy good but risk high (ROI > 3% but DD > 35% OR ruin > 5%):
- Use 0.10-0.15 Kelly (more conservative)
- Max 1-2% stake per bet
- Tighten edge threshold (>8% instead of >5%)
- Monitor closely

### 🚨 NOT READY

Fails accuracy OR profitability checks:
- Do NOT deploy for real money
- Add features (score effects, rest days, matchups)
- Collect more training data
- Adjust methodology

---

## Usage

### Run Complete Pipeline (Unattended)

```bash
./scripts/nhl/auto-train-complete.sh
```

**Duration**: 60-90 minutes  
**Output**:
- `data/nhl/historical_game_data.json`
- `data/nhl/learned_parameters.json`
- `data/nhl/backtest_results.json` (accuracy layer)
- `data/nhl/market_backtest_results.json` (profitability layer)
- `auto-training-YYYYMMDD-HHMMSS.log`

### Monitor Progress

```bash
./scripts/nhl/monitor-progress.sh
```

### Run Individual Steps

```bash
# 1. Fetch historical data (if not exists)
node scripts/nhl/historical-data-fetcher.mjs

# 2. Fit parameters
node scripts/nhl/fit-parameters.mjs

# 3. Backtest accuracy
node scripts/nhl/backtest-engine.mjs

# 4. Backtest profitability
node scripts/nhl/market-backtest.mjs
```

---

## Current Limitations & Future Improvements

### Current State

✅ **Working**:
- Two-layer validation (accuracy + profitability)
- Vig removal and fair probability calculation
- Kelly criterion with safety adjustments
- Monte Carlo risk analysis
- Automated pipeline

⚠️ **Using Synthetic Lines**:
- Market backtest currently generates synthetic lines based on projections
- NOT using actual historical market lines yet

### Next Steps (Priority Order)

1. **Integrate TheOddsAPI Historical Data**
   - Fetch archived lines/odds for each player-game
   - Replace synthetic lines with actual market data
   - Validate true profitability vs real markets

2. **Add More Features**
   - Score effects (trailing teams shoot more)
   - Rest days / back-to-backs
   - Goalie quality (save% impact)
   - Matchup history

3. **Live Odds Integration**
   - Fetch real-time odds in production scanner
   - Use same vig-removal logic
   - Only bet when EV > threshold

4. **Weekly Auto-Training**
   - GitHub Actions workflow already created
   - Runs every Sunday 3am
   - Re-fits parameters as new games arrive

---

## Dependencies

```bash
# macOS
brew install jq bc node

# Ensure Node.js >= 16
node --version
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/nhl/auto-train-complete.sh` | Main automated pipeline |
| `scripts/nhl/historical-data-fetcher.mjs` | Fetch 4 years of game data |
| `scripts/nhl/fit-parameters.mjs` | Learn optimal parameters (MLE) |
| `scripts/nhl/backtest-engine.mjs` | Accuracy validation vs actuals |
| `scripts/nhl/market-backtest.mjs` | Profitability validation vs market |
| `scripts/nhl/monitor-progress.sh` | Track data fetch progress |
| `.github/workflows/nhl-train-model.yml` | Weekly auto-training workflow |

---

## GPT Feedback Implementation Status

### ✅ Implemented

- [x] MAE-based validation vs actual outcomes
- [x] Vig removal (fair probability calculation)
- [x] Market-aware EV calculation
- [x] Kelly criterion with variance adjustment
- [x] Monte Carlo risk analysis (drawdown, ruin)
- [x] ROI by confidence bucket
- [x] Two-layer validation (accuracy + profitability)
- [x] Bash script hardening (set -euo pipefail)
- [x] jq for JSON parsing (safe, not grep)
- [x] Git commit hash tracking for reproducibility
- [x] Parameter hash (SHA-256) for version control

### 🚧 In Progress

- [ ] TheOddsAPI integration for historical lines
- [ ] Replace synthetic lines with actual market data

### 📋 Planned

- [ ] Historical odds archive/cache system
- [ ] Live odds fetching in production scanner
- [ ] Additional features (score, rest, matchups)
- [ ] GitHub Actions weekly execution

---

## Questions?

**Why two layers?**  
Accuracy ≠ profitability. A model can predict well but lose money if markets are efficient. We need both.

**Why vig removal?**  
Bookmaker odds include margin. Without removing it, we overestimate market efficiency and underestimate our edge.

**Why Kelly criterion?**  
Maximizes long-term growth while avoiding ruin. Fractional Kelly (25%) adds safety margin.

**Why Monte Carlo?**  
Shows realistic risk (drawdown, ruin) accounting for variance and bet sequencing.

**Why synthetic lines for now?**  
Historical odds data is hard to get. Synthetic lines (based on projections) let us validate the framework. Once TheOddsAPI integration is complete, we'll use real lines.

---

**Last Updated**: October 22, 2025  
**Git Commit**: Auto-tracked in pipeline logs  
**Status**: Ready for local validation with synthetic lines
