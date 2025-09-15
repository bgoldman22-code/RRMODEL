// ESM build script for Netlify (works with "type":"module")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

const dist = path.join(__dirname, '..', 'dist');
ensureDir(dist);

// Minimal index.html so publish directory exists and your site renders.
const indexHtml = "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>RRModel \u2014 Build OK</title>\n  <style>\n    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,'Noto Sans','Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol';line-height:1.4;margin:2rem;max-width:900px}\n    code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace}\n    .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:1rem}\n    a.card{display:block;padding:12px 14px;border:1px solid #ddd;border-radius:10px;text-decoration:none;color:#222}\n    a.card:hover{border-color:#aaa;background:#fafafa}\n    small{color:#666}\n  </style>\n</head>\n<body>\n  <h1>RRModel \u2014 Build OK</h1>\n  <p>Deployed at <code id=\"ts\"></code></p>\n\n  <h2>Quick checks</h2>\n  <div class=\"grid\">\n    <a class=\"card\" href=\"/.netlify/functions/odds-status\" target=\"_blank\">\n      <b>odds-status</b><br><small>Check blobs store &amp; team_form presence</small>\n    </a>\n    <a class=\"card\" href=\"/.netlify/functions/nfl-schedule-get?force=1\" target=\"_blank\">\n      <b>nfl-schedule-get</b><br><small>Odds fallback schedule</small>\n    </a>\n    <a class=\"card\" href=\"/.netlify/functions/nfl-train?season=2025&force=1\" target=\"_blank\">\n      <b>nfl-train (2025)</b><br><small>Build team-form for 2025</small>\n    </a>\n    <a class=\"card\" href=\"/.netlify/functions/nfl-predictions-generate?force=1\" target=\"_blank\">\n      <b>nfl-predictions-generate</b><br><small>Generate picks</small>\n    </a>\n  </div>\n\n  <script>document.getElementById('ts').textContent = new Date().toString();</script>\n</body>\n</html>\n";

fs.writeFileSync(path.join(dist, 'index.html'), indexHtml);

// Netlify SPA-style fallback
fs.writeFileSync(path.join(dist, '_redirects'), '/* /index.html 200\n');

console.log('[build-debug] Wrote dist/index.html and _redirects');
console.log('[build-debug] Build OK:', new Date().toISOString());
