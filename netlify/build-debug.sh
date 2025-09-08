#!/usr/bin/env bash
set -euo pipefail

echo "=== Netlify Build (permanent deps fix) ==="
echo "Node: $(node -v || true)"
echo "NPM:  $(npm -v || true)"
echo "PWD:  $(pwd)"
echo "--------------------------------"

# Force registry (defensive)
export npm_config_registry="https://registry.npmjs.org/"
npm config set registry "https://registry.npmjs.org/"

# Clean cache + lock/node_modules to adopt overrides consistently
npm cache clean --force || true
rm -f package-lock.json || true
rm -rf node_modules || true

# Run install (preinstall hook will patch package.json with overrides + hook)
npm install --no-audit --no-fund

# Build (prefer user script, fallback to vite)
if npm run -s | grep -q "^  build$"; then
  npm run build
else
  npx vite build
fi

echo "=== Build complete ==="
