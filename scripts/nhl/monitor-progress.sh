#!/bin/bash

###############################################################################
# Monitor NHL Historical Data Fetch Progress
###############################################################################

LOG_FILE="nhl-data-fetch.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Log file not found: $LOG_FILE"
    echo "Is the data fetch running?"
    exit 1
fi

# Function to extract latest progress
get_progress() {
    tail -50 "$LOG_FILE" | grep "Progress:" | tail -1
}

# Function to check if complete
is_complete() {
    tail -20 "$LOG_FILE" | grep -q "Data collection complete"
}

# Function to get current season
get_season() {
    tail -50 "$LOG_FILE" | grep "Processing" | tail -1 | sed 's/.*Processing //' | sed 's/\.\.\.//'
}

clear

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                                                                       ║"
echo "║         📊 NHL Historical Data Fetch - Progress Monitor              ║"
echo "║                                                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if process is still running
PID=$(ps aux | grep "historical-data-fetcher.mjs" | grep -v grep | awk '{print $2}')

if [ -z "$PID" ]; then
    if is_complete; then
        echo "✅ DATA FETCH COMPLETE!"
        echo ""
        tail -30 "$LOG_FILE" | tail -15
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════"
        echo "Next step: Run training pipeline"
        echo "  ./scripts/nhl/run-training-local.sh"
        echo "═══════════════════════════════════════════════════════════════════════"
    else
        echo "⚠️  Process not running (may have crashed or finished)"
        echo ""
        echo "Last 20 lines of log:"
        tail -20 "$LOG_FILE"
    fi
    exit 0
fi

echo "✅ Process running (PID: $PID)"
echo ""

# Display current season
SEASON=$(get_season)
if [ ! -z "$SEASON" ]; then
    echo "📅 Current season: $SEASON"
fi

# Display progress
PROGRESS=$(get_progress)
if [ ! -z "$PROGRESS" ]; then
    echo "$PROGRESS"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "Recent activity:"
echo ""
tail -10 "$LOG_FILE"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "Monitor live: tail -f $LOG_FILE"
echo "Kill process: kill $PID"
echo "Re-run monitor: ./scripts/nhl/monitor-progress.sh"
echo "═══════════════════════════════════════════════════════════════════════"
