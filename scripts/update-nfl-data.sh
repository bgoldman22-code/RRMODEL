#!/bin/bash
# scripts/update-nfl-data.sh
# Complete NFL data pipeline automation

set -e  # Exit on any error

echo "🏈 NFL DATA PIPELINE AUTOMATION"
echo "================================"

# Configuration
WEEK=${NFL_WEEK:-4}
SEASON=${NFL_SEASON:-2025}
BRANCH=${GIT_BRANCH:-main33}

echo "📊 Week: $WEEK"
echo "📅 Season: $SEASON"
echo "🌲 Branch: $BRANCH"
echo ""

# Step 1: Check prerequisites
echo "🔍 STEP 1: Checking Prerequisites"
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    exit 1
fi

echo "✅ Prerequisites OK"
echo ""

# Step 2: Run master data pipeline
echo "🚀 STEP 2: Running Master Data Pipeline"
export NFL_WEEK=$WEEK
export NFL_SEASON=$SEASON

node scripts/master-data-pipeline.js

if [ $? -ne 0 ]; then
    echo "❌ Data pipeline failed"
    exit 1
fi

echo "✅ Data pipeline completed"
echo ""

# Step 3: Validate generated files
echo "📋 STEP 3: Validating Generated Files"

REQUIRED_FILES=(
    "public/nfl-anytime-td-player-data.json"
    "public/data/nfl-schedule-2025.json"
    "public/data/nfl-td-comprehensive-latest.json"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Required file missing: $file"
        exit 1
    fi
    
    # Check if file is valid JSON
    if ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
        echo "❌ Invalid JSON in: $file"
        exit 1
    fi
    
    SIZE=$(du -h "$file" | cut -f1)
    echo "✅ $file ($SIZE)"
done

echo ""

# Step 4: Git operations
echo "📤 STEP 4: Git Operations"

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository"
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet; then
    echo "⚠️ Uncommitted changes detected"
fi

# Stage data files
echo "📋 Staging data files..."
git add public/nfl-anytime-td-player-data.json
git add public/data/
git add history/

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "ℹ️ No changes to commit"
else
    # Create commit message
    PLAYER_COUNT=$(python3 -c "import json; data=json.load(open('public/nfl-anytime-td-player-data.json')); print(len(data.get('players', {})))")
    COMMIT_MSG="Data update: Week $WEEK NFL predictions with $PLAYER_COUNT players"
    
    echo "💾 Committing changes..."
    git commit -m "$COMMIT_MSG"
    
    echo "🚀 Pushing to origin/$BRANCH..."
    git push origin $BRANCH
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully pushed to GitHub"
    else
        echo "❌ Push failed - check git credentials and connectivity"
        exit 1
    fi
fi

echo ""

# Step 5: Deployment verification
echo "🔍 STEP 5: Deployment Verification"

echo "⏳ Waiting for Netlify deployment (30 seconds)..."
sleep 30

# Test the live endpoint
ENDPOINT_URL="https://bgroundrobin.com/.netlify/functions/nfl-td-comprehensive-predictions?week=$WEEK"
echo "🌐 Testing endpoint: $ENDPOINT_URL"

if curl -s -f "$ENDPOINT_URL" > /dev/null; then
    echo "✅ Live endpoint responding"
else
    echo "⚠️ Live endpoint not responding - may still be deploying"
fi

echo ""
echo "🎉 NFL DATA PIPELINE COMPLETE!"
echo "================================"
echo ""
echo "📊 Summary:"
echo "- Player data: public/nfl-anytime-td-player-data.json"
echo "- Schedule: public/data/nfl-schedule-2025.json"  
echo "- Predictions: public/data/nfl-td-comprehensive-latest.json"
echo "- Live odds: public/data/nfl-player-prop-odds-latest.json (if available)"
echo ""
echo "🌐 Frontend can now access data via:"
echo "- Direct JSON files: /nfl-anytime-td-player-data.json"
echo "- Live function: /.netlify/functions/nfl-td-comprehensive-predictions"
echo ""
echo "✅ Pipeline completed successfully!"