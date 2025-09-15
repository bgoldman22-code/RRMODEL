#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  echo "Running npm ci..."
  npm ci
else
  echo "No lockfile found; running npm install as fallback..."
  npm install
fi

echo "Running build (if present)..."
if npm run | grep -qE '^  build'; then
  npm run build
else
  echo "No build script; skipping."
fi

echo "Done."
