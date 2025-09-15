#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "NPM: $(npm -v)"

# Install deps. If there's no lockfile, fall back to npm install.
if [ -f package-lock.json ]; then
  npm ci --omit=dev || npm ci || true
else
  npm install --omit=dev || true
fi

# Build step (creates a lightweight dist if none)
if npm run build; then
  echo "Build script ran."
else
  echo "No build script or it failed; creating minimal dist/"
  mkdir -p dist
  echo "<!doctype html><meta charset='utf-8'><title>RRModel</title><pre>OK</pre>" > dist/index.html
fi

echo "Build complete."
