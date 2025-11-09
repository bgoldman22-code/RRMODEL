#!/bin/bash
# Production Monitor for NFL Receiving Props Scanner
# Run this weekly to verify system health and log performance

set -e

SITE_URL="https://bgroundrobin.com"
LOG_DIR="logs/receiving-props"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/health_check_$TIMESTAMP.json"

# Create log directory
mkdir -p "$LOG_DIR"

echo "🏈 NFL Receiving Props - Production Health Check"
echo "=================================================="
echo ""

# Test scanner endpoint
echo "📡 Testing scanner endpoint..."
RESPONSE=$(curl -s "$SITE_URL/.netlify/functions/nfl-receiving-scanner-elite" || echo '{"error":"Request failed"}')

# Parse response
PREDICTION_COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('predictions', [])))" 2>/dev/null || echo "0")
DATA_SOURCE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata', {}).get('data_source', 'UNKNOWN'))" 2>/dev/null || echo "ERROR")
SSOT_WEEK=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata', {}).get('ssot_week', 'N/A'))" 2>/dev/null || echo "N/A")
HAS_REAL_ODDS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata', {}).get('has_real_odds', False))" 2>/dev/null || echo "false")

# Generate report
cat > "$LOG_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checks": {
    "endpoint_accessible": $([ "$PREDICTION_COUNT" != "0" ] && echo "true" || echo "false"),
    "predictions_generated": $PREDICTION_COUNT,
    "data_source": "$DATA_SOURCE",
    "ssot_week": "$SSOT_WEEK",
    "has_real_odds": $HAS_REAL_ODDS,
    "status": "$([ "$PREDICTION_COUNT" -gt 30 ] && echo "HEALTHY" || echo "DEGRADED")"
  }
}
EOF

# Display results
echo ""
echo "✅ Health Check Results:"
echo "   Predictions: $PREDICTION_COUNT"
echo "   Data Source: $DATA_SOURCE"
echo "   SSOT Week: $SSOT_WEEK"
echo "   Real Odds: $HAS_REAL_ODDS"
echo "   Status: $([ "$PREDICTION_COUNT" -gt 30 ] && echo "✅ HEALTHY" || echo "⚠️  DEGRADED")"
echo ""

# Save full response for debugging
echo "$RESPONSE" | python3 -m json.tool > "$LOG_DIR/latest_response.json" 2>/dev/null || echo "$RESPONSE" > "$LOG_DIR/latest_response.txt"

echo "📝 Log saved to: $LOG_FILE"
echo ""

# Weekly summary (if it's Monday)
if [ "$(date +%u)" = "1" ]; then
  echo "📊 Weekly Summary (Last 7 days):"
  echo ""
  
  # Count health checks in last 7 days
  RECENT_CHECKS=$(find "$LOG_DIR" -name "health_check_*.json" -mtime -7 | wc -l | tr -d ' ')
  
  if [ "$RECENT_CHECKS" -gt 0 ]; then
    echo "   Total checks: $RECENT_CHECKS"
    
    # Parse all recent logs
    TOTAL_PREDS=0
    HEALTHY_CHECKS=0
    
    for file in $(find "$LOG_DIR" -name "health_check_*.json" -mtime -7); do
      COUNT=$(python3 -c "import json; d=json.load(open('$file')); print(d['checks']['predictions_generated'])" 2>/dev/null || echo "0")
      STATUS=$(python3 -c "import json; d=json.load(open('$file')); print(d['checks']['status'])" 2>/dev/null || echo "UNKNOWN")
      
      TOTAL_PREDS=$((TOTAL_PREDS + COUNT))
      [ "$STATUS" = "HEALTHY" ] && HEALTHY_CHECKS=$((HEALTHY_CHECKS + 1))
    done
    
    AVG_PREDS=$((TOTAL_PREDS / RECENT_CHECKS))
    UPTIME_PCT=$((HEALTHY_CHECKS * 100 / RECENT_CHECKS))
    
    echo "   Avg predictions: $AVG_PREDS"
    echo "   Uptime: $UPTIME_PCT%"
    echo ""
  else
    echo "   No recent checks found"
    echo ""
  fi
fi

# Alert if degraded
if [ "$PREDICTION_COUNT" -lt 30 ]; then
  echo "⚠️  WARNING: Low prediction count!"
  echo "   Expected: 50+ predictions"
  echo "   Got: $PREDICTION_COUNT"
  echo ""
  echo "   Possible causes:"
  echo "   - SSOT not uploaded for current week"
  echo "   - The Odds API quota exceeded"
  echo "   - USE_SSOT not set to true"
  echo "   - Player name matching issues"
  echo ""
fi

echo "💡 To set up automated monitoring:"
echo "   1. Add to crontab: 0 9 * * * cd /path/to/RRMODEL && ./scripts/nfl-receiving-props/monitor-production.sh"
echo "   2. Or run manually: ./scripts/nfl-receiving-props/monitor-production.sh"
echo ""
