// netlify/functions/nfl-train/index.cjs
// Drop-in function that trains "team form" by fetching nflfastR mirrors with retries.
// Falls back gracefully when sources are unreachable and optionally persists to Netlify Blobs.
//
// URL params:
//  - years: comma list (e.g. 2022,2023,2024,2025) OR season/week for a single season
//  - force: truthy to bypass cache (ignored here but logged)
//  - persist: '0' to skip writing blobs explicitly
//
const zlib = require("zlib");
const { fetchWithMirrors, buildNflfastRMirrors } = require("../_lib/http-helpers.cjs");
const { log, warn, error } = require("../_lib/log.cjs");

async function tryOpenStore() {
  try {
    // import ESM helper dynamically from CJS (avoids ERR_REQUIRE_ESM)
    const mod = await import("../_lib/blobs-helper.mjs");
    if (typeof mod.openStore !== "function") {
      warn("blobs-helper.mjs has no openStore export; skipping persistence");
      return null;
    }
    // Prefer explicit env var for store name; fallback to 'nfl'
    const store = await mod.openStore(process.env.BLOBS_STORE_NFL || "nfl");
    return store;
  } catch (e) {
    warn("Blobs disabled or not configured; skipping persistence.", e && e.message);
    return null;
  }
}

function parseYears(params) {
  if (params.years) {
    return params.years.split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  }
  if (params.season) {
    const y = parseInt(params.season, 10);
    if (y) return [y];
  }
  // sensible default to current + previous 2
  const now = new Date();
  return [now.getUTCFullYear() - 2, now.getUTCFullYear() - 1, now.getUTCFullYear()];
}

// quick n' tiny CSV parser (header + rows), returns array of objects
function csvParse(buf) {
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i]));
    return obj;
  });
}

// very simplified "form" aggregation: last N games point differentials etc.
// This is intentionally basic to unblock the pipeline.
function computeTeamForm(rows, N = 8) {
  const byTeam = new Map();
  for (const r of rows) {
    const home = r.home_team || r.home_team_abbr || r.home_team_name || r.home_team_alt || r.home_team;
    const away = r.away_team || r.away_team_abbr || r.away_team_name || r.away_team_alt || r.away_team;
    const hg = parseInt(r.home_score || r.total_home_score || r.home_points || 0, 10);
    const ag = parseInt(r.away_score || r.total_away_score || r.away_points || 0, 10);
    const date = r.gameday || r.game_date || r.game_id || r.game_time || "";
    if (!home || !away) continue;

    function push(team, opp, pf, pa, isHome) {
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push({ opp, pf, pa, pd: (pf - pa), date, isHome });
    }

    push(home, away, hg, ag, true);
    push(away, home, ag, hg, false);
  }

  const form = {};
  for (const [team, games] of byTeam.entries()) {
    // sort by date string as best-effort
    games.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = games.slice(-N);
    const pf = last.reduce((s, g) => s + (isFinite(g.pf) ? g.pf : 0), 0);
    const pa = last.reduce((s, g) => s + (isFinite(g.pa) ? g.pa : 0), 0);
    const pd = last.reduce((s, g) => s + (isFinite(g.pd) ? g.pd : 0), 0);
    const homeShare = last.length ? last.filter(g => g.isHome).length / last.length : 0;
    form[team] = { games: last.length, pf, pa, pd, homeShare };
  }
  return form;
}

async function loadYear(year) {
  const mirrors = buildNflfastRMirrors(year);
  log(`fetching year=${year} from mirrors`, mirrors[0]);
  const res = await fetchWithMirrors(mirrors, { retries: 1, timeoutMs: 15000 });
  if (!res.ok) {
    return { year, ok: false, reason: "fetch_failed", status: res.status || 0 };
  }
  // gunzip -> csv rows
  let unzipped;
  try {
    unzipped = zlib.gunzipSync(res.buffer);
  } catch (e) {
    return { year, ok: false, reason: "gunzip_failed" };
  }
  const rows = csvParse(unzipped);
  const form = computeTeamForm(rows);
  const teams = Object.keys(form).length;
  return { year, ok: true, teams, form };
}

exports.handler = async (event) => {
  const t0 = Date.now();
  const params = event.queryStringParameters || {};
  const years = parseYears(params);
  const force = params.force != null;

  const results = [];
  const aggregateForm = {};
  for (const y of years) {
    const r = await loadYear(y);
    results.push(r);
    if (r.ok) {
      Object.assign(aggregateForm, r.form);
    }
  }

  let persisted = false, wrote = null, persist_error = null;
  if (params.persist !== "0" && Object.keys(aggregateForm).length > 0 && !process.env.NFL_BLOBS_DISABLED) {
    try {
      const store = await tryOpenStore();
      if (store && store.setJSON) {
        wrote = "team_form.json";
        await store.setJSON(wrote, aggregateForm, { metadata: { updated: new Date().toISOString(), years } });
        persisted = true;
      }
    } catch (e) {
      persist_error = e && e.message || String(e);
    }
  }

  const body = {
    ok: true,
    meta: { years, persisted, wrote, persist_error },
    seasonResults: results.map(({form, ...rest}) => rest),
    summary: { teams: Object.keys(aggregateForm).length },
    updated: new Date().toISOString(),
    ms: Date.now() - t0,
  };
  log("summary", body.summary, "years", years, "ms", body.ms, "persisted", persisted);
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
};