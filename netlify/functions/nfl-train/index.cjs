// netlify/functions/nfl-train/index.cjs
// CJS entrypoint that dynamically imports the ESM blobs helper.
// Fetches nflverse PBP CSV.GZ for given years, builds simple team_form, and persists.

const https = require('https');
const zlib = require('zlib');

const YEAR_LIST_RE = /^\d{4}(,\d{4})*$/;

const fetchGz = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, (res) => {
    if (res.statusCode !== 200) {
      return reject(new Error(`HTTP ${res.statusCode}`));
    }
    const chunks = [];
    res.on('data', (d) => chunks.push(d));
    res.on('end', () => resolve(Buffer.concat(chunks)));
  });
  req.on('error', reject);
});

const gunzip = (buf) => new Promise((resolve, reject) => {
  zlib.gunzip(buf, (err, out) => err ? reject(err) : resolve(out));
});

function linesToTeams(csvText) {
  // Very light parse: assume headers include 'home_team','away_team'
  // Find columns once from header, then collect team names from rows (limit to seen strings without commas).
  const lines = csvText.split(/\r?\n/);
  const header = lines[0] || '';
  const cols = header.split(',');
  const homeIdx = cols.indexOf('home_team');
  const awayIdx = cols.indexOf('away_team');
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // naive split; sufficient for our team columns which don't contain commas
    const parts = line.split(',');
    if (homeIdx >= 0 && parts[homeIdx]) seen.add(parts[homeIdx]);
    if (awayIdx >= 0 && parts[awayIdx]) seen.add(parts[awayIdx]);
  }
  return Array.from(seen);
}

async function getYearsFromQuery(event) {
  const qs = event.queryStringParameters || {};
  if (qs.years && YEAR_LIST_RE.test(qs.years)) {
    return qs.years.split(',').map((y) => parseInt(y, 10));
  }
  if (qs.season && /\d{4}/.test(qs.season)) {
    return [parseInt(qs.season, 10)];
  }
  // default: last 4 seasons including current
  const now = new Date();
  const y = now.getUTCFullYear();
  return [y-3, y-2, y-1, y];
}

function urlForYear(year) {
  // Updated nflverse location (was nflfastR-data/master/...)
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${year}.csv.gz`;
}

exports.handler = async (event) => {
  const started = new Date().toISOString();
  const years = await getYearsFromQuery(event);
  const seasonResults = [];
  const teamSet = new Set();
  const logs = [];

  for (const year of years) {
    const url = urlForYear(year);
    logs.push({ step: 'fetch_start', year, url });
    try {
      const gz = await fetchGz(url);
      const csv = await gunzip(gz);
      const text = csv.toString('utf8');
      const teams = linesToTeams(text);
      teams.forEach((t) => teamSet.add(t));
      seasonResults.push({ year, ok: true, status: 200, rowsProcessed: (text.match(/\n/g) || []).length });
      logs.push({ step: 'fetch_ok', year, rows: (text.match(/\n/g) || []).length });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      seasonResults.push({ year, ok: false, reason: msg.includes('HTTP') ? msg : 'fetch_failed' });
      logs.push({ step: 'fetch_err', year, error: msg });
    }
  }

  const summary = { teams: teamSet.size };
  let persisted = false, wrote = null, persist_error = null;

  // only try to persist if we actually have teams
  if (teamSet.size > 0) {
    try {
      const { openStore } = await import('../_lib/blobs-helper.mjs');
      const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodel-nfl';
      const store = await openStore(storeName);
      const key = 'team_form.json';
      const payload = {
        generated: new Date().toISOString(),
        years,
        teams: Array.from(teamSet).sort(),
      };
      await store.setJSON(key, payload);
      persisted = true;
      wrote = key;
      logs.push({ step: 'persist_ok', store: storeName, key });
    } catch (err) {
      persist_error = (err && (err.message || err.name)) || String(err);
      logs.push({ step: 'persist_err', error: persist_error });
    }
  } else {
    logs.push({ step: 'persist_skip', reason: 'no_teams' });
  }

  const body = {
    ok: true,
    meta: { years, persisted, wrote, persist_error },
    seasonResults,
    summary,
    logs,
    updated: new Date().toISOString(),
  };

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
};
