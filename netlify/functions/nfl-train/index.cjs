// netlify/functions/nfl-train/index.cjs
/* eslint-disable no-console */
const { URL } = require('url');

// Helper: robust fetch with timeout
async function fetchWithTimeout(url, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Build candidate URLs for nflfastR games CSV (historical repo layout)
function buildYearUrls(year) {
  const y = String(year).trim();
  return [
    // canonical (games/games_YYYY.csv.gz)
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv.gz`,
    // sometimes mirrored under 'data/games' with uncompressed CSV
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv`,
    // legacy path people sometimes used (missing 'games_' prefix) — keep as last resort
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${y}.csv.gz`,
  ];
}

// Minimal gunzip using node:zlib if needed
const zlib = require('zlib');
function maybeGunzip(buffer, contentType, url) {
  const lc = (contentType || '').toLowerCase();
  const gz = url.endsWith('.gz') || lc.includes('gzip');
  if (!gz) return buffer;
  try {
    return zlib.gunzipSync(buffer);
  } catch (e) {
    console.warn('[nfl-train] gunzip failed, returning raw buffer', e?.message);
    return buffer;
  }
}

async function fetchSeasonCsv(year) {
  const urls = buildYearUrls(year);
  for (const u of urls) {
    try {
      const res = await fetchWithTimeout(u, 20000);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const data = maybeGunzip(buf, res.headers.get('content-type'), u).toString('utf8');
        console.log('[nfl-train] fetched', u, 'bytes=', data.length);
        return { ok: true, url: u, csv: data };
      } else if (res.status === 404) {
        console.warn('[nfl-train] 404', u);
      } else {
        console.warn('[nfl-train] non-OK', u, res.status, await res.text().catch(()=>''));
      }
    } catch (e) {
      console.warn('[nfl-train] fetch error', u, e?.name || e?.message || e);
    }
  }
  return { ok: false, error: 'all_urls_failed' };
}

// Tiny CSV parser for our needs
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    // split by commas not in quotes (basic)
    const parts = [];
    let cur = '', inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' ) {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    const obj = {};
    headers.forEach((h, idx) => obj[h] = parts[idx]);
    return obj;
  });
  return { headers, rows };
}

// Crude "team form" metric using point differential last N games (here, season aggregate as a placeholder)
function computeTeamForm(rows) {
  // nflfastR has 'home_team','away_team','home_score','away_score' in games
  const map = new Map();
  for (const r of rows) {
    const h = r.home_team || r.home || r.homeabbr || r.h_team;
    const a = r.away_team || r.away || r.awayabbr || r.a_team;
    const hs = Number(r.home_score || r.total_home_score || r.h_score || 0);
    const as = Number(r.away_score || r.total_away_score || r.a_score || 0);
    if (!h || !a) continue;
    const hpd = hs - as;
    const apd = as - hs;
    map.set(h, (map.get(h)||0) + hpd);
    map.set(a, (map.get(a)||0) + apd);
  }
  // normalize to 0..1
  const vals = Array.from(map.values());
  const min = Math.min(0, ...vals);
  const max = Math.max(1, ...vals);
  const form = {};
  for (const [team, v] of map.entries()) {
    form[team] = (v - min) / (max - min || 1);
  }
  return form;
}

// Blobs
const path = require('path');
async function getStore() {
  // dynamic import to keep .cjs happy
  const helper = await import('../_lib/blobs-helper.mjs');
  return helper.openStore(['BLOBS_STORE_NFL','BLOBS_STORE']);
}

async function persistJSON(key, obj) {
  try {
    const store = await getStore();
    await store.set(key, JSON.stringify(obj));
    return { ok: true };
  } catch (e) {
    console.warn('[nfl-train] persistJSON failed', e?.name || e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

function parseYearsParam(query) {
  const q = query.get('years');
  if (q) return q.split(',').map(s => Number(s.trim())).filter(Boolean);
  const season = Number(query.get('season'));
  if (season) return [season];
  const envYears = process.env.TRAIN_YEARS;
  if (envYears) return envYears.split(',').map(s => Number(s.trim())).filter(Boolean);
  return [2024, 2023, 2022];
}

exports.handler = async (event) => {
  const start = Date.now();
  try {
    const url = new URL(event.rawUrl || `https://x.local${event.path}${event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : ''}`);
    const q = url.searchParams;
    const years = parseYearsParam(q);
    const force = q.get('force');

    console.log('[nfl-train] start', { years, force });

    const seasonResults = [];
    const aggregateRows = [];

    for (const y of years) {
      const res = await fetchSeasonCsv(y);
      if (!res.ok) {
        seasonResults.push({ year: y, ok: false, reason: 'fetch_failed' });
        continue;
      }
      const { rows } = parseCsv(res.csv);
      console.log(`[nfl-train] parsed ${rows.length} rows for ${y}`);
      aggregateRows.push(...rows);
      seasonResults.push({ year: y, ok: true, url: res.url, rows: rows.length });
    }

    const team_form = computeTeamForm(aggregateRows);
    const summary = { teams: Object.keys(team_form).length };

    let persisted = false, wrote = null, persist_error = null;
    if (Object.keys(team_form).length) {
      const key = 'team_form.json';
      const p = await persistJSON(key, { updated: new Date().toISOString(), team_form });
      persisted = !!p.ok;
      wrote = p.ok ? key : null;
      persist_error = p.ok ? null : p.error;
    }

    const resp = {
      ok: true,
      meta: { years, persisted, wrote, persist_error },
      seasonResults,
      summary,
      updated: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(resp),
    };
  } catch (e) {
    console.error('[nfl-train] CRASH', e?.stack || e?.message || e);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  } finally {
    console.log('[nfl-train] done in ms', Date.now() - start);
  }
};
