#!/usr/bin/env bash
# Robust Netlify build script for Vite + Netlify Functions
# - Detects package manager
# - Installs deps
# - Runs web build (expects `npm run build` / `yarn build` / `pnpm build` or falls back to `npx vite build`)
# - Prints helpful diagnostics on failure

set -euo pipefail

echo "=== Netlify Build Debug ==="
echo "CWD: $(pwd)"
echo "Node: $(node -v || true)"
echo "NPM:  $(npm -v || true)"
echo "Yarn: $(yarn -v || true)"
echo "PNPM: $(pnpm -v || true)"
echo "--------------------------------"

# Ensure functions dir exists (avoid path detection issues)
if [ ! -d "netlify/functions" ]; then
  echo "Creating netlify/functions directory (was missing)"
  mkdir -p netlify/functions
fi

echo "Listing netlify/functions:"
find netlify/functions -maxdepth 3 -type f -print || true
echo "--------------------------------"

# Choose package manager
PKG_MGR="npm"
if [ -f "pnpm-lock.yaml" ]; then
  PKG_MGR="pnpm"
elif [ -f "yarn.lock" ]; then
  PKG_MGR="yarn"
elif [ -f "package-lock.json" ]; then
  PKG_MGR="npm"
fi
echo "Using package manager: $PKG_MGR"
echo "--------------------------------"

# Install deps
if [ "$PKG_MGR" = "pnpm" ]; then
  corepack enable || true
  pnpm install --frozen-lockfile || pnpm install
elif [ "$PKG_MGR" = "yarn" ]; then
  yarn install --frozen-lockfile || yarn install
else
  npm ci || npm install
fi

echo "Dependencies installed."
echo "--------------------------------"

# Run build
set +e
if [ "$PKG_MGR" = "pnpm" ]; then
  pnpm run build || npx vite build
elif [ "$PKG_MGR" = "yarn" ]; then
  yarn build || npx vite build
else
  npm run build || npx vite build
fi
STATUS=$?
set -e

if [ $STATUS -ne 0 ]; then
  echo "Build failed (exit $STATUS). Showing vite config & package.json scripts:"
  echo "------ package.json (scripts) ------"
  if [ -f package.json ]; then
    cat package.json | sed -n '1,200p'
  else
    echo "No package.json found."
  fi
  echo "------ repo root ------"
  ls -la
  echo "------ src ------"
  [ -d src ] && ls -la src || echo "no src dir"
  echo "------ netlify/functions ------"
  ls -la netlify/functions || true
  exit $STATUS
fi

echo "Build succeeded."
echo "--------------------------------"

# Confirm dist exists
if [ -d "dist" ]; then
  echo "dist/ exists (publish dir likely OK)."
else
  echo "WARNING: dist/ not found. If using Vite, ensure output is dist or set [build].publish in netlify.toml"
fi

echo "=== End Build Debug ==="
