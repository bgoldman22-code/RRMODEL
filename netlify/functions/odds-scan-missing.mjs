// netlify/functions/odds-scan-missing.mjs

function normName(s) {
  if (!s) return "";
  let t = String(s).toLowerCase().trim();
  const m = t.match(/^([^,]+),\s*(.+)$/);
  if (m) t = `${m[2]} ${m[1]}`;
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[.]/g, "").replace(/[\u2019’]/g, "'").replace(/,+/g, "");
  t = t.replace(/\b(jr|jr\.|iii|ii)\b/g, "").replace(/\s+/g, " ").trim();
  return t;
}
function tokenSet(s){ return new Set(normName(s).split(" ").filter(Boolean)); }
function jaccard(a,b){
  const A = tokenSet(a), B = tokenSet(b);
  const inter = new Set([...A].filter(x=>B.has(x)));
  const union = new Set([...A, ...B]);
  return union.size ? inter.size/union.size : 0;
}
function getBaseUrl(event){
  if (process.env.URL) return process.env.URL;
  const host = event?.headers?.host || "localhost:8888";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
async function fetchJson(url, opts){
  const r = await fetch(url, opts || {});
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await r.text();
    return { ok:false, error:`non-json ${r.status}`, body:text };
  }
  const j = await r.json();
  return j;
}

const SNAPSHOT_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

async function loadFromBlobs() {
  try {
    const mod = await import("@netlify/blobs");
    const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
    const store = mod.getStore({ name: STORE_NAME });
    for (const key of SNAPSHOT_KEYS) {
      const s = await store.get(key);
      if (s) return { source:"blobs", key, json: JSON.parse(s) };
    }
  } catch (e) {
  }
  return null;
}

async function loadFromFunctions(event) {
  const base = getBaseUrl(event);
  let j = await fetchJson(`${base}/.netlify/functions/odds-get`);
  if (j && j.ok && j.players) return { source:"odds-get", key:"odds-get", json:j.players };
  await fetchJson(`${base}/.netlify/functions/odds-refresh-rapid?quick=1`);
  j = await fetchJson(`${base}/.netlify/functions/odds-get`);
  if (j && j.ok && j.players) return { source:"refreshed", key:"odds-get", json:j.players };
  return null;
}

function buildIndex(snap) {
  const map = new Map();
  if (!snap) return map;
  if (snap.players && typeof snap.players === "object") {
    for (const [k,v] of Object.entries(snap.players)) map.set(normName(k), v);
  } else if (typeof snap === "object") {
    for (const [k,v] of Object.entries(snap)) map.set(normName(k), v);
  }
  return map;
}

export const handler = async (event) => {
  try {
    let names = [];
    if (event.httpMethod === "POST") {
      try { const body = JSON.parse(event.body || "{}"); names = Array.isArray(body.names)? body.names: []; } catch { names = []; }
    } else {
      const qp = event?.queryStringParameters || {};
      if (qp.names) names = qp.names.split(",").map(s=>s.trim()).filter(Boolean);
    }
    if (!names.length) return json({ ok:false, error:"provide names via POST {names:[...]} or ?names=a,b" });

    let snap = await loadFromBlobs();
    if (!snap) snap = await loadFromFunctions(event);
    if (!snap) return json({ ok:false, error:"no odds snapshot available (blobs+functions failed)" });

    const idx = buildIndex(snap.json);
    const missing = [];
    const found = [];
    for (const nm of names) {
      const key = normName(nm);
      if (idx.has(key)) found.push({ name:nm, key });
      else missing.push({ name:nm, key, diagnosis:"No exact match in snapshot (check provider/coverage/name)" });
    }

    return json({ ok:true, source:snap.source, snapshot_key:snap.key, counts:{ provided:names.length, found:found.length, missing:missing.length }, missing, found_sample: found.slice(0,10) });
  } catch(e) {
    return json({ ok:false, error:String(e) });
  }
};

function json(body){
  return {
    statusCode: 200,
    headers: { "content-type":"application/json", "cache-control":"no-store" },
    body: JSON.stringify(body)
  };
}
