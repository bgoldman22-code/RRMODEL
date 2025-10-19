#!/bin/bash
# A/B Test: Compare PLAYER_DB vs SSOT predictions
# 
# Usage: ./test-ssot-ab.sh

set -e

echo "🏈 NFL RECEIVING PROPS - A/B TEST"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Generate SSOT
echo "${YELLOW}Step 1: Generating SSOT from nflfastR data...${NC}"
Rscript scripts/nfl-receiving-props/generate-ssot.R

if [ ! -f "data/nfl/ssot/week_8_2025.json" ]; then
  echo "❌ SSOT generation failed - file not created"
  exit 1
fi

echo "${GREEN}✅ SSOT generated successfully${NC}"
echo ""

# Step 2: Test old scanner (PLAYER_DB)
echo "${YELLOW}Step 2: Testing old scanner (hardcoded PLAYER_DB)...${NC}"

# Start Netlify Dev in background (if not already running)
if ! curl -s http://localhost:8888/.netlify/functions/nfl-receiving-scanner-elite > /dev/null 2>&1; then
  echo "Starting Netlify Dev..."
  netlify dev > /dev/null 2>&1 &
  NETLIFY_PID=$!
  sleep 5
fi

curl -s "http://localhost:8888/.netlify/functions/nfl-receiving-scanner-elite" > /tmp/old-predictions.json

OLD_COUNT=$(jq -r '.total_predictions // 0' /tmp/old-predictions.json)
echo "${GREEN}✅ Old scanner: ${OLD_COUNT} predictions${NC}"
echo ""

# Step 3: Test new scanner (SSOT)
echo "${YELLOW}Step 3: Testing new scanner (SSOT)...${NC}"

curl -s "http://localhost:8888/.netlify/functions/nfl-receiving-scanner-ssot?week=8&season=2025" > /tmp/new-predictions.json

NEW_COUNT=$(jq -r '.total_predictions // 0' /tmp/new-predictions.json)

if [ "$NEW_COUNT" -eq 0 ]; then
  echo "❌ SSOT scanner returned 0 predictions - check errors:"
  jq -r '.error // "No error message"' /tmp/new-predictions.json
  exit 1
fi

echo "${GREEN}✅ New scanner (SSOT): ${NEW_COUNT} predictions${NC}"
echo ""

# Step 4: Compare predictions
echo "${YELLOW}Step 4: Comparison Analysis${NC}"
echo "========================================"
echo ""

echo "📊 Prediction Counts:"
echo "  Old (PLAYER_DB): ${OLD_COUNT}"
echo "  New (SSOT):      ${NEW_COUNT}"
echo ""

if [ "$OLD_COUNT" -gt 0 ]; then
  OLD_AVG_EDGE=$(jq -r '[.predictions[].edge] | add / length * 100' /tmp/old-predictions.json)
  OLD_TOP_EDGE=$(jq -r '.predictions[0].edge * 100' /tmp/old-predictions.json)
  echo "📈 Old Scanner Stats:"
  echo "  Average Edge: ${OLD_AVG_EDGE}%"
  echo "  Top Edge:     ${OLD_TOP_EDGE}%"
  echo ""
fi

if [ "$NEW_COUNT" -gt 0 ]; then
  NEW_AVG_EDGE=$(jq -r '[.predictions[].edge] | add / length * 100' /tmp/new-predictions.json)
  NEW_TOP_EDGE=$(jq -r '.predictions[0].edge * 100' /tmp/new-predictions.json)
  echo "📈 New Scanner (SSOT) Stats:"
  echo "  Average Edge: ${NEW_AVG_EDGE}%"
  echo "  Top Edge:     ${NEW_TOP_EDGE}%"
  echo ""
  
  # Check data quality
  EB_TAU=$(jq -r '.metadata.data_quality.eb_tau // "N/A"' /tmp/new-predictions.json)
  TOTAL_PLAYERS=$(jq -r '.metadata.data_quality.total_players // "N/A"' /tmp/new-predictions.json)
  echo "🎯 SSOT Data Quality:"
  echo "  EB Smoothing (τ): ${EB_TAU}"
  echo "  Total Players:    ${TOTAL_PLAYERS}"
  echo ""
fi

