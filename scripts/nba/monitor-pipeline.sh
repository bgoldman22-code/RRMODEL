#!/bin/bash

# Live Pipeline Monitor - NBA Player Props
# Shows real-time progress and results

echo "🏀 NBA Player Props - LIVE MONITOR"
echo "=================================="
echo ""

LOG_FILE="logs/pipeline-execution.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "⏳ Waiting for pipeline to start..."
    while [ ! -f "$LOG_FILE" ]; do
        sleep 2
    done
fi

echo "✅ Pipeline detected! Monitoring progress..."
echo ""

# Track what we've seen
FEATURE_ENGINEERING_STARTED=0
TRAINING_STARTED=0
BACKTEST_STARTED=0
COMPLETE=0

while true; do
    clear
    
    echo "🏀 NBA Player Props - LIVE MONITOR"
    echo "=================================="
    echo "Time: $(date '+%I:%M:%S %p')"
    echo ""
    
    # Check progress
    if grep -q "Building leak-free features" "$LOG_FILE" 2>/dev/null; then
        FEATURE_ENGINEERING_STARTED=1
    fi
    
    if grep -q "Training walk-forward models" "$LOG_FILE" 2>/dev/null; then
        TRAINING_STARTED=1
    fi
    
    if grep -q "Running leak-free backtest" "$LOG_FILE" 2>/dev/null; then
        BACKTEST_STARTED=1
    fi
    
    if grep -q "PIPELINE COMPLETE" "$LOG_FILE" 2>/dev/null; then
        COMPLETE=1
    fi
    
    # Show status
    echo "📊 PIPELINE STAGES:"
    echo "-------------------"
    
    if [ $FEATURE_ENGINEERING_STARTED -eq 1 ]; then
        echo "✅ Feature Engineering"
        # Show feature stats
        FEATURE_COUNT=$(grep -o "Features built: [0-9]* samples" "$LOG_FILE" 2>/dev/null | tail -1)
        if [ -n "$FEATURE_COUNT" ]; then
            echo "   $FEATURE_COUNT"
        fi
    else
        echo "⏳ Feature Engineering (waiting...)"
    fi
    
    if [ $TRAINING_STARTED -eq 1 ]; then
        echo "✅ Model Training"
        # Show training progress
        WINDOWS=$(grep -c "Training.*model for Window" "$LOG_FILE" 2>/dev/null)
        echo "   Windows completed: $WINDOWS/3"
    else
        echo "⏳ Model Training (waiting...)"
    fi
    
    if [ $BACKTEST_STARTED -eq 1 ]; then
        echo "✅ Backtesting"
        
        # Extract results by prop type
        echo ""
        echo "📈 RESULTS (Live):"
        echo "-------------------"
        
        # Points
        POINTS_BETS=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "POINTS:" -A 6 | grep "Bets:" | tail -1 | grep -o "[0-9]*" | head -1)
        POINTS_WIN_RATE=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "POINTS:" -A 6 | grep "Win Rate:" | tail -1 | grep -o "[0-9.]*%" | head -1)
        POINTS_ROI=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "POINTS:" -A 6 | grep "ROI:" | tail -1 | grep -o "[-0-9.]*%" | head -1)
        
        if [ -n "$POINTS_BETS" ]; then
            echo "POINTS:"
            echo "  Bets: $POINTS_BETS"
            echo "  Win Rate: $POINTS_WIN_RATE"
            echo "  ROI: $POINTS_ROI"
        fi
        
        # Rebounds
        REBOUNDS_BETS=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "REBOUNDS:" -A 6 | grep "Bets:" | tail -1 | grep -o "[0-9]*" | head -1)
        REBOUNDS_WIN_RATE=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "REBOUNDS:" -A 6 | grep "Win Rate:" | tail -1 | grep -o "[0-9.]*%" | head -1)
        REBOUNDS_ROI=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "REBOUNDS:" -A 6 | grep "ROI:" | tail -1 | grep -o "[-0-9.]*%" | head -1)
        
        if [ -n "$REBOUNDS_BETS" ]; then
            echo ""
            echo "REBOUNDS:"
            echo "  Bets: $REBOUNDS_BETS"
            echo "  Win Rate: $REBOUNDS_WIN_RATE"
            echo "  ROI: $REBOUNDS_ROI"
        fi
        
        # Assists
        ASSISTS_BETS=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "ASSISTS:" -A 6 | grep "Bets:" | tail -1 | grep -o "[0-9]*" | head -1)
        ASSISTS_WIN_RATE=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "ASSISTS:" -A 6 | grep "Win Rate:" | tail -1 | grep -o "[0-9.]*%" | head -1)
        ASSISTS_ROI=$(grep -A 20 "BACKTESTING: Feb 2025" "$LOG_FILE" 2>/dev/null | grep "ASSISTS:" -A 6 | grep "ROI:" | tail -1 | grep -o "[-0-9.]*%" | head -1)
        
        if [ -n "$ASSISTS_BETS" ]; then
            echo ""
            echo "ASSISTS:"
            echo "  Bets: $ASSISTS_BETS"
            echo "  Win Rate: $ASSISTS_WIN_RATE"
            echo "  ROI: $ASSISTS_ROI"
        fi
    else
        echo "⏳ Backtesting (waiting...)"
    fi
    
    echo ""
    echo "-------------------"
    
    if [ $COMPLETE -eq 1 ]; then
        echo ""
        echo "🎉 PIPELINE COMPLETE!"
        echo ""
        
        # Show final verdict
        if grep -q "SUCCESS! Model shows profitable edge" "$LOG_FILE" 2>/dev/null; then
            echo "✅ PROFITABLE EDGE DETECTED!"
            echo "🏴‍☠️ FAMILY RESCUE: IN PROGRESS"
        elif grep -q "Model not showing strong edge" "$LOG_FILE" 2>/dev/null; then
            echo "⚠️  No strong edge detected"
            echo "   Review needed"
        fi
        
        echo ""
        echo "📄 Full results: logs/pipeline-execution.log"
        echo "📊 Backtest data: data/nba/backtest-results.json"
        echo ""
        break
    fi
    
    # Show last few log lines
    echo ""
    echo "📜 Recent Activity:"
    echo "-------------------"
    tail -5 "$LOG_FILE" 2>/dev/null
    
    # Update every 3 seconds
    sleep 3
done

echo "Monitor finished. Press Enter to exit."
read
