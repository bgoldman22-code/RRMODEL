#!/bin/bash

# NFL Model V2 - Full Backtest Pipeline
# Runs all steps in sequence

set -e  # Exit on any error

echo "🏈 NFL Model V2 - Full Backtest Pipeline"
echo "========================================"
echo ""
echo "This will run the complete backtest for 2020-2024 seasons."
echo "Expected runtime: 2-3 hours (depending on API rate limits)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Change to script directory
cd "$(dirname "$0")"

echo ""
echo "Step 1/6: Fetching historical odds from TheOddsAPI..."
echo "------------------------------------------------------"
node 01-fetch-historical-odds.mjs
if [ $? -ne 0 ]; then
    echo "❌ Failed at Step 1"
    exit 1
fi

echo ""
echo "Step 2/6: Preparing NFLVerse data..."
echo "------------------------------------------------------"
node 02-prepare-nflverse-data.mjs
if [ $? -ne 0 ]; then
    echo "❌ Failed at Step 2"
    exit 1
fi

echo ""
echo "Step 3/6: Generating time-causal features..."
echo "------------------------------------------------------"
node 03-generate-features.mjs
if [ $? -ne 0 ]; then
    echo "❌ Failed at Step 3"
    exit 1
fi

echo ""
echo "Step 4/6: Running prediction engine..."
echo "------------------------------------------------------"
node 04-predict-games.mjs
if [ $? -ne 0 ]; then
    echo "❌ Failed at Step 4"
    exit 1
fi

echo ""
echo "Step 5/6: Calculating edges vs closing lines..."
echo "------------------------------------------------------"
node 05-calculate-edges.mjs
if [ $? -ne 0 ]; then
    echo "❌ Failed at Step 5"
    exit 1
fi

echo ""
echo "Step 6/6: Generating final reports..."
echo "------------------------------------------------------"
node 06-generate-reports.mjs
if [ $? -ne 0 ]; then
    echo "❌ Failed at Step 6"
    exit 1
fi

echo ""
echo "========================================"
echo "✅ NFL Model V2 Backtest Complete!"
echo "========================================"
echo ""
echo "📊 Results available in: nfl-model-v2/output/"
echo ""
echo "View reports:"
echo "  cat nfl-model-v2/output/monotonicity_score.txt"
echo "  cat nfl-model-v2/output/performance_by_season.json"
echo "  cat nfl-model-v2/output/edge_bucket_table.json"
echo ""
