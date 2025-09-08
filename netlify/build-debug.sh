#!/usr/bin/env bash
# Robust Netlify build script for Vite + Netlify Functions
# - Falls back to `npm install` if no package-lock.json is present
# - Prints clear diagnostics
# - Builds the SPA with Vite
# - Verifies 'dist/' exists

set -Eeuo pipefail

echo "── Netlify Build Debug ─────────────────────────────────────────"
echo "Node: $(node -v || true)"
echo "NPM : $(npm -v || true)"
echo "PWD : $(pwd)"
echo "Repo files (top-level):"; ls -la || true
echo "Functions dir:"; ls -la netlify/functions || true
echo "----------------------------------------------------------------"

# Ensure build script exists in package.json
if ! jq -e '.scripts.build' package.json >/dev/null 2>&1; then
  echo "ERROR: package.json is missing a 'build' script. Add \"build\": \"vite build\"."
  exit 2
fi

# Install deps
if [ -f package-lock.json ]; then
  echo "Detected package-lock.json → using npm ci"
  npm ci --no-audit --no-fund
else
  echo "No package-lock.json found → using npm install"
  npm install --no-audit --no-fund
fi

echo "Running Vite build…"
npm run build

echo "Verifying build output…"
if [ ! -d "dist" ]; then
  echo "ERROR: Vite did not produce 'dist/'. Check Vite config."
  exit 2
fi

echo "Build size:"
du -sh dist || true
echo "Build contents (top level):"
ls -la dist || true

echo "Function entries found (not executed):"
find netlify/functions -maxdepth 2 -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \) | sed 's#^# - #' || true

echo "✅ Build script completed successfully."
