/**
 * feature-engineering.mjs
 * Build rolling opponent-adjusted team-week features from nflfastR play-by-play CSVs.
 * This is intentionally dependency-light (no external CSV libs) and resilient:
 * - If a fetch fails, we skip that season.
 * - Only the columns we need are parsed.
 *
 * Exports:
 *  - computeTeamForm(years, opts) -> { teams: Map, logs: [] }
 *  - toPersistableJSON(teamForm)  -> JSON string for blobs
 */

const NFLVERSE_BASES = [
  // New locations first
  "https://raw.githubusercontent.com/nflverse/nflverse-data/master/data/games",
  // Legacy fallback
  "https://github.com/nflverse/nflfastR-data/raw/master/data"
];

const REQUIRED_COLS = [
  "season","week","home_team","away_team",
  "home_score","away_score",
  "home_epa","away_epa",
  "home_wpa","away_wpa",
  "spread_line","total_line"
];

/** small CSV parser for simple datasets (no quoted commas expected in our cols) */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { header: [], rows: [] };
  const header = lines[0].split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    rows.push({ header, idx, cells });
  }
  return { header, rows };
}

async function fetchSeasonCSV(year, logs) {
  let lastErr = null;
  for (const base of NFLVERSE_BASES) {
    const url = `${base}/${year}.csv`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        logs.push({ level: "warn", msg: "fetch_failed", year, url, status: res.status });
        continue;
      }
      const text = await res.text();
      logs.push({ level: "info", msg: "fetched", year, url, bytes: text.length });
      return text;
    } catch (e) {
      lastErr = e;
      logs.push({ level: "error", msg: "fetch_exception", year, url, error: String(e) });
    }
  }
  throw lastErr || new Error(`fetch_failed_${year}`);
}

function val(row, name) {
  const i = row.idx[name];
  if (i == null) return undefined;
  return row.cells[i];
}

function num(x) {
  const n = +x;
  return Number.isFinite(n) ? n : null;
}

function upsert(map, key, def) {
  if (!map.has(key)) map.set(key, def());
  return map.get(key);
}

// Rolling helper
function pushRolling(arr, value, max = 8) {
  if (value != null) arr.push(value);
  while (arr.length > max) arr.shift();
}

function avg(arr) {
  if (!arr.length) return null;
  let s = 0, c = 0;
  for (const v of arr) if (v != null) { s += v; c++; }
  return c ? s / c : null;
}