# Step 5: Sample predictions
echo "${YELLOW}Step 5: Sample Predictions (Top 5 from each)${NC}"
echo "========================================"
echo ""

if [ "$OLD_COUNT" -gt 0 ]; then
  echo "🏈 Old Scanner (PLAYER_DB):"
  jq -r '.predictions[0:5] | .[] | "  \(.player) \(.team) - \(.prop) \(.line) \(.side): \(.edge * 100 | round)% edge @ \(.offered_odds)"' /tmp/old-predictions.json
  echo ""
fi

if [ "$NEW_COUNT" -gt 0 ]; then
  echo "✨ New Scanner (SSOT):"
  jq -r '.predictions[0:5] | .[] | "  \(.player) \(.team) - \(.prop) \(.line) \(.side): \(.edge * 100 | round)% edge @ \(.offered_odds)"' /tmp/new-predictions.json
  echo ""
fi

# Step 6: Sanity checks
echo "${YELLOW}Step 6: Sanity Checks${NC}"
echo "========================================"
echo ""

# Check if prediction counts are within ±10%
if [ "$OLD_COUNT" -gt 0 ] && [ "$NEW_COUNT" -gt 0 ]; then
  DIFF=$(( (NEW_COUNT - OLD_COUNT) * 100 / OLD_COUNT ))
  if [ "${DIFF#-}" -gt 10 ]; then
    echo "⚠️  WARNING: Prediction count changed by ${DIFF}%"
    echo "   This may indicate a calibration issue"
  else
    echo "${GREEN}✅ Prediction count within ±10% (${DIFF}% change)${NC}"
  fi
fi
echo ""

# Check for clipping
CLIP_COUNT=$(jq -r '[.predictions[] | select(.ssot_meta.clipped.targets == true or .ssot_meta.clipped.catchRate == true or .ssot_meta.clipped.yac == true)] | length' /tmp/new-predictions.json 2>/dev/null || echo "0")
CLIP_PCT=$(( CLIP_COUNT * 100 / (NEW_COUNT > 0 ? NEW_COUNT : 1) ))

if [ "$CLIP_COUNT" -gt 0 ]; then
  echo "📊 Multiplier Clipping:"
  echo "   ${CLIP_COUNT} predictions clipped (${CLIP_PCT}%)"
  if [ "$CLIP_PCT" -gt 5 ]; then
    echo "   ⚠️  WARNING: >5% clipping rate - may need wider caps"
  else
    echo "   ${GREEN}✅ Clipping rate acceptable (<5%)${NC}"
  fi
else
  echo "${GREEN}✅ No multiplier clipping detected${NC}"
fi
echo ""

# Step 7: Save results
echo "${YELLOW}Step 7: Saving Results${NC}"
echo "========================================"
echo ""

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p test-results

cp /tmp/old-predictions.json "test-results/old-predictions-${TIMESTAMP}.json"
cp /tmp/new-predictions.json "test-results/new-predictions-${TIMESTAMP}.json"

echo "${GREEN}✅ Results saved to test-results/${NC}"
echo "   old-predictions-${TIMESTAMP}.json"
echo "   new-predictions-${TIMESTAMP}.json"
echo ""

# Step 8: Recommendations
echo "${YELLOW}Step 8: Recommendations${NC}"
echo "========================================"
echo ""

if [ "$NEW_COUNT" -eq 0 ]; then
  echo "❌ SSOT scanner not ready for production"
  echo "   Action: Debug SSOT generation and scanner integration"
elif [ "$NEW_COUNT" -lt $(( OLD_COUNT / 2 )) ]; then
  echo "⚠️  SSOT scanner producing significantly fewer predictions"
  echo "   Action: Check EB_TAU parameter and opponent adjustments"
elif [ "$CLIP_PCT" -gt 10 ]; then
  echo "⚠️  High clipping rate"
  echo "   Action: Increase CAP_COMBINED_MAX or reduce per-factor caps"
else
  echo "${GREEN}✅ SSOT scanner ready for shadow mode testing${NC}"
  echo "   Next steps:"
  echo "   1. Run both scanners for 1-2 slates"
  echo "   2. Compare actual results vs predictions"
  echo "   3. Calculate CLV for each system"
  echo "   4. If SSOT CLV >= 0%, flip to production"
fi
echo ""

echo "🎉 A/B Test Complete!"
