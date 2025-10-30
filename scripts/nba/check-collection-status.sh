#!/bin/bash

echo "🏀 NBA Player Props - Data Collection Status"
echo "============================================"
echo ""

# Check if processes are running
echo "📡 Process Status:"
if ps aux | grep -E "collect-historical-odds" | grep -v grep > /dev/null; then
  echo "  ✅ Odds collector: RUNNING (PID $(ps aux | grep collect-historical-odds | grep -v grep | awk '{print $2}'))"
else
  echo "  ❌ Odds collector: NOT RUNNING"
fi

if ps aux | grep -E "collect-player-boxscores" | grep -v grep > /dev/null; then
  echo "  ✅ Boxscore collector: RUNNING (PID $(ps aux | grep collect-player-boxscores | grep -v grep | awk '{print $2}'))"
else
  echo "  ❌ Boxscore collector: NOT RUNNING"
fi

echo ""

# Check file sizes
echo "📊 Data File Status:"
if [ -f "data/nba/historical-odds-2024.json" ]; then
  SIZE=$(wc -c < data/nba/historical-odds-2024.json)
  LINES=$(wc -l < data/nba/historical-odds-2024.json)
  echo "  Odds data: $SIZE bytes, $LINES lines"
else
  echo "  Odds data: Not created yet"
fi

if [ -f "data/nba/player-boxscores-2024.json" ]; then
  SIZE=$(wc -c < data/nba/player-boxscores-2024.json)
  LINES=$(wc -l < data/nba/player-boxscores-2024.json)
  echo "  Boxscore data: $SIZE bytes, $LINES lines"
else
  echo "  Boxscore data: Not created yet"
fi

echo ""

# Check API credits
echo "💳 API Credits:"
RESPONSE=$(curl -s "https://api.the-odds-api.com/v4/sports/?apiKey=c5d3fe15e6c5be83b2acd8695cff012b")
USED=$(echo "$RESPONSE" | grep -o '"requests-used":[0-9]*' | grep -o '[0-9]*')
REMAINING=$(echo "$RESPONSE" | grep -o '"requests-remaining":[0-9]*' | grep -o '[0-9]*')

if [ -n "$USED" ]; then
  echo "  Used: $USED"
  echo "  Remaining: $REMAINING"
  
  # Calculate progress
  START_USED=27368
  CURRENT_DELTA=$((USED - START_USED))
  EST_GAMES=$((CURRENT_DELTA / 14))  # ~14 credits per game
  
  echo "  Games collected (est): $EST_GAMES / ~1,230"
  
  PERCENT=$((EST_GAMES * 100 / 1230))
  echo "  Progress: ${PERCENT}%"
else
  echo "  Could not fetch API status"
fi

echo ""
echo "⏰ Next check: Run this script again in 5 minutes"
echo "📋 When complete: Run feature engineering + training + backtest"
