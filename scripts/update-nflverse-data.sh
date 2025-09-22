#!/bin/bash

# Manual NFLverse Data Update Script (R Pipeline)
# Usage: ./update-nflverse-data.sh [week_number]

set -e

WEEK=${1:-3}
SEASON=${2:-2025}

echo "🏈 Starting R NFLverse data update for Week $WEEK, Season $SEASON..."

# Set environment variables
export NFL_WEEK=$WEEK
export NFL_SEASON=$SEASON

# Create timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "📅 Update started at: $TIMESTAMP"

# Check if R is installed
if ! command -v Rscript &> /dev/null; then
    echo "❌ R is not installed. Please install R first."
    exit 1
fi

# Run R NFLverse data pipeline
echo "📊 Running cloud-optimized R pipeline..."
Rscript scripts/nfl-td-r-pipeline/cloud-pipeline.R

echo "🔄 Converting R data for React component..."
Rscript convert_for_react.R

# Update ESPN depth charts as backup
echo "📋 Updating ESPN depth charts..."
node scripts/collect-espn-depth-charts.js

# Archive previous week data if it exists
if [ -d "src/data/nfl/2025/week$((WEEK-1))" ]; then
    echo "📦 Archiving previous week data..."
    mkdir -p "history/2025/week$((WEEK-1))"
    cp -r "src/data/nfl/2025/week$((WEEK-1))"/* "history/2025/week$((WEEK-1))/" 2>/dev/null || true
fi

echo "✅ R NFLverse data update completed!"
echo "📋 Summary:"
echo "  - Week: $WEEK"
echo "  - Season: $SEASON" 
echo "  - Updated: $TIMESTAMP"
echo "  - Pipeline: R (nflfastR/nflreadr)"
echo ""
echo "🚀 Ready to commit and push? Run:"
echo "  git add *.json data/ src/data/ public/data/"
echo "  git commit -m 'Update NFLverse data for Week $WEEK via R pipeline'"
echo "  git push origin main33"