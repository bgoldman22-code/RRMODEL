#!/bin/bash
# Quick progress check for NFL Receiving Props Backtest

echo ""
echo "🏈 NFL RECEIVING PROPS BACKTEST - LIVE PROGRESS"
echo "================================================"
echo ""

LOG_FILE="data/nfl_receiving_props/backtest_output.log"

if [ ! -f "$LOG_FILE" ]; then
  echo "❌ Backtest not running or log file not found"
  exit 1
fi

# Count completed weeks
COMPLETED=$(grep -c "✅ Generated.*predictions" "$LOG_FILE")
TOTAL=42

PCT=$(echo "scale=1; $COMPLETED / $TOTAL * 100" | bc)

echo "📊 PROGRESS:"
echo "   Completed: $COMPLETED / $TOTAL weeks ($PCT%)"
echo ""

# Show last 5 completed weeks
echo "📋 RECENT ACTIVITY:"
grep "Testing.*Week" "$LOG_FILE" | tail -5
echo ""

# Show total predictions generated so far
TOTAL_PREDS=$(grep "Generated.*predictions" "$LOG_FILE" | awk '{sum += $3} END {print sum}')
if [ ! -z "$TOTAL_PREDS" ]; then
  echo "📈 PREDICTIONS GENERATED: $TOTAL_PREDS"
  echo ""
fi

# Estimate time remaining
if [ $COMPLETED -gt 0 ]; then
  # Check how long it's been running
  START_TIME=$(stat -f %B "$LOG_FILE")
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  AVG_TIME_PER_WEEK=$((ELAPSED / COMPLETED))
  REMAINING_WEEKS=$((TOTAL - COMPLETED))
  EST_REMAINING=$((AVG_TIME_PER_WEEK * REMAINING_WEEKS))
  
  # Convert to minutes
  EST_MIN=$((EST_REMAINING / 60))
  
  echo "⏱️  ESTIMATED TIME REMAINING: ~$EST_MIN minutes"
  echo ""
fi

echo "🔄 To refresh: bash scripts/nfl-receiving-props/check_progress.sh"
echo "📄 Full log: tail -f $LOG_FILE"
echo ""
