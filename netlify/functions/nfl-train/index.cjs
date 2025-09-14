
// netlify/functions/nfl-train/index.cjs
/* eslint-disable no-console */
const zlib = require("zlib");
const { promisify } = require("util");
const gunzip = promisify(zlib.gunzip);
const https = require("https");
const http = require("http");
const { openStore } = require("../_lib/blobs-helper.mjs");

const DEFAULT_BASE = process.env.NFL_DATA_BASE || "https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games";

function mkAgent(url) {
  return url.startsWith("https://")
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetries(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      console.log(`[train] fetch try ${i}/${tries}: ${url}`);
      const res = await fetch(url, {
        // Node 18+ global fetch
        method: "GET",
        headers: { "Accept": "*/*" },
        redirect: "follow",
        // agent for keepAlive
        dispatcher: mkAgent(url)
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} body="${txt.slice(0,200)}"`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`[train] fetched ${buf.length} bytes from ${url}`);
      return buf;
    } catch (e) {
      console.warn(`[train] fetch error on ${url}: ${e.message}`);
      lastErr = e;
      await sleep(Math.min(250 * i, 1000));
    }
  }
  throw lastErr;
}

function parseYears(paramYears, season, week) {
  // priority: years=..., else season (single), else derive from week (noop here)
  if (paramYears) {
    return paramYears.split(",").map(s => parseInt(s.trim(), 10)).filter(Boolean);
  }
  if (season) {
    const y = parseInt(season, 10);
    if (!isNaN(y)) return [y];
  }
  // default: a modest window
  const yr = new Date().getUTCFullYear();
  return [yr - 1, yr];
}

async function loadYearCSV(year, base = DEFAULT_BASE) {
  // Try modern gz first, then csv, then legacy path.
  const urls = [
    `${base}/games_${year}.csv.gz`,
    `${base}/games_${year}.csv`,
    // legacy (very old docs referenced this)
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${year}.csv.gz`,
  ];
  let buf;
  let usedUrl = null;
  for (const url of urls) {
    try {
      buf = await fetchWithRetries(url, 3);
      usedUrl = url;
      break;
    } catch (e) {
      console.warn(`[train] failed ${url}: ${e.message}`);
    }
  }
  if (!buf) throw new Error("fetch_failed");
  // Decompress if needed
  if (usedUrl.endsWith(".gz")) {
    try {
      const ungz = await gunzip(buf);
      console.log(`[train] gunzipped year ${year}: ${buf.length} -> ${ungz.length}`);
      return { csv: ungz.toString("utf8"), url: usedUrl, gz: true };
    } catch (e) {
      console.warn(`[train] gunzip failed for ${usedUrl}: ${e.message}`);
      // try to treat as plain text anyway
      return { csv: buf.toString("utf8"), url: usedUrl, gz: true, gunzipError: e.message };
    }
  }
  return { csv: buf.toString("utf8"), url: usedUrl, gz: false };
}

function quickParseTeams(csv) {
  // minimal parse: first line headers, subsequent rows split by comma
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: 0, teams: [] };
  const header = lines[0].split(",");
  const homeIdx = header.findIndex(h => /home_?team/i.test(h));
  const awayIdx = header.findIndex(h => /away_?team/i.test(h));
  const teams = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (homeIdx >= 0 && cols[homeIdx]) teams.add(cols[homeIdx]);
    if (awayIdx >= 0 && cols[awayIdx]) teams.add(cols[awayIdx]);
  }
  return { rows: lines.length - 1, teams: Array.from(teams).sort() };
}

async function persistJSON(store, key, obj) {
  try {
    await store.putText(key, JSON.stringify(obj));
    console.log(`[train] persisted ${key} to ${store.type} "${store.name}" (${Buffer.byteLength(JSON.stringify(obj))} bytes)`);
    return { ok: true, key, store: store.type };
  } catch (e) {
    console.warn(`[train] persist failed for ${key}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

exports.handler = async (event) => {
  const t0 = Date.now();
  console.log("[train] start", { query: event.queryStringParameters, envBase: DEFAULT_BASE });
  const { years: paramYears, season, week, force } = event.queryStringParameters || {};
  const years = parseYears(paramYears, season, week);

  const seasonResults = [];
  const allTeams = new Set();

  for (const y of years) {
    try {
      const { csv, url, gz, gunzipError } = await loadYearCSV(y);
      const meta = { url, gz, gunzipError: gunzipError || null };
      const parsed = quickParseTeams(csv);
      parsed.teams.forEach(t => allTeams.add(t));
      console.log(`[train] year ${y}: ${parsed.rows} rows, ${parsed.teams.length} teams from ${url}`);
      seasonResults.push({ year: y, ok: true, rows: parsed.rows, teams: parsed.teams.length, meta });
    } catch (e) {
      console.warn(`[train] year ${y} failed: ${e.message}`);
      seasonResults.push({ year: y, ok: false, reason: e.message });
    }
  }

  const summary = { teams: Array.from(allTeams).sort().length, years: years.length };
  let persisted = false, wrote = null, persist_error = null;

  try {
    const store = await openStore("BLOBS_STORE_NFL");
    // Only persist if we actually parsed something
    if (summary.teams > 0) {
      const payload = { trained_at: new Date().toISOString(), years, summary, seasonResults };
      const res = await persistJSON(store, "team_form.json", payload);
      persisted = !!res.ok;
      wrote = res.ok ? "team_form.json" : null;
      persist_error = res.ok ? null : res.error;
    } else {
      console.log("[train] nothing to persist (no teams parsed)");
    }
  } catch (e) {
    console.warn("[train] openStore/persist error:", e?.message);
    persist_error = e?.message || "persist_error";
  }

  const resp = {
    ok: true,
    updated: new Date().toISOString(),
    meta: { years, persisted, wrote, persist_error },
    seasonResults,
    summary,
  };

  console.log("[train] done in", Date.now() - t0, "ms");
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(resp),
  };
};
