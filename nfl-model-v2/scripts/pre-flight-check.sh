#!/bin/bash

# NFL Model V2 - Pre-Flight Checklist
# Run this before starting the backtest

echo "🏈 NFL Model V2 - Pre-Flight Checklist"
echo "======================================="
echo ""

ERRORS=0

# Check 1: API Key
echo "1️⃣  Checking API key..."
if grep -q "ODDS_API_KEY=" .env 2>/dev/null && [ -s .env ]; then
  echo "   ✅ API key configured"
else
  echo "   ❌ API key missing in .env"
  ERRORS=$((ERRORS + 1))
fi

# Check 2: Node.js
echo ""
echo "2️⃣  Checking Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  echo "   ✅ Node.js installed: $NODE_VERSION"
else
  echo "   ❌ Node.js not found"
  ERRORS=$((ERRORS + 1))
fi

# Check 3: node-fetch
echo ""
echo "3️⃣  Checking dependencies..."
if node -e "require('node-fetch')" 2>/dev/null; then
  echo "   ✅ node-fetch installed"
else
  echo "   ❌ node-fetch not installed"
  echo "      Run: npm install node-fetch"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: Directory structure
echo ""
echo "4️⃣  Checking directory structure..."
if [ -d "nfl-model-v2/data" ] && [ -d "nfl-model-v2/scripts" ]; then
  echo "   ✅ Directories exist"
else
  echo "   ❌ Missing directories"
  ERRORS=$((ERRORS + 1))
fi

# Check 5: Scripts executable
echo ""
echo "5️⃣  Checking script permissions..."
if [ -x "nfl-model-v2/scripts/run-full-backtest.sh" ]; then
  echo "   ✅ Scripts are executable"
else
  echo "   ⚠️  Making scripts executable..."
  chmod +x nfl-model-v2/scripts/*.sh
  echo "   ✅ Fixed"
fi

# Check 6: Existing cache
echo ""
echo "6️⃣  Checking for cached data..."
CACHED_WEEKS=$(find nfl-model-v2/data/historical-odds -name "week*.json" 2>/dev/null | wc -l | tr -d ' ')
if [ "$CACHED_WEEKS" -gt 0 ]; then
  echo "   ✅ Found $CACHED_WEEKS weeks already cached"
  echo "      These will be skipped (saves API credits)"
else
  echo "   ℹ️  No cached data yet (first run will fetch all)"
fi

# Summary
echo ""
echo "======================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed! Ready to run:"
  echo ""
  echo "   ./nfl-model-v2/scripts/run-full-backtest.sh"
  echo ""
  echo "📊 Estimated cost:"
  if [ "$CACHED_WEEKS" -eq 90 ]; then
    echo "   0 credits (all data cached)"
  else
    MISSING_WEEKS=$((90 - CACHED_WEEKS))
    CREDITS=$((MISSING_WEEKS * 30))
    echo "   $CREDITS credits ($MISSING_WEEKS weeks × 30 credits)"
  fi
  echo ""
  exit 0
else
  echo "❌ Found $ERRORS issue(s). Please fix before running."
  echo ""
  exit 1
fi
