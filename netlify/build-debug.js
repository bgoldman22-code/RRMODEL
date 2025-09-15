// ESM build script (Node 20). No require().
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const log = (...args) => console.log('[BUILD]', ...args);

log('Node', process.version);
log('Platform', process.platform, process.arch);
log('cwd', process.cwd());
log('env keys', Object.keys(process.env).sort().join(', '));

const dist = path.resolve('dist');
fs.mkdirSync(dist, { recursive: true });

const write = (file, html) => {
  const out = path.join(dist, file);
  fs.writeFileSync(out, html);
  log('wrote', out);
};

const page = (title, body) => `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:24px;max-width:900px;margin:auto}
  code,kbd,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
  table{border-collapse:collapse}
  td,th{border:1px solid #ddd;padding:8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
  .card{border:1px solid #ccd;padding:16px;border-radius:12px;background:#f9fbff}
  a.button{display:inline-block;padding:10px 14px;border-radius:8px;border:1px solid #888;text-decoration:none}
</style>
<h1>${title}</h1>
${body}
<hr/>
<p><small>Build OK: ${new Date().toISOString()}</small></p>
</html>`;

write('index.html', page('RRModel', `
  <div class="grid">
    <div class="card">
      <h2>Pages</h2>
      <ul>
        <li><a href="/status.html">Status</a></li>
        <li><a href="/tools.html">Tools</a></li>
        <li><a href="/nfl-predictions.html">NFL Predictions</a></li>
      </ul>
    </div>
    <div class="card">
      <h2>Build Diagnostics</h2>
      <pre>${JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch }, null, 2)}</pre>
    </div>
  </div>
`));

write('status.html', page('Status', `
  <p>Quick links:</p>
  <ul>
    <li><a href="/.netlify/functions/odds-status">/.netlify/functions/odds-status</a></li>
    <li><a href="/.netlify/functions/nfl-schedule-get?force=1">/.netlify/functions/nfl-schedule-get?force=1</a></li>
    <li><a href="/.netlify/functions/diag">/.netlify/functions/diag</a></li>
  </ul>
`));

write('tools.html', page('Tools', `
  <p>Common actions:</p>
  <p>
    <a class="button" href="/.netlify/functions/nfl-train?season=2025&force=1">Train 2025</a>
    <a class="button" href="/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1">Train 2022–2025</a>
    <a class="button" href="/.netlify/functions/nfl-predictions-generate?force=1">Generate Predictions</a>
  </p>
  <p>Sanity endpoints:</p>
  <ul>
    <li><a href="/.netlify/functions/odds-status">odds-status</a></li>
    <li><a href="/.netlify/functions/nfl-schedule-get?force=1">nfl-schedule-get?force=1</a></li>
    <li><a href="/.netlify/functions/diag">diag</a></li>
  </ul>
`));

write('nfl-predictions.html', page('NFL Predictions', `
  <p>Use the Tools page to generate fresh predictions. This page is a placeholder for now.</p>
`));

log('done');
