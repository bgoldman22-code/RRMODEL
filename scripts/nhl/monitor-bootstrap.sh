#!/bin/bash

# NHL Player Stats Bootstrap Monitor
# Usage: ./scripts/nhl/monitor-bootstrap.sh

echo "🔍 NHL Player Stats Bootstrap Monitor"
echo "======================================"
echo ""

# Check if process is running
if ps aux | grep -q "[b]ootstrap-player-stats.mjs"; then
    echo "✅ Bootstrap process is RUNNING"
    PID=$(ps aux | grep "[b]ootstrap-player-stats.mjs" | awk '{print $2}')
    echo "   Process ID: $PID"
    
    # Show elapsed time
    ELAPSED=$(ps -p $PID -o etime= | tr -d ' ')
    echo "   Elapsed time: $ELAPSED"
else
    echo "❌ Bootstrap process is NOT running"
    
    # Check if it completed successfully
    if [ -f "data/nhl/player_stats_20252026.json" ]; then
        PLAYERS=$(cat data/nhl/player_stats_20252026.json | grep -o '"totalPlayers":[0-9]*' | cut -d':' -f2)
        echo "   Data file exists with $PLAYERS players"
        
        if [ "$PLAYERS" -ge 300 ]; then
            echo "   ✅ SUCCESS: Bootstrap completed with $PLAYERS players"
        else
            echo "   ⚠️  WARNING: Only $PLAYERS players (need 300+)"
        fi
    fi
fi

echo ""
echo "📊 Recent log output (last 15 lines):"
echo "--------------------------------------"
tail -15 bootstrap-player-stats.log 2>/dev/null || echo "No log file found"

echo ""
echo "💡 Commands:"
echo "   Monitor continuously: watch -n 5 ./scripts/nhl/monitor-bootstrap.sh"
echo "   View full log: tail -f bootstrap-player-stats.log"
echo "   Check file size: ls -lh data/nhl/player_stats_20252026.json"
