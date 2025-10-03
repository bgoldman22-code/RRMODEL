#!/bin/bash
# scripts/run-nfl-backtest.sh
# Complete NFL backtesting pipeline

set -e

echo "🏈 NFL MODEL BACKTESTING PIPELINE"
echo "=================================="

# Default values
SEASON=2025
WEEKS="1,2,3"
INSTALL_DEPS=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --weeks)
      WEEKS="$2"
      shift 2
      ;;
    --season)
      SEASON="$2"
      shift 2
      ;;
    --install-deps)
      INSTALL_DEPS=true
      shift
      ;;
    *)
      echo "Unknown option $1"
      echo "Usage: ./scripts/run-nfl-backtest.sh --weeks 1,2,3 --season 2025 [--install-deps]"
      exit 1
      ;;
  esac
done

echo "📅 Season: $SEASON"
echo "📊 Weeks: $WEEKS"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Install dependencies if requested
if [ "$INSTALL_DEPS" = true ]; then
    echo "📦 Installing Python dependencies..."
    
    # Check if nfl_data_py is installed
    if ! python3 -c "import nfl_data_py" 2>/dev/null; then
        echo "Installing nfl_data_py..."
        pip3 install nfl_data_py
    fi
    
    # Check if pandas is installed
    if ! python3 -c "import pandas" 2>/dev/null; then
        echo "Installing pandas..."
        pip3 install pandas
    fi
    
    echo "✅ Dependencies installed"
    echo ""
fi

# Step 1: Fetch NFLVerse data with time constraints
echo "🔄 Step 1: Fetching historical NFLVerse data..."
python3 scripts/nfl-nflverse-data.py --weeks $WEEKS --season $SEASON

if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch NFLVerse data"
    exit 1
fi

echo "✅ NFLVerse data fetched successfully"
echo ""

# Step 2: Run backtesting analysis
echo "🔄 Step 2: Running backtest analysis..."
node scripts/nfl-backtest-system.js --weeks $WEEKS --season $SEASON

if [ $? -ne 0 ]; then
    echo "❌ Backtest analysis failed"
    exit 1
fi

echo "✅ Backtest analysis completed"
echo ""

# Step 3: Show results summary
echo "📋 BACKTEST SUMMARY"
echo "==================="

# Find the most recent backtest result
RESULT_FILE=$(ls -t backtest-results/backtest-$SEASON-W*.json 2>/dev/null | head -1)

if [ -n "$RESULT_FILE" ]; then
    echo "📁 Results file: $RESULT_FILE"
    
    # Extract key metrics using jq if available
    if command -v jq &> /dev/null; then
        echo ""
        echo "🎯 Key Metrics:"
        echo "  Games: $(jq -r '.analysis.overall.totalGames' "$RESULT_FILE")"
        echo "  ML Accuracy: $(jq -r '.analysis.overall.moneylineAccuracy' "$RESULT_FILE")%"
        echo "  Spread Accuracy: $(jq -r '.analysis.overall.spreadAccuracy' "$RESULT_FILE")%"
        echo "  Total Accuracy: $(jq -r '.analysis.overall.totalAccuracy' "$RESULT_FILE")%"
        echo "  Betting ROI: $(jq -r '.analysis.bettingSimulation.roi' "$RESULT_FILE")%"
        echo ""
        echo "💡 Summary: $(jq -r '.summary.accuracy' "$RESULT_FILE")"
    else
        echo "💡 Install jq for detailed metrics display: brew install jq"
    fi
else
    echo "⚠️ No results file found"
fi

echo ""
echo "🎉 Backtesting pipeline completed!"
echo ""
echo "📖 Next steps:"
echo "  1. Review results in backtest-results/ directory"
echo "  2. Analyze accuracy patterns by week"
echo "  3. Compare betting simulation ROI"
echo "  4. Identify model improvement opportunities"