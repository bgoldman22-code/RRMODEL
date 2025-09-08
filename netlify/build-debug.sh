#!/usr/bin/env bash
# Netlify build script with dependency hard-fix for debug tarball/integrity issues
set -euo pipefail

echo "=== Netlify Build (deps hard-fix) ==="
echo "Node: $(node -v || true)"
echo "NPM:  $(npm -v || true)"
echo "PWD:  $(pwd)"
echo "--------------------------------"

# Ensure functions dir exists (harmless if present)
mkdir -p netlify/functions

echo "Listing netlify/functions (top 2 levels):"
find netlify/functions -maxdepth 2 -type f -print || true
echo "--------------------------------"

# Force npm to use the public registry explicitly
export npm_config_registry="https://registry.npmjs.org/"
npm config set registry "https://registry.npmjs.org/"

echo "[hard-fix] Cleaning npm cache..."
npm cache clean --force || true

echo "[hard-fix] Removing lockfile and node_modules to avoid stale integrity..."
rm -f package-lock.json || true
rm -rf node_modules || true

# If package.json exists, enforce overrides: debug@4.3.4 (stable)
if [ -f package.json ]; then
  node - <<'NODE'
  const fs = require('fs');
  const path = 'package.json';
  if (!fs.existsSync(path)) process.exit(0);
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  // normalize scripts
  pkg.scripts = Object.assign({ build: pkg.scripts && pkg.scripts.build ? pkg.scripts.build : "vite build" }, pkg.scripts);
  // force overrides
  pkg.overrides = Object.assign({}, pkg.overrides, { debug: "4.3.4" });
  // if direct dep points to weird URL or bad version, normalize
  for (const sec of ["dependencies","devDependencies"]) {
    if (pkg[sec] && pkg[sec].debug) {
      pkg[sec].debug = "4.3.4";
    }
  }
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2));
  console.log("[hard-fix] package.json normalized with overrides.debug=4.3.4");
NODE
fi

echo "[hard-fix] Prefetching debug@4.3.4 to warm npm cache..."
# This downloads the tarball into the working dir (and cache) to dodge EINTEGRITY races
npm pack debug@4.3.4 || true

echo "--------------------------------"
echo "Installing dependencies (prefer online, no audit)..."
# Retry logic to be extra safe
ATTEMPTS=0
until [ $ATTEMPTS -ge 3 ]
do
  ATTEMPTS=$((ATTEMPTS+1))
  echo "npm install attempt $ATTEMPTS ..."
  if npm install --no-audit --no-fund --prefer-online; then
    INST_OK=1
    break
  else
    echo "npm install failed (attempt $ATTEMPTS). Cleaning cache + retry..."
    npm cache clean --force || true
    sleep 1
  fi
done

if [ "${INST_OK:-0}" != "1" ]; then
  echo "FATAL: npm install failed after retries."
  exit 1
fi

echo "Dependencies installed."
echo "--------------------------------"

# Build the site (Vite)
if [ -f package.json ]; then
  if npm run -s | grep -q "^  build$"; then
    echo "Running npm run build ..."
    npm run build
  else
    echo "No build script found; running npx vite build ..."
    npx vite build
  fi
else
  echo "No package.json found; attempting npx vite build ..."
  npx vite build
fi

echo "Build complete."
if [ -d dist ]; then
  echo "Publish dir: dist"
else
  echo "WARNING: dist/ not found. Check your Vite config or netlify.toml publish path."
fi

echo "=== End Netlify Build (deps hard-fix) ==="
