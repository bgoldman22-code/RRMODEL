#!/bin/bash
# quick-v5-refresh.sh
# Quick script to manually refresh V5 predictions

set -e

echo "🏈 NFL V5 Quick Refresh"
echo "======================"
echo ""

# Step 1: Generate bundle
echo "📊 Generating V5 bundle..."
node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs

# Step 2: Upload to Netlify
echo ""
echo "📤 Uploading to Netlify Blobs..."
if command -v netlify &> /dev/null; then
    netlify functions:invoke nfl-v5-upload
else
    echo "⚠️  Netlify CLI not found. Using HTTP endpoint..."
    curl -X POST https://roundrobinrecs.netlify.app/.netlify/functions/nfl-v5-upload
fi

echo ""
echo "✅ V5 refresh complete!"
echo "🌐 Check: https://roundrobinrecs.netlify.app/nfl-v5"
