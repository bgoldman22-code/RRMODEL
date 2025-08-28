#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

echo "==> Applying MLB blobs helper patch in $ROOT"

# Ensure helper exists
if [ ! -f "$ROOT/netlify/functions/_blobs.js" ]; then
  echo "ERROR: _blobs.js not found at netlify/functions/_blobs.js"
  exit 1
fi

# Replace ESM imports
echo "==> Rewriting ESM imports to use getBlobsStore"
grep -RIl --include="*.mjs" "from './_blobs.js'" "$ROOT/netlify/functions" | while read -r f; do
  sed -i.bak "s/import[[:space:]]*{[[:space:]]*getStore[[:space:]]*}[[:space:]]*from[[:space:]]*'\.\/\_blobs\.js';/import { getBlobsStore } from '.\/\_blobs.js';/g" "$f" || true
  sed -i.bak "s/import[[:space:]]*{[[:space:]]*openStore[[:space:]]*}[[:space:]]*from[[:space:]]*'\.\/\_blobs\.js';/import { getBlobsStore as openStore } from '.\/\_blobs.js';/g" "$f" || true
  sed -i.bak "s/import[[:space:]]*{[[:space:]]*makeStore[[:space:]]*}[[:space:]]*from[[:space:]]*'\.\/\_blobs\.js';/import { getBlobsStore as makeStore } from '.\/\_blobs.js';/g" "$f" || true
done

# Replace CJS requires
echo "==> Rewriting CJS requires to use getBlobsStore"
grep -RIl --include="*.cjs" --include="*.js" "require('./_blobs.js')" "$ROOT/netlify/functions" | while read -r f; do
  sed -i.bak "s/const[[:space:]]*{[[:space:]]*getStore[[:space:]]*}[[:space:]]*=[[:space:]]*require('\.\/\_blobs\.js');/const { getBlobsStore } = require('.\/\_blobs.js');/g" "$f" || true
  sed -i.bak "s/const[[:space:]]*{[[:space:]]*openStore[[:space:]]*}[[:space:]]*=[[:space:]]*require('\.\/\_blobs\.js');/const { getBlobsStore: openStore } = require('.\/\_blobs.js');/g" "$f" || true
  sed -i.bak "s/const[[:space:]]*{[[:space:]]*makeStore[[:space:]]*}[[:space:]]*=[[:space:]]*require('\.\/\_blobs\.js');/const { getBlobsStore: makeStore } = require('.\/\_blobs.js');/g" "$f" || true
done

# Rename CJS handlers with exports.handler to .cjs if they end with .js
echo "==> Renaming CommonJS handler files .js -> .cjs (non-destructive)"
while read -r f; do
  base="${f%.js}"
  if grep -q "exports\.handler" "$f"; then
    if [ ! -f "${base}.cjs" ]; then
      git mv "$f" "${base}.cjs" 2>/dev/null || mv "$f" "${base}.cjs"
      echo "Renamed $f -> ${base}.cjs"
    fi
  fi
done < <(find "$ROOT/netlify/functions" -type f -name "*.js")

# Patch package.json dev script to use npx vite
if [ -f "$ROOT/package.json" ]; then
  echo "==> Patching package.json dev script"
  node - <<'NODE'
const fs = require('fs');
const p = 'package.json';
const j = JSON.parse(fs.readFileSync(p,'utf8'));
j.scripts = j.scripts || {};
if (!j.scripts.build) j.scripts.build = "vite build";
j.scripts.dev = "npx vite";
fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
console.log('package.json updated');
NODE
fi

echo "==> Done. Commit the changes and deploy."
