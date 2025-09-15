import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outDir = join(__dirname, '..', 'dist');
mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif;margin:20px;line-height:1.4}
  header{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
  header a{padding:8px 12px;border:1px solid #ddd;border-radius:10px;text-decoration:none;color:#222;background:#fafafa}
  table{border-collapse:collapse;width:100%;margin-top:12px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
  th{background:#f5f5f5}
  code{background:#f2f2f2;padding:2px 6px;border-radius:6px}
  .muted{opacity:.7}
</style>
<header>
  <a href="/index.html">Home</a>
  <a href="/nfl-predictions.html">NFL Predictions</a>
  <a href="/tools.html">Tools</a>
  <a href="/status.html">Status</a>
</header>
<div class="muted">Build OK: ${now}</div>
${body}
</html>`;
}

// index
writeFileSync(join(outDir, 'index.html'), page('RRModel', `
  <h1>RRModel</h1>
  <p>Quick links:</p>
  <ul>
    <li><a href="/nfl-predictions.html">NFL Predictions</a></li>
    <li><a href="/status.html">Status / Diag</a></li>
    <li><a href="/tools.html">Training tools</a></li>
  </ul>
`));

// status page
writeFileSync(join(outDir, 'status.html'), page('Status', `
  <h2>Status</h2>
  <pre id="out">Loading…</pre>
  <script type="module">
    async function run() {
      const resp = await fetch('/.netlify/functions/odds-status');
      const json = await resp.json();
      document.getElementById('out').textContent = JSON.stringify(json, null, 2);
    }
    run().catch(e => { document.getElementById('out').textContent = String(e) });
  </script>
`));

// tools page (train triggers)
writeFileSync(join(outDir, 'tools.html'), page('Tools', `
  <h2>Training & Data Tools</h2>
  <button id="train2025">Train 2025</button>
  <button id="trainAll">Train 2022–2025</button>
  <button id="gen">Generate Predictions</button>
  <pre id="out">Ready.</pre>
  <script type="module">
    async function call(url) {
      const r = await fetch(url);
      const t = await r.text();
      document.getElementById('out').textContent = t;
    }
    document.getElementById('train2025').onclick = () => call('/.netlify/functions/nfl-train?season=2025&force=1');
    document.getElementById('trainAll').onclick = () => call('/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1');
    document.getElementById('gen').onclick = () => call('/.netlify/functions/nfl-predictions-generate?force=1');
  </script>
  <h3>Sanity check URLs</h3>
  <ul>
    <li><a href="/.netlify/functions/odds-status">/.netlify/functions/odds-status</a></li>
    <li><a href="/.netlify/functions/nfl-schedule-get?force=1">/.netlify/functions/nfl-schedule-get?force=1</a></li>
    <li><a href="/.netlify/functions/nfl-train?season=2025&force=1">/.netlify/functions/nfl-train?season=2025&force=1</a></li>
    <li><a href="/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1">/.netlify/functions/nfl-train?years=2022,2023,2024,2025&force=1</a></li>
    <li><a href="/.netlify/functions/nfl-predictions-generate?force=1">/.netlify/functions/nfl-predictions-generate?force=1</a></li>
  </ul>
`));

// predictions page
writeFileSync(join(outDir, 'nfl-predictions.html'), page('NFL Predictions', `
  <h2>NFL Predictions</h2>
  <div id="note" class="muted">Fetching…</div>
  <table id="tbl" style="display:none">
    <thead>
      <tr>
        <th>Matchup</th><th>Kickoff</th>
        <th>Moneyline</th><th>Conf</th>
        <th>Spread</th><th>Conf</th>
        <th>Total</th><th>Conf</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  <script type="module">
    function td(v){ const el=document.createElement('td'); el.textContent=v; return el; }
    function pct(n){ return (n==null||isNaN(n)) ? '–' : (Math.round(Number(n)) + '%'); }
    async function load() {
      const url = '/.netlify/functions/nfl-predictions-generate?force=1';
      const r = await fetch(url);
      const j = await r.json();
      const note = document.getElementById('note');
      if(!j.ok){ note.textContent = 'Error: '+(j.error||'unknown'); return; }
      if(!j.rows || !j.rows.length){
        note.textContent = 'No rows yet. Train, then Generate from Tools.';
        return;
      }
      note.textContent = '';
      const tb = document.querySelector('#tbl'); tb.style.display='table';
      const bod = tb.querySelector('tbody');
      j.rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.appendChild(td(row.matchup));
        tr.appendChild(td(new Date(row.kickoff).toLocaleString()));
        tr.appendChild(td(row.moneylineText ?? '–'));
        tr.appendChild(td(pct(row.moneylineConf)));
        tr.appendChild(td(row.spreadText ?? '–'));
        tr.appendChild(td(pct(row.spreadConf)));
        tr.appendChild(td(row.totalText ?? '–'));
        tr.appendChild(td(pct(row.totalConf)));
        bod.appendChild(tr);
      });
    }
    load().catch(e => { document.getElementById('note').textContent = String(e); });
  </script>
`));

console.log("Built static pages into /dist at", now);
