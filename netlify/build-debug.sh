#!/usr/bin/env bash
set -euo pipefail
echo "=== Ensuring dist/ exists ==="
mkdir -p dist
echo "<!doctype html><meta charset=\"utf-8\"><title>RRModel NFL</title><h1>Functions only</h1>" > dist/index.html
echo "=== PACKAGE.JSON (name, version, scripts) ==="
if [[ -f package.json ]]; then cat package.json; else echo "{ \"name\": \"rrmodel-nfl-patch\", \"version\": \"0.1.0\", \"type\": \"module\", \"dependencies\": { \"@netlify/blobs\": \"^6.4.0\" } }"; fi
echo "=== Done ==="
