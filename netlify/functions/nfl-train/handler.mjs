// netlify/functions/nfl-train/handler.mjs
// Minimal trainer: fetch a small subset from nflverse, derive ultra-light features, save to blobs.
// This is intentionally simple to keep deploy stable; expand later as needed.
import { saveToBlobs, resolveStoreName } from '../_lib/blobs-helper.mjs';

const FALLBACK_YEARS = [2025];

function parseYears(qsYears, qsSeason) {
  if (qsYears) {
    return qsYears.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
  }
  if (qsSeason) {
    const y = parseInt(qsSeason, 10);
    if (!Number.isNaN(y)) return [y];
  }
  return FALLBACK_YEARS;
}

function nflverseGameUrl(year) {
  // New nflverse location (csv uncompressed). You can adjust if you have a different mirror.
  return `https://raw.githubusercontent.com/nflverse/nflverse-data/master/fastR/roster_games/games_${year}.csv`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return await res.text();
}

function lightParseCSV(text, limit = 5000) {
  const lines = text.split(/\r?\n/);
  const header = lines.shift();
  const cols = header ? header.split(',') : [];
  const out = [];
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const row = lines[i];
    if (!row) continue;
    const vals = row.split(',');
    const rec = {};
    for (let c = 0; c < cols.length && c < vals.length; c++) rec[cols[c]] = vals[c];
    out.push(rec);
  }
  return out;
}

function buildTeamForm(rows) {
  // Extremely light: net point diff per team
  const teams = new Map();
  for (const r of rows) {
    const home = r.home_team || r.home || r.home_team_name || r.home_team_abbr;
    const away = r.away_team || r.away || r.away_team_name || r.away_team_abbr;
    const hs = parseInt(r.home_score || r.total_home_score || r.h),
          as = parseInt(r.away_score || r.total_away_score || r.a);
    if (!home || !away || Number.isNaN(hs) || Number.isNaN(as)) continue;
    const diffHome = hs - as;
    const diffAway = -diffHome;
    teams.set(home, (teams.get(home) || 0) + diffHome);
    teams.set(away, (teams.get(away) || 0) + diffAway);
  }
  const arr = Array.from(teams.entries()).map(([team, net_pts]) => ({ team, net_pts }));
  arr.sort((a,b) => b.net_pts - a.net_pts);
  return { updated: new Date().toISOString(), teams: arr };
}

export async function handler(event) {
  const qs = event && event.queryStringParameters || {};
  const years = parseYears(qs.years, qs.season);
  const results = [];
  const allRows = [];
  for (const y of years) {
    const url = nflverseGameUrl(y);
    try {
      const txt = await fetchText(url);
      const rows = lightParseCSV(txt, 20000);
      results.push({ year: y, ok: true, status: 200, rowsProcessed: rows.length });
      allRows.push(...rows);
    } catch (e) {
      results.push({ year: y, ok: false, reason: e.message, status: e.status || 0 });
    }
  }
  let persisted = false, wrote = null, persist_error = null;
  if (allRows.length) {
    const features = buildTeamForm(allRows);
    try {
      await saveToBlobs('team_form.json', features, { storeName: resolveStoreName() });
      persisted = true;
      wrote = 'team_form.json';
    } catch (e) {
      persist_error = e.message;
    }
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      meta: { years, persisted, wrote, persist_error },
      summary: { teams: allRows.length ? buildTeamForm(allRows).teams.length : 0 },
      seasonResults: results,
      updated: new Date().toISOString(),
    })
  };
}
