#!/usr/bin/env bash
    # Robust build helper: never hard-fail; always ensure 'dist' exists so the SPA is published.
    set +e

    echo "=== package.json (top) ==="
    if [ -f package.json ]; then head -n 80 package.json || true; else echo "no package.json"; fi

    echo "=== install deps ==="
    if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
      npm ci || npm install || true
    else
      npm install || true
    fi

    echo "=== build (vite) ==="
    if npm run -s build; then
      echo "(build succeeded)"
    else
      echo "(build failed or no script)"
    fi

    mkdir -p dist
    # If CRA or other put output in ./build, copy it
    if [ -d build ]; then
      cp -R build/* dist/ 2>/dev/null || true
    fi
    # If public exists and dist/index.html is still missing, create a minimal index
    if [ ! -f dist/index.html ]; then
      cat > dist/index.html <<'HTML'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RR — NFL + MLB</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; margin: 0; padding: 2rem; }
      code { background: #f4f4f4; padding: .2rem .4rem; border-radius: .25rem; }
      .note { background:#fff7cc; border:1px solid #eadc7a; padding: 1rem; border-radius: .5rem; }
      a { color: #0a58ca; }
    </style>
  </head>
  <body>
    <h1>Round Robin — Site Placeholder</h1>
    <p class="note">Vite build didn't produce an index (yet). This placeholder exists only so Netlify publishes your site instead of "Functions only". Your actual app should replace this on the next successful build.</p>
    <p>Try these function checks:</p>
    <ul>
      <li><a href="/.netlify/functions/nfl-bootstrap?mode=auto&debug=1&noblobs=1">/functions/nfl-bootstrap?mode=auto&debug=1&noblobs=1</a></li>
      <li><a href="/.netlify/functions/nfl-rosters-list?noblobs=1&debug=1">/functions/nfl-rosters-list?noblobs=1&debug=1</a></li>
      <li><a href="/.netlify/functions/nfl-td-candidates?debug=1&noblobs=1">/functions/nfl-td-candidates?debug=1&noblobs=1</a></li>
    </ul>
  </body>
</html>
HTML
    fi
    echo "=== build-debug.sh done ==="
