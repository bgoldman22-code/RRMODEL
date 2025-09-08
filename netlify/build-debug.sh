#!/usr/bin/env bash
# Robust Netlify build script for Vite + Netlify Functions
# - Prints clear diagnostics
# - Installs deps deterministically
# - Builds the SPA
# - Verifies output
# - Leaves functions to Netlify bundler (no custom steps touching your functions)

set -Eeuo pipefail

echo "── Netlify Build Debug ─────────────────────────────────────────"
echo "Node: $(node -v)"
echo "NPM : $(npm -v)"
echo "PWD : $(pwd)"
echo "Repo files (top-level):"; ls -la || true
echo "Functions dir:"; ls -la netlify/functions || true
echo "----------------------------------------------------------------"

# Ensure scripts exist
if ! jq -e '.scripts.build' package.json >/dev/null 2>&1; then
  echo "ERROR: package.json is missing a 'build' script. Add \"build\": \"vite build\"."
  exit 2
fi

echo "Installing dependencies (npm ci)…"
# Use npm ci for clean, reproducible install. Avoid audit/fund noise.
npm ci --no-audit --no-fund

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

# Optional: print a quick summary of serverless functions present.
echo "Function entries found (not executed):"
find netlify/functions -maxdepth 2 -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \) | sed 's#^# - #' || true

echo "✅ Build script completed successfully."