export async function computeTeamForm(years = [], opts = {}) {
  const { maxWindow = 8 } = opts;
  const logs = [];
  const teams = new Map(); // key: season-team e.g., "2025-DET", value: per-week features
  const indexBySeasonWeek = new Map(); // "2025-1-DET" -> feature row

  for (const y of years) {
    let text;
    try {
      text = await fetchSeasonCSV(y, logs);
    } catch (e) {
      logs.push({ level: "error", year: y, msg: "season_skip", error: String(e) });
      continue;
    }
    const { header, rows } = parseCSV(text);
    // quick check
    for (const col of REQUIRED_COLS) {
      if (!header.includes(col)) {
        logs.push({ level: "warn", msg: "missing_col", year: y, col });
      }
    }

    // per team rolling buffers
    const roll = new Map(); // team -> { offEpa:[], defEpa:[], pace:[], spreadErr:[], totalErr:[] }

    function getBuf(team) {
      return upsert(roll, team, () => ({
        offEpa: [], defEpa: [], pace: [], wpa: [],
        pointsFor: [], pointsAgainst: [],
        spreadErr: [], totalErr: [],
        lastWeek: 0,
      }));
    }

    for (const row of rows) {
      const week = +val(row, "week");
      const home = val(row, "home_team");
      const away = val(row, "away_team");
      const hEPA = num(val(row, "home_epa"));
      const aEPA = num(val(row, "away_epa"));
      const hWPA = num(val(row, "home_wpa"));
      const aWPA = num(val(row, "away_wpa"));
      const hPts = num(val(row, "home_score"));
      const aPts = num(val(row, "away_score"));
      const spr = num(val(row, "spread_line"));
      const tot = num(val(row, "total_line"));

      if (!week || !home || !away) continue;

      // update rolling (use pre-game rolling for features; update after computing)
      const hb = getBuf(home);
      const ab = getBuf(away);

      const homeKey = `${y}-${home}`;
      const awayKey = `${y}-${away}`;
      const hrow = upsert(teams, homeKey, () => []);
      const arow = upsert(teams, awayKey, () => []);

      const featHome = {
        season: y, week, team: home, opp: away, is_home: 1,
        off_epa_rolling: avg(hb.offEpa) ?? 0,
        def_epa_rolling: avg(hb.defEpa) ?? 0,
        wpa_rolling: avg(hb.wpa) ?? 0,
        spread_err_rolling: avg(hb.spreadErr) ?? 0,
        total_err_rolling: avg(hb.totalErr) ?? 0,
      };
      const featAway = {
        season: y, week, team: away, opp: home, is_home: 0,
        off_epa_rolling: avg(ab.offEpa) ?? 0,
        def_epa_rolling: avg(ab.defEpa) ?? 0,
        wpa_rolling: avg(ab.wpa) ?? 0,
        spread_err_rolling: avg(ab.spreadErr) ?? 0,
        total_err_rolling: avg(ab.totalErr) ?? 0,
      };

      hrow.push(featHome);
      arow.push(featAway);
      indexBySeasonWeek.set(`${y}-${week}-${home}`, featHome);
      indexBySeasonWeek.set(`${y}-${week}-${away}`, featAway);

      // After recording features, update buffers with current game results
      pushRolling(hb.offEpa, hEPA, maxWindow);
      pushRolling(hb.defEpa, aEPA != null ? -aEPA : null, maxWindow);
      pushRolling(hb.wpa, hWPA, maxWindow);
      pushRolling(hb.pointsFor, hPts, maxWindow);
      pushRolling(hb.pointsAgainst, aPts, maxWindow);

      pushRolling(ab.offEpa, aEPA, maxWindow);
      pushRolling(ab.defEpa, hEPA != null ? -hEPA : null, maxWindow);
      pushRolling(ab.wpa, aWPA, maxWindow);
      pushRolling(ab.pointsFor, aPts, maxWindow);
      pushRolling(ab.pointsAgainst, hPts, maxWindow);

      if (spr != null && hPts != null && aPts != null) {
        const margin = hPts - aPts;
        pushRolling(hb.spreadErr, (margin - (-spr)), maxWindow); // spread_line is usually away minus home
        pushRolling(ab.spreadErr, ((-margin) - spr), maxWindow);
      }
      if (tot != null && hPts != null && aPts != null) {
        const total = hPts + aPts;
        pushRolling(hb.totalErr, total - tot, maxWindow);
        pushRolling(ab.totalErr, total - tot, maxWindow);
      }
    }
  }

  return { teams, logs };
}

export function toPersistableJSON(teamsMap) {
  // Flatten to { "<season>-<team>": [rows...] }
  const out = {};
  for (const [k, v] of teamsMap.entries()) out[k] = v;
  return JSON.stringify(out);
}

export function loadFeatureFor(teamsJson, season, team) {
  const key = `${season}-${team}`;
  return teamsJson[key] || null;
}

export function latestTeamWeek(teamsJson, season, team) {
  const rows = teamsJson[`${season}-${team}`];
  if (!rows || !rows.length) return null;
  return rows[rows.length - 1];
}

// Simple logistic
export function sigmoid(x){ return 1/(1+Math.pow(Math.E,-x)); }

/**
 * scoreMatchup(featuresHome, featuresAway) -> { p_home, p_over }
 * very lightweight baseline model using rolling EPA, WPA and home flag.
 * The goal is to be odds-independent while we wire the full model later.
 */
export function scoreMatchup(h, a, line = { spread: 0, total: null }) {
  const homeAdv = 0.35; // baked advantage in points proxy
  const f = (x)=> (x ?? 0);
  const offEdge = f(h.off_epa_rolling) - f(a.def_epa_rolling);
  const defEdge = f(h.def_epa_rolling) - f(a.off_epa_rolling);
  const wpaEdge = f(h.wpa_rolling) - f(a.wpa_rolling);

  // weights calibrated roughly; replace with trained weights when ready
  const z = 0.0 + 2.2*offEdge + 1.4*defEdge + 0.8*wpaEdge + 0.25*homeAdv;
  const p_home = sigmoid(z);

  let p_over = null;
  if (line.total != null) {
    // crude total: if both offenses trending up vs defenses, over lift
    const signal = f(h.off_epa_rolling)+f(a.off_epa_rolling) - (f(h.def_epa_rolling)+f(a.def_epa_rolling));
    p_over = sigmoid(-0.1 + 1.5*signal);
  }
  return { p_home, p_over };
}
