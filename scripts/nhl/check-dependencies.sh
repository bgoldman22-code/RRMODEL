#!/bin/bash

###############################################################################
# DEPENDENCY CHECK - Verify system ready for auto-training
###############################################################################

echo "🔍 Checking system dependencies..."
echo ""

ALL_GOOD=1

# Check Node.js
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js: NOT FOUND"
    echo "   Install: https://nodejs.org/ or 'brew install node'"
    ALL_GOOD=0
fi

# Check jq
if command -v jq >/dev/null 2>&1; then
    JQ_VERSION=$(jq --version)
    echo "✅ jq: $JQ_VERSION"
else
    echo "❌ jq: NOT FOUND"
    echo "   Install: brew install jq"
    ALL_GOOD=0
fi

# Check bc
if command -v bc >/dev/null 2>&1; then
    echo "✅ bc: installed"
else
    echo "❌ bc: NOT FOUND"
    echo "   Install: brew install bc"
    ALL_GOOD=0
fi

# Check git
if command -v git >/dev/null 2>&1; then
    GIT_VERSION=$(git --version)
    echo "✅ Git: $GIT_VERSION"
else
    echo "❌ Git: NOT FOUND"
    ALL_GOOD=0
fi

echo ""

# Check for data directory
if [ -d "data/nhl" ]; then
    echo "✅ data/nhl directory exists"
else
    echo "⚠️  data/nhl directory missing (will be created automatically)"
    mkdir -p data/nhl
    echo "   Created data/nhl"
fi

# Check for existing data
if [ -f "data/nhl/historical_game_data.json" ]; then
    GAMES_COUNT=$(cat data/nhl/historical_game_data.json | jq '.games | length' 2>/dev/null || echo "unknown")
    echo "✅ Historical data exists ($GAMES_COUNT games)"
else
    echo "ℹ️  No historical data yet (will fetch on first run)"
fi

echo ""

if [ $ALL_GOOD -eq 1 ]; then
    echo "═══════════════════════════════════════════════════════════════"
    echo "✅ SYSTEM READY - All dependencies satisfied!"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "You can now run:"
    echo "  ./scripts/nhl/auto-train-complete.sh"
    echo ""
    echo "Estimated time: 60-90 minutes (unattended)"
    echo ""
else
    echo "═══════════════════════════════════════════════════════════════"
    echo "⚠️  MISSING DEPENDENCIES - Install required packages above"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Quick fix (macOS):"
    echo "  brew install node jq bc"
    echo ""
fi
