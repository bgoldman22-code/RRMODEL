
'use strict';

/**
 * Minimal nflverse CSV loader with multiple URL patterns and small backoff
 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CANDIDATE_URLS = (year) => [
  // primary (fastR modern layout)
  `https://github.com/nflverse/nflverse-data/releases/download/games/games_${year}.csv`,
  // legacy mirrors
  `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${year}.csv.gz`, // gzipped
  `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${year}.csv`,
];

async function fetchTextMaybeGzip(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  // If it's gz, we can't gunzip without a lib; the legacy path is mostly for presence check.
  const ct = res.headers.get("content-type") || "";
  if (url.endsWith(".gz")) {
    // Try anyway; many proxies auto-decompress on the fly.
    return await res.text();
  }
  if (/text\/plain|text\/csv|application\/octet-stream|application\/x-gzip/.test(ct)) {
    return await res.text();
  }
  return await res.text();
}

async function fetchSeasonCSV(year) {
  const urls = CANDIDATE_URLS(year);
  let lastErr = null;
  for (const u of urls) {
    try {
      const txt = await fetchTextMaybeGzip(u);
      if (txt && txt.length > 1000) return txt;
    } catch (e) {
      lastErr = e;
      await sleep(150);
    }
  }
  const err = new Error(`All sources failed for ${year}: ${lastErr ? (lastErr.status || lastErr.message) : 'unknown'}`);
  err.code = "FETCH_FAILED";
  throw err;
}

function parseCSVBasic(csvText) {
  // very light CSV parser (no quotes support; nflverse simple enough for demo paths)
  const lines = csvText.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = cells[i]);
    return obj;
  });
}

function computeTeamForm(rows) {
  // basic net points per game per team
  const teams = new Map();
  for (const r of rows) {
    const home = r.home_team || r.home_team_abbr || r.home || r.home_team_id;
    const away = r.away_team || r.away_team_abbr || r.away || r.away_team_id;
    const hs = Number(r.home_score || r.total_home_score || r.result_home || 0);
    const as = Number(r.away_score || r.total_away_score || r.result_away || 0);
    if (!home || !away) continue;

    if (!teams.has(home)) teams.set(home, { team: home, games: 0, pf: 0, pa: 0 });
    if (!teams.has(away)) teams.set(away, { team: away, games: 0, pf: 0, pa: 0 });

    teams.get(home).games++; teams.get(home).pf += hs; teams.get(home).pa += as;
    teams.get(away).games++; teams.get(away).pf += as; teams.get(away).pa += hs;
  }
  const out = {};
  for (const { team, games, pf, pa } of teams.values()) {
    const gp = Math.max(1, games);
    const off = pf / gp;
    const def = pa / gp;
    const net = off - def;
    out[team] = { team, gp: games, off, def, net };
  }
  return out;
}

module.exports = {
  fetchSeasonCSV,
  parseCSVBasic,
  computeTeamForm,
};
