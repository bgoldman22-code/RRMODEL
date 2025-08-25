#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist
echo '<!doctype html><meta charset="utf-8"><title>RR NFL</title><h1>RR NFL functions only</h1>' > dist/index.html
echo 'OK: built dist/'
