#!/bin/bash

###############################################################################
# NHL Elite Model - FULLY AUTOMATED TRAINING PIPELINE
# 
# Runs everything from data fetch → parameter fitting → backtest → deploy
# Can be left running unattended for 1-2 hours
# 
# Usage: ./scripts/nhl/auto-train-complete.sh
###############################################################################

set -euo pipefail  # Strict mode: exit on error, undefined vars, pipe failures

# Ensure dependencies exist
command -v jq >/dev/null 2>&1 || { echo "❌ jq is required. Install: brew install jq"; exit 1; }
command -v bc >/dev/null 2>&1 || { echo "❌ bc is required. Install: brew install bc"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ node is required"; exit 1; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
cd "$REPO_ROOT"

LOG_FILE="auto-training-$(date +%Y%m%d-%H%M%S).log"
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
handle_error() {
    log "❌ ERROR: Training pipeline failed at step: $1"
    log "Check log file: $LOG_FILE"
    exit 1
}

# Start
clear
log "╔═══════════════════════════════════════════════════════════════════════╗"
log "║                                                                       ║"
log "║       🤖 NHL ELITE MODEL - FULLY AUTOMATED TRAINING PIPELINE          ║"
log "║                                                                       ║"
log "╚═══════════════════════════════════════════════════════════════════════╝"
log ""
log "⏱️  Estimated time: 60-90 minutes"
log "📁 Log file: $LOG_FILE"
log "� Git commit: $GIT_COMMIT"
log "�💤 Safe to leave running unattended"
log ""

# ============================================================================
# STEP 1: Historical Data Fetch (or skip if exists)
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 1: Historical Data Collection"
log "═══════════════════════════════════════════════════════════════════════"
log ""

if [ -f "data/nhl/historical_game_data.json" ]; then
    GAMES_COUNT=$(cat data/nhl/historical_game_data.json | grep -o '"gameId"' | wc -l | xargs)
    log "✅ Historical data already exists (${GAMES_COUNT} games)"
    log "   Skipping fetch. Delete file to re-fetch."
    log ""
else
    log "📥 Fetching 4 years of historical data..."
    log "   Seasons: 2021-22, 2022-23, 2023-24, 2024-25"
    log "   Expected: ~60,000 player-games"
    log "   Duration: 30-60 minutes"
    log ""
    
    node scripts/nhl/historical-data-fetcher.mjs 2>&1 | tee -a "$LOG_FILE" || handle_error "Historical Data Fetch"
    
    if [ -f "data/nhl/historical_game_data.json" ]; then
        GAMES_COUNT=$(cat data/nhl/historical_game_data.json | grep -o '"gameId"' | wc -l | xargs)
        log ""
        log "✅ Step 1 complete: ${GAMES_COUNT} games collected"
        log ""
    else
        handle_error "Historical data file not created"
    fi
fi

# ============================================================================
# STEP 2: Parameter Fitting (MLE)
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 2: Parameter Fitting (Maximum Likelihood Estimation)"
log "═══════════════════════════════════════════════════════════════════════"
log ""
log "🧠 Learning optimal parameters from data..."
log "   - Home/away effects per team"
log "   - TOI vs shot rate power law"
log "   - Hot/cold streak multipliers"
log "   - PP boost by unit and opponent"
log "   - ZINB dispersion by archetype"
log ""

node scripts/nhl/fit-parameters.mjs 2>&1 | tee -a "$LOG_FILE" || handle_error "Parameter Fitting"

if [ -f "data/nhl/learned_parameters.json" ]; then
    log ""
    log "✅ Step 2 complete: Parameters fitted and saved"
    log ""
else
    handle_error "learned_parameters.json not created"
fi

# ============================================================================
# STEP 3: Walk-Forward Backtest (Accuracy - NO DATA LEAKAGE)
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 3: Walk-Forward Backtest (Prediction Accuracy)"
log "═══════════════════════════════════════════════════════════════════════"
log ""
log "🚶 Testing predictions with WALK-FORWARD validation..."
log "   ⚠️  CRITICAL: Prevents data leakage (look-ahead bias)"
log "   - Chronological ordering enforced"
log "   - Past-only training, future-only testing"
log "   - Periodic parameter re-fitting"
log ""
log "📊 Metrics:"
log "   - Mean Absolute Error (MAE)"
log "   - Correlation with actuals"
log "   - Bias detection"
log ""

node scripts/nhl/walkforward-backtest.mjs 2>&1 | tee -a "$LOG_FILE" || handle_error "Walk-Forward Backtest"

if [ -f "data/nhl/walkforward_backtest_results.json" ]; then
    log ""
    log "✅ Step 3 complete: Walk-forward backtest finished"
    log ""
else
    handle_error "walkforward_backtest_results.json not created"
fi

# ============================================================================
# STEP 4: Market Backtest (Betting Profitability)
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 4: Market Backtest (Betting Profitability with Vig Removal)"
log "═══════════════════════════════════════════════════════════════════════"
log ""
log "💰 Testing profitability vs market lines..."
log "   - EV calculation with vig removal"
log "   - ROI by confidence bucket"
log "   - Kelly-optimal stakes"
log "   - Monte Carlo risk (drawdown, ruin probability)"
log ""

node scripts/nhl/market-backtest.mjs 2>&1 | tee -a "$LOG_FILE" || handle_error "Market Backtest"

if [ -f "data/nhl/market_backtest_results.json" ]; then
    log ""
    log "✅ Step 4 complete: Market backtest finished"
    log ""
else
    handle_error "market_backtest_results.json not created"
fi

# ============================================================================
# STEP 5: Results Analysis & Recommendations
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 5: Results Analysis"
log "═══════════════════════════════════════════════════════════════════════"
log ""

# Extract accuracy metrics (using jq for safe JSON parsing)
MAE=$(jq -r '.metrics.mae // "N/A"' data/nhl/walkforward_backtest_results.json)
CORR=$(jq -r '.metrics.correlation // "N/A"' data/nhl/walkforward_backtest_results.json)
BIAS=$(jq -r '.metrics.bias // "N/A"' data/nhl/walkforward_backtest_results.json)
WF_PREDS=$(jq -r '.totalPredictions // "N/A"' data/nhl/walkforward_backtest_results.json)

# Extract betting metrics
ROI=$(jq -r '.summary.roi // "N/A"' data/nhl/market_backtest_results.json)
WIN_RATE=$(jq -r '.summary.winRate // "N/A"' data/nhl/market_backtest_results.json)
TOTAL_BETS=$(jq -r '.summary.totalBets // "N/A"' data/nhl/market_backtest_results.json)
DD95=$(jq -r '.risk.maxDrawdownP95 // "N/A"' data/nhl/market_backtest_results.json)
RUIN=$(jq -r '.risk.ruinProbability // "N/A"' data/nhl/market_backtest_results.json)

log "📊 PREDICTION ACCURACY RESULTS (Walk-Forward - No Leakage):"
log "   Total Predictions: ${WF_PREDS}"
log "   Mean Absolute Error: ${MAE} shots"
log "   Correlation: ${CORR}"
log "   Bias: ${BIAS} shots"
log ""

log "💰 BETTING PROFITABILITY RESULTS:"
log "   Total Bets: ${TOTAL_BETS}"
log "   Win Rate: $(echo "$WIN_RATE * 100" | bc -l | xargs printf "%.1f")%"
log "   ROI: $(echo "$ROI * 100" | bc -l | xargs printf "%.2f")%"
log "   Max Drawdown (P95): $(echo "$DD95 * 100" | bc -l | xargs printf "%.1f")%"
log "   Ruin Probability: $(echo "$RUIN * 100" | bc -l | xargs printf "%.2f")%"
log ""

# Validation checks (handle N/A values)
if [ "$MAE" != "N/A" ]; then
    MAE_OK=$(echo "$MAE < 1.0" | bc -l)
else
    MAE_OK=0
fi

if [ "$CORR" != "N/A" ]; then
    CORR_OK=$(echo "$CORR > 0.55" | bc -l)
else
    CORR_OK=0
fi

if [ "$BIAS" != "N/A" ]; then
    ABS_BIAS=$(echo "sqrt($BIAS * $BIAS)" | bc -l)
    BIAS_OK=$(echo "$ABS_BIAS < 0.15" | bc -l)
else
    BIAS_OK=0
fi

if [ "$ROI" != "N/A" ]; then
    ROI_OK=$(echo "$ROI > 0.03" | bc -l)
else
    ROI_OK=0
fi

if [ "$DD95" != "N/A" ]; then
    DD_OK=$(echo "$DD95 < 0.35" | bc -l)
else
    DD_OK=0
fi

if [ "$RUIN" != "N/A" ]; then
    RUIN_OK=$(echo "$RUIN < 0.05" | bc -l)
else
    RUIN_OK=0
fi

log "🔍 VALIDATION CHECKS:"
log "   Accuracy:"
log "     MAE < 1.0: $([ "$MAE_OK" -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL")"
log "     Correlation > 0.55: $([ "$CORR_OK" -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL")"
log "     Bias < 0.15: $([ "$BIAS_OK" -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL")"
log "   Profitability:"
log "     ROI > 3%: $([ "$ROI_OK" -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL")"
log "     Max DD < 35%: $([ "$DD_OK" -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL")"
log "     Ruin < 5%: $([ "$RUIN_OK" -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL")"
log ""

