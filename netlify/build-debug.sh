#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

if [ -f package-lock.json ]; then
  echo "Found package-lock.json -> running npm ci"
  npm ci
else
  echo "No package-lock.json -> running npm install"
  npm install
fi

# Ensure dist exists for Netlify publish
mkdir -p dist
echo "<!doctype html><meta charset='utf-8'><title>RRModel NFL</title><h1>RRModel NFL</h1><p>Build OK $(date -u +%FT%TZ)</p>" > dist/index.html

echo "Build script complete."
