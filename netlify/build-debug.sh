#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

# Netlify often runs npm ci; if there's no lockfile, fall back to install.
if [ -f package-lock.json ]; then
  npm ci
else
  echo "No package-lock.json present; running npm install to generate one..."
  npm install
fi

# Produce a tiny site so Netlify "publish" step doesn't fail.
mkdir -p dist
cat > dist/index.html <<'HTML'
<!doctype html>
<html><head><meta charset="utf-8"><title>RRModel</title></head>
<body><h1>RRModel</h1><p>Build OK: $(date)</p></body></html>
HTML

echo "Build complete."