# Overall verdict
if [ "$MAE_OK" -eq 1 ] && [ "$CORR_OK" -eq 1 ] && [ "$BIAS_OK" -eq 1 ] && [ "$ROI_OK" -eq 1 ] && [ "$DD_OK" -eq 1 ] && [ "$RUIN_OK" -eq 1 ]; then
    log "═══════════════════════════════════════════════════════════════════════"
    log "✅ MODEL VALIDATED - READY FOR DEPLOYMENT!"
    log "═══════════════════════════════════════════════════════════════════════"
    log ""
    log "💰 DEPLOYMENT RECOMMENDATIONS:"
    log "   ✓ Model has strong predictive accuracy AND profitability"
    log "   ✓ Safe to use for real money betting"
    log "   ✓ Recommended Kelly: 0.25 fractional (already applied)"
    log "   ✓ Max stake: 3-5% per bet (hard cap)"
    log ""
    log "📋 NEXT STEPS:"
    log "   1. Review edge distribution in market_backtest_results.json"
    log "   2. Update projection engine with learned parameters"
    log "   3. git add data/nhl/*.json"
    log "   4. git commit -m 'feat: Deploy validated model - ROI:${ROI} DD:${DD95}'"
    log "   5. git push origin main42"
    log ""
    DEPLOY_READY=1
