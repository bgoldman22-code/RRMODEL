#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

# Ensure deps present
npm ci

# Build the frontend if applicable. If there's no frontend, create a minimal dist to satisfy Netlify.
if npm run | grep -q " build"; then
  echo "Running npm run build"
  npm run build
else
  echo "No build script found; creating minimal dist/ index.html"
  mkdir -p dist
  cat > dist/index.html <<'HTML'
<!doctype html>
<html>
  <head><meta charset="utf-8"/><title>RRModel</title></head>
  <body>
    <h1>RRModel – Functions Deploy</h1>
    <p>This placeholder exists because no frontend build script was defined.</p>
  </body>
</html>
HTML
fi

echo "Done."
