#!/bin/bash

###############################################################################
# NHL ELITE MODEL - UNATTENDED FULL PIPELINE
# 
# Waits for data fetch → Runs training → Validates → Commits results
# Safe to leave running for 10+ hours unattended
# 
# Usage: ./scripts/nhl/unattended-full-pipeline.sh
###############################################################################

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
cd "$REPO_ROOT"

LOG_FILE="unattended-pipeline-$(date +%Y%m%d-%H%M%S).log"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "╔═══════════════════════════════════════════════════════════════════════╗"
log "║                                                                       ║"
log "║       🤖 NHL ELITE - UNATTENDED FULL PIPELINE                         ║"
log "║          Safe to leave for 10+ hours                                  ║"
log "║                                                                       ║"
log "╚═══════════════════════════════════════════════════════════════════════╝"
log ""
log "📁 Log file: $LOG_FILE"
log "⏰ Started: $(date)"
log ""

# ============================================================================
# STEP 1: Wait for data fetch to complete
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 1: Waiting for Historical Data Fetch"
log "═══════════════════════════════════════════════════════════════════════"
log ""

DATA_FILE="data/nhl/historical_game_data.json"

if [ -f "$DATA_FILE" ]; then
    EXISTING_GAMES=$(cat "$DATA_FILE" | jq '.games | length' 2>/dev/null || echo "0")
    log "✅ Data file already exists ($EXISTING_GAMES games)"
    log "   Using existing data"
    log ""
else
    log "⏳ Waiting for data fetch to complete..."
    log "   Checking every 60 seconds..."
    log ""
    
    WAIT_COUNT=0
    MAX_WAIT=180  # 3 hours max wait
    
    while [ ! -f "$DATA_FILE" ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        sleep 60
        WAIT_COUNT=$((WAIT_COUNT + 1))
        
        if [ $((WAIT_COUNT % 5)) -eq 0 ]; then
            # Check log every 5 minutes
            if [ -f "nhl-data-fetch.log" ]; then
                LAST_LINE=$(tail -1 nhl-data-fetch.log)
                log "   Status: $LAST_LINE"
            fi
        fi
    done
    
    if [ ! -f "$DATA_FILE" ]; then
        log "❌ ERROR: Data fetch did not complete after 3 hours"
        log "   Check: tail -100 nhl-data-fetch.log"
        exit 1
    fi
    
    log "✅ Data fetch completed!"
    log ""
fi

# ============================================================================
# STEP 2: Run Complete Training Pipeline
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "STEP 2: Running Complete Training Pipeline"
log "═══════════════════════════════════════════════════════════════════════"
log ""
log "🚀 Executing: ./scripts/nhl/auto-train-complete.sh"
log ""

# Run the full training pipeline
./scripts/nhl/auto-train-complete.sh 2>&1 | tee -a "$LOG_FILE"

TRAINING_EXIT_CODE=$?

log ""
if [ $TRAINING_EXIT_CODE -eq 0 ]; then
    log "✅ Training pipeline completed successfully"
else
    log "❌ Training pipeline failed with exit code: $TRAINING_EXIT_CODE"
    exit $TRAINING_EXIT_CODE
fi

log ""

# ============================================================================
# STEP 3: Summary & Recommendations
# ============================================================================

log "═══════════════════════════════════════════════════════════════════════"
log "🎉 UNATTENDED PIPELINE COMPLETE!"
log "═══════════════════════════════════════════════════════════════════════"
log ""
log "⏰ Finished: $(date)"
log ""

# Check if results exist
if [ -f "data/nhl/walkforward_backtest_results.json" ]; then
    MAE=$(jq -r '.metrics.mae // "N/A"' data/nhl/walkforward_backtest_results.json)
    CORR=$(jq -r '.metrics.correlation // "N/A"' data/nhl/walkforward_backtest_results.json)
    PREDS=$(jq -r '.totalPredictions // "N/A"' data/nhl/walkforward_backtest_results.json)
    
    log "📊 VALIDATION RESULTS (No Data Leakage):"
    log "   Total Predictions: $PREDS"
    log "   MAE: $MAE"
    log "   Correlation: $CORR"
    log ""
fi

if [ -f "data/nhl/market_backtest_results.json" ]; then
    ROI=$(jq -r '.summary.roi // "N/A"' data/nhl/market_backtest_results.json)
    BETS=$(jq -r '.summary.totalBets // "N/A"' data/nhl/market_backtest_results.json)
    
    log "💰 PROFITABILITY RESULTS:"
    log "   Total Bets: $BETS"
    log "   ROI: $(echo "$ROI * 100" | bc -l | xargs printf "%.2f" 2>/dev/null || echo "$ROI")%"
    log ""
fi

log "📁 ALL RESULTS SAVED TO:"
log "   - data/nhl/historical_game_data.json"
log "   - data/nhl/learned_parameters.json"
log "   - data/nhl/walkforward_backtest_results.json"
log "   - data/nhl/market_backtest_results.json"
log "   - $LOG_FILE"
log ""

log "📤 NEXT STEPS:"
log "   Review results in the JSON files above"
log "   If metrics pass, deploy with: git push origin main42"
log ""

log "═══════════════════════════════════════════════════════════════════════"
log "Full log: $LOG_FILE"
log "═══════════════════════════════════════════════════════════════════════"
