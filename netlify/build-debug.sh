#!/usr/bin/env bash
set -euo pipefail

echo "=== Ensure minimal dist/ so Netlify can publish ==="
mkdir -p dist
if [ ! -f dist/index.html ]; then
  cat > dist/index.html <<'HTML'
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>RR Model</title></head>
  <body>
    <h1>RR Model — Functions-only deploy</h1>
    <p>This is a placeholder. The app UI will replace this when ready.</p>
  </body>
</html>
HTML
fi

echo "Done."