elif [ "$MAE_OK" -eq 1 ] && [ "$CORR_OK" -eq 1 ] && [ "$ROI_OK" -eq 1 ]; then
    log "═══════════════════════════════════════════════════════════════════════"
    log "⚠️  MODEL IS PROFITABLE BUT RISKY"
    log "═══════════════════════════════════════════════════════════════════════"
    log ""
    log "💰 CONDITIONAL DEPLOYMENT:"
    log "   ✓ Accuracy is good (MAE, correlation)"
    log "   ✓ ROI is positive"
    log "   ⚠️ Risk metrics need attention (DD or ruin rate high)"
    log "   ⚠️ Use VERY conservative Kelly (0.1-0.15)"
    log "   ⚠️ Reduce max stake to 1-2%"
    log ""
    log "📋 RECOMMENDED IMPROVEMENTS:"
    log "   - Lower Kelly fraction to 0.15"
    log "   - Tighter edge thresholds (>8% instead of >5%)"
    log "   - Add more risk controls"
    log ""
    DEPLOY_READY=0
else
    log "═══════════════════════════════════════════════════════════════════════"
    log "🚨 MODEL NEEDS IMPROVEMENT"
    log "═══════════════════════════════════════════════════════════════════════"
    log ""
    log "⚠️  ISSUES DETECTED:"
    [ "$MAE_OK" -eq 0 ] && log "   ❌ MAE too high (${MAE} > 1.0) - predictions not accurate enough"
    [ "$CORR_OK" -eq 0 ] && log "   ❌ Correlation too low (${CORR} < 0.55) - weak predictive power"
    [ "$BIAS_OK" -eq 0 ] && log "   ❌ Significant bias (${ABS_BIAS} > 0.15) - systematic errors"
    [ "$ROI_OK" -eq 0 ] && log "   ❌ ROI too low (${ROI} < 3%) - not profitable enough"
    [ "$DD_OK" -eq 0 ] && log "   ❌ Drawdown too high (${DD95} > 35%) - excessive risk"
    [ "$RUIN_OK" -eq 0 ] && log "   ❌ Ruin risk too high (${RUIN} > 5%) - bankruptcy danger"
    log ""
    log "📋 REQUIRED IMPROVEMENTS:"
    log "   - Add more features (score effects, matchups, rest days)"
    log "   - Adjust methodology or parameters"
    log "   - Collect more training data"
    log "   - Tighten edge/EV thresholds"
    log ""
    log "⚠️  NOT RECOMMENDED for real money yet"
    log ""
    DEPLOY_READY=0
