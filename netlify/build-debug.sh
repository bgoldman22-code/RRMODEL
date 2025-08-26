#!/usr/bin/env bash
set -euo pipefail

echo "=== ENV SUMMARY ==="
echo "Node version:" $(node -v || true)
echo "NPM version:" $(npm -v || true)
echo "Working dir:" $(pwd)
echo "Branch: ${BRANCH:-unknown}"
echo "Repo tree (top level):"
ls -la || true
echo
echo "=== PACKAGE.JSON (name, version, scripts) ==="
if [ -f package.json ]; then
  node -e 'const pj=require("./package.json"); console.log(JSON.stringify({name:pj.name,version:pj.version,scripts:pj.scripts,dependencies:Object.keys(pj.dependencies||{}),devDependencies:Object.keys(pj.devDependencies||{})},null,2))'
else
  echo "No package.json found!"
fi
echo
echo "=== Installing deps (npm ci) ==="
npm ci

echo
echo "=== Attempting vite build with debug ==="
# Try direct vite build with debug first; if vite not present, fall back to npm run build
if npx --yes vite -v >/dev/null 2>&1; then
  npx vite build --debug || (echo 'vite build failed, falling back to npm run build' && npm run build --if-present)
else
  echo "vite not found, running npm run build"
  npm run build --if-present
fi

echo "=== Build script finished ==="
