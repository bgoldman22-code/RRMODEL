#!/usr/bin/env bash
# Netlify build script with auto-fix for bad debug@4.4.2 reference
set -euo pipefail

echo "=== Netlify Build (with deps hot-fix) ==="
echo "Node: $(node -v || true)"
echo "NPM:  $(npm -v || true)"
echo "PWD:  $(pwd)"

# --- Hot-fix: replace debug@4.4.2 with 4.3.4 in package.json & lockfile if present ---
if [ -f package.json ]; then
  echo "[hot-fix] Checking package.json for debug@4.4.2..."
  if grep -q '"debug"[[:space:]]*:[[:space:]]*"4\.4\.2"' package.json || grep -q '"debug":[[:space:]]*"https://registry\.npmjs\.org/debug/-/debug-4\.4\.2\.tgz"' package.json; then
    echo "[hot-fix] Rewriting package.json debug version to 4.3.4"
    sed -i 's#"debug"[[:space:]]*:[[:space:]]*"4\.4\.2"#"debug": "4.3.4"#g' package.json || true
    sed -i 's#"debug":[[:space:]]*"https://registry\.npmjs\.org/debug/-/debug-4\.4\.2\.tgz"#"debug": "4.3.4"#g' package.json || true
  fi

  echo "[hot-fix] Ensuring npm overrides force debug@4.3.4"
  # Insert or update overrides using a tiny Node script (safer than sed for JSON)
  node - <<'NODE'
  const fs = require('fs');
  const path = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.overrides = Object.assign({}, pkg.overrides, { debug: "4.3.4" });
  if (!pkg.scripts) pkg.scripts = {};
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2));
  console.log("[hot-fix] package.json overrides set to force debug@4.3.4");
NODE
fi

if [ -f package-lock.json ]; then
  echo "[hot-fix] Rewriting package-lock.json debug 4.4.2 → 4.3.4 (if present)"
  sed -i 's#debug-4\.4\.2\.tgz#debug-4.3.4.tgz#g' package-lock.json || true
  sed -i 's#"debug":[[:space:]]*"4\.4\.2"#"debug": "4.3.4"#g' package-lock.json || true
  sed -i 's#"version":[[:space:]]*"4\.4\.2"#"version": "4.3.4"#g' package-lock.json || true
fi

echo "--------------------------------"
echo "Listing netlify/functions:"
find netlify/functions -maxdepth 3 -type f -print || true
echo "--------------------------------"

# Choose package manager (npm)
echo "Using npm…"
npm ci || npm install

echo "Dependencies installed."
echo "--------------------------------"
npm run build || npx vite build

echo "Build complete."
if [ -d dist ]; then
  echo "Publish dir: dist"
else
  echo "WARNING: dist/ not found. Check Vite config or netlify.toml publish path."
fi
