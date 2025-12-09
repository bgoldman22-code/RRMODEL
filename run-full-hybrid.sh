#!/bin/bash
##
## NFL Hybrid System - Full V1+V5 Analysis
## Usage: bash run-full-hybrid.sh [season] [week]
## Example: bash run-full-hybrid.sh 2025 15
##

set -e

SEASON=${1:-2025}
WEEK=${2:-15}

echo "========================================"
echo "🏈 NFL HYBRID SYSTEM - V1 + V5"
echo "========================================"
echo ""
echo "Season: $SEASON"
echo "Week: $WEEK"
echo ""
echo "📋 PREREQUISITES:"
echo "   ✅ Netlify dev server must be running"
echo "   ✅ Run 'npm run netlify:dev' in separate terminal"
echo "   ✅ Wait for 'Server now ready' message"
echo ""

# Check if Netlify dev server is running
if ! curl -s http://localhost:8888 > /dev/null 2>&1; then
    echo "❌ ERROR: Netlify dev server not detected on http://localhost:8888"
    echo ""
    echo "📋 TO START NETLIFY DEV SERVER:"
    echo "   1. Open a new terminal"
    echo "   2. cd $(pwd)"
    echo "   3. npm run netlify:dev"
    echo "   4. Wait for 'Server now ready' message"
    echo "   5. Re-run this script"
    echo ""
    exit 1
fi

echo "✅ Netlify dev server detected"
echo ""
echo "🚀 Running hybrid system..."
echo ""

# Run hybrid system
node scripts/nfl/run-hybrid-local.mjs $SEASON $WEEK

# Generate PNG reports
echo ""
echo "📊 Generating PNG reports..."
python3 scripts/nfl/export-hybrid-reports.py $SEASON $WEEK

echo ""
echo "========================================"
echo "✅ COMPLETE - Check ~/Downloads/ for PNGs"
echo "========================================"
