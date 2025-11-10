#!/bin/bash
# V5 Option 3 - Quick Deployment Script

echo "🚀 Deploying NFL V5 Option 3 (Hybrid Cache + Refresh)"
echo "======================================================"
echo ""

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "⚠️  You have uncommitted changes:"
  git status -s
  echo ""
  read -p "Continue with deployment? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
  fi
fi

echo "📦 Committing V5 Option 3 changes..."
git add netlify/functions/nfl-v5-refresh-now.mjs
git add src/pages/NFLPredictionsV5.jsx
git add src/App.jsx
git add V5_OPTION3_IMPLEMENTATION.md
git add deploy-v5-option3.sh
git commit -m "feat: NFL V5 Option 3 - hybrid cache with on-demand refresh

- Add nfl-v5-refresh-now endpoint for fresh predictions
- Create NFLPredictionsV5 page with refresh button
- Show data source (cached vs fresh) and timestamps
- User controls when to fetch latest odds/injuries
- Fast initial load (100ms cached) + 3-5s refresh option"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main42

echo ""
echo "⏳ Waiting for Netlify deploy..."
echo "   Monitor at: https://app.netlify.com/sites/YOUR-SITE/deploys"
echo ""
echo "📋 POST-DEPLOY STEPS:"
echo "   1. Wait for deploy to complete (~2-3 minutes)"
echo "   2. Trigger initial V5 upload:"
echo "      curl -X POST https://bgroundrobin.com/.netlify/functions/nfl-v5-weekly-refresh"
echo ""
echo "   3. Test the new page:"
echo "      https://bgroundrobin.com/predictions-v5"
echo ""
echo "   4. Verify refresh button:"
echo "      - Click '🔄 Refresh Now'"
echo "      - Should show spinner then update"
echo "      - Badge should change to '🔴 Live Data'"
echo ""
echo "✅ Deployment initiated!"
