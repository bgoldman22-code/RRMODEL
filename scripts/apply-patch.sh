#!/usr/bin/env bash
set -euo pipefail

echo "== NFL TD patch: Step 3 & candidates fix =="

# 1) Ensure we're in repo root
if [ ! -d ".git" ]; then
  echo "This script must be run from your repo root (where .git lives)."
  exit 1
fi

# 2) Write fixed nfl-td-candidates.mjs
mkdir -p netlify/functions
cp -f "$(dirname "$0")/../netlify/functions/nfl-td-candidates.mjs" netlify/functions/nfl-td-candidates.mjs

# 3) Rename CommonJS Netlify functions (.js -> .cjs) if they exist
rename_if_exists() {
  local from="$1"
  local to="$2"
  if [ -f "$from" ]; then
    git mv "$from" "$to" || mv "$from" "$to"
    echo "Renamed $from -> $to"
  fi
}

rename_if_exists netlify/functions/mlb-preds-get.js netlify/functions/mlb-preds-get.cjs
rename_if_exists netlify/functions/odds-diag.js       netlify/functions/odds-diag.cjs

# 4) Catch any other CommonJS-style handlers and recommend action
hits=$(grep -R --line-number 'exports\.handler' netlify/functions || true)
if [ -n "$hits" ]; then
  echo "NOTE: Found other CommonJS handlers using exports.handler:"
  echo "$hits"
  echo "For each above file under \"type\":\"module\", either rename to .cjs or convert to ESM (export default)."
fi

# 5) Commit if working tree is cleanable
if git add -A >/dev/null 2>&1; then
  git commit -m "Fix: CJS/ESM compliance + nfl-td-candidates schedule handling" || echo "Nothing to commit."
fi

echo "Done. Push your branch to trigger Netlify rebuild."
