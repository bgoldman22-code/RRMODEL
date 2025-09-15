const fs = require('fs');
const path = require('path');

const dist = path.join(process.cwd(), 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"/><title>RRModel</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;max-width:860px;margin:0 auto}</style>
</head><body>
<h1>RRModel</h1>
<p>Build OK: ${new Date().toISOString()}</p>
<ul>
  <li><a href="/.netlify/functions/odds-status">odds-status</a></li>
  <li><a href="/.netlify/functions/nfl-schedule-get?force=1">nfl-schedule-get?force=1</a></li>
  <li><a href="/.netlify/functions/nfl-train?season=2025&force=1">nfl-train (season=2025)</a></li>
  <li><a href="/.netlify/functions/nfl-predictions-generate?force=1">nfl-predictions-generate</a></li>
</ul>
</body></html>`);
fs.writeFileSync(path.join(dist, '_redirects'), `/* /index.html 200`);
console.log('Wrote dist/ with basic index and _redirects');
