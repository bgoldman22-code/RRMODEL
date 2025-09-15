// netlify/functions/nfl-train/index.mjs
import zlib from 'node:zlib';
import { openStore, writeJSON } from '../_lib/blobs-helper.mjs';

const RAW_BASE = 'https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games';

async function fetchSeason(year) {
  const url = `${RAW_BASE}/games_${year}.csv.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    return { year, ok: false, status: res.status, reason: 'HTTP ' + res.status };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const csv = zlib.gunzipSync(buf).toString('utf8');
  const lines = csv.split('\n');
  const header = lines[0] || '';
  // very light scan
  const headers = header.split(',');
  const homeIdx = headers.indexOf('home_team');
  const awayIdx = headers.indexOf('away_team');
  const teams = new Set();
  for (let i = 1; i < Math.min(lines.length, 5000); i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = row.split(',');
    if (homeIdx >= 0) teams.add(cols[homeIdx]);
    if (awayIdx >= 0) teams.add(cols[awayIdx]);
  }
  return { year, ok: true, status: 200, rowsProcessed: lines.length - 1, teams: [...teams] };
}

export async function handler(event) {
  try {
    const qp = new URLSearchParams(event.queryStringParameters || {});
    const yearsQ = qp.get('years') || qp.get('season') || '';
    const force = qp.get('force') === '1' || qp.get('force') === 'true';
    const years = yearsQ
      ? yearsQ.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)
      : [new Date().getFullYear()];

    const seasonResults = [];
    const allTeams = new Set();
    for (const y of years) {
      try {
        const r = await fetchSeason(y);
        seasonResults.push(r);
        if (r.ok && Array.isArray(r.teams)) r.teams.forEach(t => allTeams.add(t));
      } catch (e) {
        seasonResults.push({ year: y, ok: false, reason: 'fetch_failed' });
      }
    }

    const summary = { teams: allTeams.size };
    let persisted = false, wrote = null, persist_error = null;
    if (allTeams.size > 0) {
      // example minimal team form payload
      const teamForm = {};
      allTeams.forEach(t => { teamForm[t] = { elo: 0, last5: [] }; });
      try {
        const store = await openStore();
        const key = 'team_form.json';
        if (force || teamForm) {
          await writeJSON(store, key, { updated: new Date().toISOString(), teams: teamForm });
          persisted = true; wrote = key;
        }
      } catch (e) {
        persist_error = e?.message || String(e);
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        meta: { years, persisted, wrote, persist_error },
        seasonResults,
        summary,
        updated: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: (err && err.message) || String(err)
      })
    };
  }
}
