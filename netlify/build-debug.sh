#!/usr/bin/env bash
set -eo pipefail

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

# Install deps (avoid npm ci lockfile requirement)
npm install --no-audit --no-fund

# Build site
npm run build

# List functions for visibility
echo "---- Netlify Functions ----"
ls -al netlify/functions || true
