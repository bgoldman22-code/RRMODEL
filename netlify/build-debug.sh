#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

# Prefer ci if lock exists; else install
if [ -f package-lock.json ]; then
  echo "[build-debug] Using npm ci"
  npm ci
else
  echo "[build-debug] package-lock.json not found, using npm install"
  npm install --no-audit --no-fund
fi

# Ensure build script exists
if ! npm run | grep -qE ' build '; then
  echo "[build-debug] No build script; creating dist/ placeholder"
  mkdir -p dist
  echo "<!doctype html><meta charset='utf-8'><title>RRMODEL</title><div>Build placeholder</div>" > dist/index.html
else
  npm run build
fi

echo "[build-debug] Done"
