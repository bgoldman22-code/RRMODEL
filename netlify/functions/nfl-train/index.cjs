/**
 * netlify/functions/nfl-train/index.cjs
 *
 * Rewires training data fetches from the deprecated nflfastR-data repo
 * to the current nflverse-data release assets:
 *   https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_<YEAR>.csv.gz
 *
 * This function:
 *  - Accepts ?years=YYYY,YYYY... or ?season=YYYY&week=N (season/week is ignored for fetching history)
 *  - Downloads & gunzips the PBP CSV(s)
 *  - Builds a very lightweight "team_form" summary (just counts games seen per team)
 *  - Persists to Netlify Blobs key: team_form.json (unless persist=0)
 *  - Returns a JSON status object with per-year results
 *
 * NOTES:
 *  - Uses dynamic import() to load the ESM blobs helper from a CJS file (avoids require ESM error)
 *  - Adds robust logging so you can see progress in Netlify logs
 */

const zlib = require("zlib");

/** Simple JSON response helper */
const json = (statusCode, bodyObj) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(bodyObj),
});

/** Parse query string into a tiny object */
const parseQuery = (event) => {
  const u = new URL(event.rawUrl || `https://dummy${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
  const out = {};
  for (const [k, v] of u.searchParams.entries()) {
    out[k] = v;
  }
  return out;
};

/** Turn years param into an array of ints; also accept season */
const resolveYears = (q) => {
  if (q.years) {
    return q.years.split(",").map(s => parseInt(s.trim(), 10)).filter(Boolean);
  }
  if (q.season) {
    const y = parseInt(q.season, 10);
    return Number.isFinite(y) ? [y] : [];
  }
  // default: last 4 seasons
  const now = new Date().getUTCFullYear();
  return [now-3, now-2, now-1, now];
};

/** Build download URL for nflverse-data PBP gz CSV */
const pbpUrl = (year) =>
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${year}.csv.gz`;

/** Gunzip ArrayBuffer -> string */
const gunzipToString = async (ab) => {
  const buf = Buffer.from(ab);
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, out) => {
      if (err) return reject(err);
      resolve(out.toString("utf8"));
    });
  });
};

/** Minimal CSV parser to extract column indices and iterate rows without extra deps */
function* csvRows(text) {
  // naive split by \n, okay for these files (they don't contain embedded newlines in cells)
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    yield line.split(",");
  }
}

/** Compute a tiny team form summary: games seen per team across years */
const buildTeamForm = (csvText, accum) => {
  // find indices from header
  const iter = csvRows(csvText);
  const header = iter.next();
  if (header.done) return accum;
  const cols = header.value;
  const iPost = cols.indexOf("posteam");
  const iDef  = cols.indexOf("defteam");
  if (iPost === -1 || iDef === -1) return accum;

  for (const row of iter) {
    const a = row[iPost];
    const b = row[iDef];
    if (a) accum[a] = (accum[a] || 0) + 1;
    if (b) accum[b] = (accum[b] || 0) + 1;
  }
  return accum;
};

async function getHelpers() {
  try {
    const mod = await import("../_lib/blobs-helper.mjs");
    return { openStore: mod.openStore };
  } catch (err) {
    console.warn("[nfl-train] Failed to import blobs-helper.mjs, Blobs persistence will be disabled.", err);
    return { openStore: null };
  }
}

exports.handler = async (event) => {
  const t0 = Date.now();
  const q = parseQuery(event);
  const years = resolveYears(q);
  const force = q.force === "1" || q.force === "true";
  const persist = q.persist !== "0"; // default true

  console.log("[nfl-train] start", { years, force, persist });

  const results = [];
  const teamCounts = {};

  for (const y of years) {
    const url = pbpUrl(y);
    try {
      console.log(`[nfl-train] fetching ${url}`);
      const res = await fetch(url, { headers: { "accept": "application/octet-stream" } });
      if (!res.ok) {
        console.error(`[nfl-train] ${y} failed with status ${res.status}`);
        results.push({ year: y, ok: false, status: res.status, reason: "HTTP " + res.status });
        continue;
      }
      const ab = await res.arrayBuffer();
      const csv = await gunzipToString(ab);
      buildTeamForm(csv, teamCounts);
      results.push({ year: y, ok: true, status: 200, rowsProcessed: (csv.match(/\n/g) || []).length });
    } catch (err) {
      console.error(`[nfl-train] ${y} fetch/parse error`, err);
      results.push({ year: y, ok: false, reason: "fetch_failed" });
    }
  }

  const summary = { teams: Object.keys(teamCounts).length };
  let persisted = false, wrote = null, persist_error = null;

  if (persist && Object.keys(teamCounts).length) {
    try {
      const { openStore } = await getHelpers();
      if (!openStore) throw new Error("blobs_helper_unavailable");
      const store = await openStore("nfl");
      const payload = { team_form: teamCounts, _meta: { years, generatedAt: new Date().toISOString() } };
      wrote = "team_form.json";
      await store.setJSON(wrote, payload);
      persisted = true;
      console.log(`[nfl-train] persisted ${wrote} to store "${store.name}"`);
    } catch (err) {
      persist_error = String(err && err.message || err);
      console.warn("[nfl-train] persist skipped/failed:", persist_error);
    }
  } else {
    console.log("[nfl-train] skipping persist (persist=false or no data)");
  }

  const body = {
    ok: true,
    meta: { years, persisted, wrote, persist_error },
    seasonResults: results,
    summary,
    updated: new Date().toISOString(),
  };

  console.log("[nfl-train] done", { ms: Date.now() - t0, summary, persisted });
  return json(200, body);
};
