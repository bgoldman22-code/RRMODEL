#!/bin/bash
#
# test-hybrid-system.sh
# Quick test script for NFL Hybrid Model System
#
# Usage: bash test-hybrid-system.sh 2025 14

set -e  # Exit on error

SEASON=${1:-2025}
WEEK=${2:-14}

echo "========================================"
echo "NFL Hybrid Model System - Test Script"
echo "========================================"
echo ""
echo "Testing for Season ${SEASON}, Week ${WEEK}"
echo ""

# Step 1: Check if V5 bundle exists
echo "📋 Step 1: Checking for V5 predictions..."
V5_FILE="nfl-model-v4.1/output/bundle_v5_${SEASON}_week${WEEK}.json"

if [ ! -f "$V5_FILE" ]; then
    echo "❌ V5 predictions not found: $V5_FILE"
    echo "   Run: node nfl-model-v4.1/scripts/v5-ensemble.mjs ${SEASON} ${WEEK}"
    exit 1
fi

echo "✅ V5 predictions found"
echo ""

# Step 2: Run hybrid model
echo "📊 Step 2: Running hybrid model..."
node scripts/nfl/run-hybrid-local.mjs ${SEASON} ${WEEK}

if [ $? -ne 0 ]; then
    echo "❌ Hybrid model failed"
    exit 1
fi

echo "✅ Hybrid predictions generated"
echo ""

# Step 3: Check hybrid output
echo "📋 Step 3: Checking hybrid output..."
HYBRID_FILE="output/nfl_hybrid_${SEASON}_week${WEEK}.json"

if [ ! -f "$HYBRID_FILE" ]; then
    echo "❌ Hybrid output not found: $HYBRID_FILE"
    exit 1
fi

echo "✅ Hybrid output found: $HYBRID_FILE"
echo ""

# Step 4: Generate PNG reports
echo "📊 Step 4: Generating PNG reports..."
python3 scripts/nfl/export-hybrid-reports.py ${SEASON} ${WEEK}

if [ $? -ne 0 ]; then
    echo "❌ Report generation failed"
    exit 1
fi

echo "✅ PNG reports generated"
echo ""

# Step 5: Verify PNG files
echo "📋 Step 5: Verifying PNG files..."
FULL_SLATE_PNG="$HOME/Downloads/nfl_full_slate_week${WEEK}_${SEASON}.png"
RECOMMENDED_PNG="$HOME/Downloads/nfl_recommended_picks_week${WEEK}_${SEASON}.png"

if [ ! -f "$FULL_SLATE_PNG" ]; then
    echo "❌ Full slate PNG not found: $FULL_SLATE_PNG"
    exit 1
fi

if [ ! -f "$RECOMMENDED_PNG" ]; then
    echo "❌ Recommended picks PNG not found: $RECOMMENDED_PNG"
    exit 1
fi

echo "✅ Both PNG files created successfully"
echo ""

# Step 6: Display summary
echo "========================================"
echo "✅ ALL TESTS PASSED"
echo "========================================"
echo ""
echo "📁 Files created:"
echo "   1. $HYBRID_FILE"
echo "   2. $FULL_SLATE_PNG"
echo "   3. $RECOMMENDED_PNG"
echo ""
echo "📊 Summary from JSON:"
jq -r '.meta | "   Games: \(.games_count)\n   Model: \(.model_version)\n   Generated: \(.generated_at)"' "$HYBRID_FILE"
echo ""
echo "🎯 Next steps:"
echo "   1. Open PNG files in Downloads folder"
echo "   2. Review hybrid picks in JSON file"
echo "   3. Compare with V1 and V5 individual outputs"
echo ""
