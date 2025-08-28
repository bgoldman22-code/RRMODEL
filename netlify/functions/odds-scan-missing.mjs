// netlify/functions/odds-scan-missing.mjs
import { getStore } from './_blobs.js';
const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const CANDIDATE_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

function normName(s) {
  if (!s) return "";
  const lower = String(s).toLowerCase().trim();
  const m = lower.match(/^([^,]+),\s*(.+)$/);
  let t = m ? (m[2] + " " + m[1]) : lower;
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[.]/g, "").replace(/[\u2019’]/g, "'").replace(/,+/g, "");
  t = t.replace(/\b(jr|jr\.|iii|ii)\b/g, "").replace(/\s+/g, " ").trim();
  return t;
}
function buildBaseUrl(event) {
  const qpUrl = process.env.ODDS_INTERNAL_URL;
  if (qpUrl) return qpUrl.endsWith("/") ? qpUrl.slice(0,-1) : qpUrl;
  const host = event?.headers?.["x-forwarded-host"] || event?.headers?.host || "localhost";
  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
async function httpJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try { return { status: res.status, ok: res.ok, json: JSON.parse(text), raw: text }; }
  catch { return { status: res.status, ok: res.ok, json: null, raw: text }; }
}
async function loadFromBlobs() {
  const tried = [];
  try {
    const store = getStore(STORE_NAME);
    for (const key of CANDIDATE_KEYS) {
      try {
        const blob = await store.get(key);
        if (blob) return { ok:true, source:"blobs", key, data: JSON.parse(blob), tried };
        tried.push({ where:"blobs", key, ok:false, note:"empty" });
      } catch (e) {
        tried.push({ where:"blobs", key, ok:false, error:String(e) });
      }
    }
    return { ok:false, tried };
  } catch (e) {
    return { ok:false, tried:[{ where:"blobs", ok:false, error:String(e) }] };
  }
}
async function loadFromFunctions(event) {
  const base = buildBaseUrl(event);
  const tried = [];
  let r = await httpJson(`${base}/.netlify/functions/odds-get`);
  tried.push({ where:"odds-get", status:r.status, ok:r.ok, bodyOk: !!(r.json && (r.json.players || Object.keys(r.json||{}).length)) });
  if (r.ok && r.json && (r.json.players || Object.keys(r.json).length)) {
    return { ok:true, source:"odds-get", key:"func", data: r.json.players || r.json, tried };
  }
  await fetch(`${base}/.netlify/functions/odds-refresh-rapid?quick=1`);
  r = await httpJson(`${base}/.netlify/functions/odds-get`);
  tried.push({ where:"odds-refresh+get", status:r.status, ok:r.ok, bodyOk: !!(r.json && (r.json.players || Object.keys(r.json||{}).length)) });
  if (r.ok && r.json && (r.json.players || Object.keys(r.json).length)) {
    return { ok:true, source:"refreshed", key:"func", data: r.json.players || r.json, tried };
  }
  return { ok:false, tried };
}
async function loadFromTheOdds() {
  const key = process.env.THEODDS_API_KEY || process.env.THEODDS_APIKEY || process.env.THEODDSAPI_KEY;
  if (!key) return { ok:false, tried:[{ where:"theoddsapi", ok:false, error:"missing THEODDS_API_KEY" }] };
  const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us,us2&markets=batter_home_runs&oddsFormat=american&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
  const r = await httpJson(url);
  const tried = [{ where:"theoddsapi", status:r.status, ok:r.ok }];
  if (!r.ok || !Array.isArray(r.json)) return { ok:false, tried };
  const players = {};
  for (const ev of r.json) {
    for (const bk of ev.bookmakers || []) {
      const bookKey = bk?.key;
      for (const mk of bk?.markets || []) {
        if (mk?.key !== "batter_home_runs") continue;
        for (const oc of mk?.outcomes || []) {
          const name = (oc?.participant || oc?.description || oc?.name || "").trim();
          if (!name) continue;
          const price = oc?.price;
          const k = normName(name);
          if (!players[k]) players[k] = { by_book: {}, count_books: 0 };
          if (typeof price === "number") players[k].by_book[bookKey] = price;
        }
      }
    }
  }
  for (const k of Object.keys(players)) {
    const arr = Object.values(players[k].by_book).filter(v => typeof v === "number");
    if (arr.length) {
      const sorted = arr.slice().sort((a,b)=>a-b);
      const mid = Math.floor(sorted.length/2);
      players[k].median_american = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid-1]+sorted[mid])/2);
      players[k].count_books = arr.length;
    }
  }
  return { ok:true, source:"theoddsapi", key:"api", data: players, tried };
}
function buildIndex(data) {
  const map = new Map();
  const src = data.players && typeof data.players === "object" ? data.players : data;
  for (const [rawKey, val] of Object.entries(src || {})) {
    map.set(normName(rawKey), val);
  }
  return map;
}
export const handler = async (event) => {
  try {
    let names = [];
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      names = Array.isArray(body.names) ? body.names : [];
    } else {
      const qp = event?.queryStringParameters || {};
      if (qp.names) names = qp.names.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!names.length) return json({ ok:false, error:"provide names via POST {names:[...]} or ?names=a,b,c" });

    const tried = [];
    let load = await loadFromBlobs();
    tried.push(...(load.tried || []));
    if (!load.ok) {
      const f = await loadFromFunctions(event);
      tried.push(...(f.tried || []));
      if (f.ok) load = f; else {
        const d = await loadFromTheOdds();
        tried.push(...(d.tried || []));
        if (d.ok) load = d;
      }
    }
    if (!load.ok) return json({ ok:false, error:"no odds snapshot available (blobs+functions+api failed)", tried });

    const idx = buildIndex(load.data);
    const missing = [];
    const found = [];
    for (const name of names) {
      const key = normName(name);
      if (idx.has(key)) {
        found.push({ name, key, sample: idx.get(key) });
      } else {
        missing.push({ name, key, diagnosis:"No exact match in snapshot (check alias/name formatting or market coverage)" });
      }
    }
    return json({ ok:true, source: load.source, snapshot_key: load.key, counts: { provided: names.length, found: found.length, missing: missing.length }, missing, found_sample: found.slice(0, 10), tried });
  } catch (e) {
    return json({ ok:false, error:String(e) });
  }
};
function json(body){ return { statusCode:200, headers:{ "content-type":"application/json","cache-control":"no-store" }, body: JSON.stringify(body) }; }
