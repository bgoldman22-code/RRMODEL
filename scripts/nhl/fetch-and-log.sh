#!/bin/bash
#
# NHL Daily Logger - Fetch picks and log to CSV
#
# Usage:
#   ./scripts/nhl/fetch-and-log.sh
#
# What it does:
#   1. Fetches today's NHL picks from scanner endpoint
#   2. Saves to temp file
#   3. Logs to predictions CSV
#   4. Shows summary
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏒 NHL Daily Logger${NC}\n"

# Configuration
SCANNER_URL="${NHL_SCANNER_URL:-https://your-site.netlify.app/.netlify/functions/nhl-sog-scanner-v3-optimized}"
TEMP_FILE="/tmp/nhl_picks_$(date +%Y%m%d).json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Step 1: Fetch picks
echo -e "${YELLOW}📡 Fetching NHL picks...${NC}"
if curl -sf "$SCANNER_URL" > "$TEMP_FILE"; then
  PICK_COUNT=$(jq '.opportunities | length' "$TEMP_FILE" 2>/dev/null || echo "0")
  echo -e "${GREEN}✅ Fetched $PICK_COUNT opportunities${NC}\n"
else
  echo -e "❌ Failed to fetch from scanner endpoint"
  echo -e "   URL: $SCANNER_URL"
  echo -e "   Set NHL_SCANNER_URL environment variable if different"
  exit 1
fi

# Step 2: Log to CSV
echo -e "${YELLOW}📝 Logging to CSV...${NC}"
cd "$ROOT_DIR"
node scripts/nhl/manual-log-from-scanner.mjs "$TEMP_FILE"

# Step 3: Show summary
echo -e "${YELLOW}📊 Latest predictions:${NC}"
tail -n 5 data/nhl/logs/predictions_2024-25.csv | column -t -s ',' | head -n 5

echo -e "\n${GREEN}✅ Done!${NC}"
echo -e "   CSV: data/nhl/logs/predictions_2024-25.csv"
echo -e "   Picks: $TEMP_FILE\n"
