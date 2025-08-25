  #!/usr/bin/env bash
  set -euo pipefail

  echo "=== PACKAGE.JSON (name, version, scripts) ==="
  if [ -f package.json ]; then
    cat package.json | jq '{name, version, scripts, type}'
  else
    echo "No package.json found at repo root"
  fi

  echo "=== Installing deps (npm ci) ==="
  if [ -f package-lock.json ]; then
    npm ci || npm ci --omit=optional || npm ci || true
  elif [ -f package.json ]; then
    npm i || true
  fi

  echo "=== Build frontend if script exists ==="
  if [ -f package.json ] && jq -e '.scripts.build' package.json >/dev/null 2>&1; then
    npm run build || echo "build script failed or not present"
  else
    echo "No build script"
  fi

  # If no build output, create a tiny placeholder so the SPA can load, but we prefer real build.
  if [ ! -d "build" ]; then
    echo "No build dir produced. Creating minimal placeholder at build/"
    mkdir -p build
    cat > build/index.html <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RRMODEL</title></head><body><div style="font-family:sans-serif;padding:24px">Site build not found. Deploying Functions only for now.</div></body></html>
HTML
  fi

  echo "=== Done build-debug.sh ==="
