#!/bin/bash

# Regenerate NBA Predictions
# Calls the Netlify function to regenerate predictions with latest data/code

echo "🏀 Regenerating NBA predictions..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  "https://rrmodel.netlify.app/.netlify/functions/nba-predictions-generate" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ SUCCESS - Predictions regenerated"
  echo ""
  echo "$BODY" | jq '.'
  echo ""
  
  GAMES=$(echo "$BODY" | jq -r '.games // 0')
  echo "📊 Generated predictions for $GAMES games"
  echo "🔗 View at: https://rrmodel.netlify.app/nba-predictions"
else
  echo "❌ FAILED - HTTP $HTTP_CODE"
  echo ""
  echo "$BODY"
  exit 1
fi
