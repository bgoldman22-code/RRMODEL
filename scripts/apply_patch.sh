#!/usr/bin/env bash
set -euo pipefail

# Apply SPA fallback & caching, and remove any stale static Predictions pages.
ROOT="$(pwd)"
PUB="$ROOT/public"

mkdir -p "$PUB"

# 1) SPA fallback for deep links
cat > "$PUB/_redirects" <<'EOF'
/*   /index.html   200
EOF

# 2) Caching: keep bundle fresh, cache static assets long-term
cat > "$PUB/_headers" <<'EOF'
/index.html
  Cache-Control: no-cache, no-store, must-revalidate
  Pragma: no-cache
  Expires: 0

/assets/*
  Cache-Control: public, max-age=31536000, immutable
EOF

# 3) Remove legacy static Predictions files if they exist
CANDIDATES=(
  "public/predictions.html"
  "public/predictions/index.html"
  "public/Predictions.html"
  "public/NFLPredictions.html"
  "public/nfl-predictions.html"
  "public/nflpredictions.html"
  "public/prediction.html"
  "public/prediction/index.html"
)
REMOVED=()
for f in "${CANDIDATES[@]}"; do
  if [ -e "$ROOT/$f" ]; then
    # attempt git-aware removal, fall back to rm
    git rm -f "$ROOT/$f" 2>/dev/null || rm -rf "$ROOT/$f"
    REMOVED+=("$f")
  fi
done

echo "✅ Wrote $PUB/_redirects and $PUB/_headers"
if [ "${#REMOVED[@]}" -gt 0 ]; then
  echo "🧹 Removed stale public files: ${REMOVED[*]}"
else
  echo "🧹 No stale public files found"
fi

echo
echo "Next:"
echo "  1) git add public/_redirects public/_headers"
echo "  2) git commit -m 'fix: SPA fallback + cache headers; remove stale predictions html'"
echo "  3) git push && trigger Netlify deploy"
