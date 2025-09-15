// netlify/functions/nfl-train/index.mjs
// Train "team form" features and persist to Netlify Blobs as team_form.json

import { makeStore, saveToBlobs } from '../_lib/blobs-helper.mjs';

const YEARS_DEFAULT = [2022, 2023, 2024, 2025];
const LOG_PREFIX = '[NFL-TRAIN]';

// Minimal parser for csv (avoid adding heavy deps here)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  return lines.map(line => {
    // simple split; the nflfastR files are simple enough for this
    const cols = line.split(',');
    const row = {};
    header.forEach((h, i) => row[h] = cols[i]);
    return row;
  });
}

const SOURCES = [
  // nflfastR current repo layout (seasons moved under seasons/ by year historically)
  (year) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/seasons/${year}/games.csv.gz`,
  // classic layout fallback (older readmes reference this)
  (year) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${year}.csv.gz`,
];

async function fetchSeasonCSV(year) {
  let lastErr;
  for (const urlFn of SOURCES) {
    const url = urlFn(year);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // Netlify fetch doesn't auto-decompress .gz; many of nflverse endpoints serve *uncompressed* csv despite .gz suffix.
      const buf = await resp.arrayBuffer();
      const text = new TextDecoder().decode(buf);
      if (!text || text.length < 1000) throw new Error('fetch_too_small');
      return { ok: true, year, url, text };
    } catch (err) {
      lastErr = err;
      console.warn(`${LOG_PREFIX} fetch failed ${year} @ ${url}: ${err?.message}`);
    }
  }
  return { ok: false, year, error: lastErr?.message || 'fetch_failed' };
}

function aggregateTeamForm(rows) {
  // Extremely light features: points for/against rolling sums by team.
  // nflfastR header fields: home_team, away_team, home_score, away_score, season, week, game_id, etc.
  const teams = new Map();
  function init(team) {
    if (!teams.has(team)) teams.set(team, { games: 0, pts_for: 0, pts_against: 0, net: 0 });
    return teams.get(team);
  }
  for (const r of rows) {
    const h = r.home_team || r.home_team_abbr || r.home_team_name;
    const a = r.away_team || r.away_team_abbr || r.away_team_name;
    const hs = Number(r.home_score || r.total_home_score || 0);
    const as = Number(r.away_score || r.total_away_score || 0);
    if (!h || !a) continue;
    const H = init(h), A = init(a);
    H.games += 1; H.pts_for += hs; H.pts_against += as; H.net += (hs - as);
    A.games += 1; A.pts_for += as; A.pts_against += hs; A.net += (as - hs);
  }
  const out = {};
  for (const [team, s] of teams.entries()) {
    out[team] = {
      gp: s.games,
      off_ppg: s.games ? s.pts_for / s.games : 0,
      def_ppg: s.games ? s.pts_against / s.games : 0,
      net_ppg: s.games ? s.net / s.games : 0,
    };
  }
  return out;
}

export async function handler(event) {
  const qs = event.queryStringParameters || {};
  const force = qs.force || qs.f || null;
  const years = (qs.years ? qs.years.split(',').map(v=>Number(v.trim())).filter(Boolean) :
                qs.season ? [Number(qs.season)] :
                YEARS_DEFAULT);

  console.log(LOG_PREFIX, 'starting', { years, force });

  const seasonResults = [];
  const allRows = [];
  for (const year of years) {
    const got = await fetchSeasonCSV(year);
    if (!got.ok) {
      seasonResults.push({ year, ok: false, reason: got.error || 'fetch_failed' });
      continue;
    }
    const text = got.text;
    // If it's actually gzipped binary text indicator, we already handled decoding; proceed.
    // Light parse (fast, safe)
    const rows = parseCSV(text);
    allRows.push(...rows);
    seasonResults.push({ year, ok: true, status: 200, rowsProcessed: rows.length });
  }

  let persisted = false, wrote = null, persist_error = null;
  const summary = { teams: 0 };

  if (allRows.length) {
    const features = aggregateTeamForm(allRows);
    summary.teams = Object.keys(features).length;

    try {
      const store = makeStore(); // resolves to BLOBS_STORE_NFL || BLOBS_STORE || 'nfl-td'
      const key = 'team_form.json';
      await saveToBlobs(key, features, { storeName: store });
      persisted = true;
      wrote = key;
    } catch (err) {
      persist_error = err?.message || String(err);
      console.warn(LOG_PREFIX, 'persist_error', persist_error);
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
      updated: new Date().toISOString(),
    }),
  };
}

export default { handler };
