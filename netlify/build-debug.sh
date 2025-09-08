#!/usr/bin/env bash
set -euo pipefail

echo "=== Netlify Build (permanent override) ==="
echo "Node: $(node -v || true)"
echo "NPM:  $(npm -v || true)"
echo "PWD:  $(pwd)"
echo "--------------------------------"

export npm_config_registry="https://registry.npmjs.org/"
npm config set registry "https://registry.npmjs.org/"

# Clean cache + remove lock/node_modules
npm cache clean --force || true
rm -f package-lock.json || true
rm -rf node_modules || true

# Run install (preinstall hook normalizes package.json)
npm install --no-audit --no-fund

# Build (prefer user script, fallback to vite)
if npm run -s | grep -q "^  build$"; then
  npm run build
else
  npx vite build
fi

echo "=== Build complete ==="
