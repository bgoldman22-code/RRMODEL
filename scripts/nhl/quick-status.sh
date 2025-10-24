#!/bin/bash

###############################################################################
# Quick Status Checker - See what's running and progress
###############################################################################

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                                                                       ║"
echo "║         🔍 NHL ELITE MODEL - STATUS CHECK                             ║"
echo "║                                                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# Check for running processes
echo "🔄 RUNNING PROCESSES:"
echo ""

DATA_FETCH_PID=$(pgrep -f "historical-data-fetcher.mjs" || echo "")
PIPELINE_PID=$(pgrep -f "unattended-full-pipeline.sh" || echo "")

if [ -n "$DATA_FETCH_PID" ]; then
    echo "✅ Data Fetch: Running (PID: $DATA_FETCH_PID)"
else
    echo "⏸️  Data Fetch: Not running"
fi

if [ -n "$PIPELINE_PID" ]; then
    echo "✅ Training Pipeline: Running (PID: $PIPELINE_PID)"
else
    echo "⏸️  Training Pipeline: Not running"
fi

echo ""

# Check data status
echo "═══════════════════════════════════════════════════════════════════════"
echo "📊 DATA STATUS:"
echo ""

if [ -f "data/nhl/historical_game_data.json" ]; then
    GAMES=$(jq '.games | length' data/nhl/historical_game_data.json 2>/dev/null || echo "unknown")
    echo "✅ Historical Data: $GAMES games"
else
    echo "⏳ Historical Data: Not yet complete"
    if [ -f "nhl-data-fetch.log" ]; then
        LAST_UPDATE=$(tail -1 nhl-data-fetch.log)
        echo "   Last update: $LAST_UPDATE"
    fi
fi

if [ -f "data/nhl/learned_parameters.json" ]; then
    echo "✅ Parameters: Fitted"
else
    echo "⏳ Parameters: Not yet fitted"
fi

if [ -f "data/nhl/walkforward_backtest_results.json" ]; then
    MAE=$(jq -r '.metrics.mae' data/nhl/walkforward_backtest_results.json 2>/dev/null || echo "N/A")
    CORR=$(jq -r '.metrics.correlation' data/nhl/walkforward_backtest_results.json 2>/dev/null || echo "N/A")
    echo "✅ Walk-Forward Backtest: Complete"
    echo "   MAE: $MAE | Correlation: $CORR"
else
    echo "⏳ Walk-Forward Backtest: Not yet complete"
fi

if [ -f "data/nhl/market_backtest_results.json" ]; then
    ROI=$(jq -r '.summary.roi' data/nhl/market_backtest_results.json 2>/dev/null || echo "N/A")
    BETS=$(jq -r '.summary.totalBets' data/nhl/market_backtest_results.json 2>/dev/null || echo "N/A")
    echo "✅ Market Backtest: Complete"
    echo "   Bets: $BETS | ROI: $(echo "$ROI * 100" | bc -l | xargs printf "%.2f" 2>/dev/null || echo "$ROI")%"
else
    echo "⏳ Market Backtest: Not yet complete"
fi

echo ""

# Recent logs
echo "═══════════════════════════════════════════════════════════════════════"
echo "📋 RECENT ACTIVITY:"
echo ""

if [ -f "unattended-pipeline-output.log" ]; then
    echo "Last 10 lines from pipeline:"
    tail -10 unattended-pipeline-output.log | sed 's/^/   /'
else
    echo "No pipeline log yet"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "MONITORING COMMANDS:"
echo "   Watch pipeline: tail -f unattended-pipeline-output.log"
echo "   Watch data fetch: tail -f nhl-data-fetch.log"
echo "   Check status: ./scripts/nhl/quick-status.sh"
echo "═══════════════════════════════════════════════════════════════════════"