fi

# ============================================================================
# STEP 6: Auto-Commit Results
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 6: Saving Results to Git"
log "═══════════════════════════════════════════════════════════════════════"
log ""

# Save parameter hash for reproducibility
if [ -f "data/nhl/learned_parameters.json" ]; then
    PARAM_HASH=$(shasum -a 256 data/nhl/learned_parameters.json | cut -d' ' -f1)
    log "📝 Parameters hash: ${PARAM_HASH:0:16}..."
fi

git add data/nhl/historical_game_data.json 2>/dev/null || true
git add data/nhl/learned_parameters.json 2>/dev/null || true
git add data/nhl/walkforward_backtest_results.json 2>/dev/null || true
git add data/nhl/market_backtest_results.json 2>/dev/null || true
git add "$LOG_FILE" 2>/dev/null || true

if git diff --staged --quiet; then
    log "ℹ️  No changes to commit"
else
    COMMIT_MSG="feat: Auto-training complete - MAE:${MAE} Corr:${CORR} ROI:${ROI} [${GIT_COMMIT}]"
    git commit -m "$COMMIT_MSG" 2>&1 | tee -a "$LOG_FILE"
    log ""
    log "✅ Results committed to git"
    log ""
    log "📤 To push to GitHub:"
    log "   git push origin main42"
fi

log ""

# ============================================================================
# COMPLETION SUMMARY
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "🎉 AUTOMATED TRAINING PIPELINE COMPLETE!"
log "═══════════════════════════════════════════════════════════════════════"
log ""
log "📁 GENERATED FILES:"
log "   ✓ data/nhl/historical_game_data.json"
log "   ✓ data/nhl/learned_parameters.json"
log "   ✓ data/nhl/walkforward_backtest_results.json (no data leakage)"
log "   ✓ data/nhl/market_backtest_results.json"
log "   ✓ $LOG_FILE"
log ""
log "📊 FINAL RESULTS:"
log "   Accuracy:"
log "     MAE: ${MAE} shots"
log "     Correlation: ${CORR}"
log "     Bias: ${BIAS} shots"
log "   Profitability:"
log "     Total Bets: ${TOTAL_BETS}"
log "     ROI: $(echo "$ROI * 100" | bc -l | xargs printf "%.2f")%"
log "     Max DD (P95): $(echo "$DD95 * 100" | bc -l | xargs printf "%.1f")%"
log "     Ruin Risk: $(echo "$RUIN * 100" | bc -l | xargs printf "%.2f")%"
log ""

if [ "$DEPLOY_READY" -eq 1 ]; then
    log "✅ READY TO DEPLOY!"
else
    log "⚠️  Review results before deployment"
fi

log ""
log "═══════════════════════════════════════════════════════════════════════"
log "Full log saved to: $LOG_FILE"
log "═══════════════════════════════════════════════════════════════════════"
