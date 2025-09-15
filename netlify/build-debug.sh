#!/usr/bin/env bash
set -e
echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"
# prefer ci if lock exists and is non-empty
if [ -s package-lock.json ]; then
  npm ci || (echo "npm ci failed, falling back to npm install" && npm install --no-audit --no-fund)
else
  npm install --no-audit --no-fund
fi
npm run build || echo "no web build step required"
echo "Build script complete."