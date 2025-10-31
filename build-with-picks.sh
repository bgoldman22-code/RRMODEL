#!/bin/bash
# Build script that generates NBA picks before building the site

echo "🏀 Generating NBA picks..."

# Only generate picks if ODDS_API_KEY is available
if [ -n "$ODDS_API_KEY" ]; then
  node scripts/nba/generate-picks-local.mjs
  echo "✅ NBA picks generated"
else
  echo "⚠️  ODDS_API_KEY not set - skipping picks generation"
fi

# Continue with normal build
npm run build
