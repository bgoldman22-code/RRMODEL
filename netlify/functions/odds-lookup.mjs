// netlify/functions/odds-lookup.mjs

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
    // no blobs or not configured
  }
  return null;
}

async function loadFromFunctions(event) {
  const base = getBaseUrl(event);
  let j = await fetchJson(`${base}/.netlify/functions/odds-get`);
  if (j && j.ok && j.players) return { source:"odds-get", key:"odds-get", json:j.players };
  // try quick refresh then get
  await fetchJson(`${base}/.netlify/functions/odds-refresh-rapid?quick=1`);
  j = await fetchJson(`${base}/.netlify/functions/odds-get`);
  if (j && j.ok && j.players) return { source:"refreshed", key:"odds-get", json:j.players };
  return null;
}

function flattenSnapshot(snap) {
  // accept either {players: map} or flat map
  if (!snap) return [];
  if (snap.players && typeof snap.players === "object") return Object.entries(snap.players);
  if (typeof snap === "object") return Object.entries(snap);
  return [];
}

export const handler = async (event) => {
  try {
    const name = event?.queryStringParameters?.name || "";
    if (!name) return json({ ok:false, error:"missing ?name=" });

    let snap = await loadFromBlobs();
    if (!snap) snap = await loadFromFunctions(event);
    if (!snap) return json({ ok:false, error:"no odds snapshot available (blobs+functions failed)" });

    const entries = flattenSnapshot(snap.json);
    const target = name;
    const targetNorm = normName(target);

    const exact = [];
    const fuzzy = [];
    for (const [rawKey, val] of entries) {
      const keyNorm = normName(rawKey);
      if (keyNorm === targetNorm) exact.push({ rawKey, val });
      else {
        const score = jaccard(keyNorm, targetNorm);
        if (score >= 0.5) fuzzy.push({ rawKey, score, val:null });
      }
    }
    fuzzy.sort((a,b)=>b.score-a.score);
    const fuzzy_sample = fuzzy.slice(0,10).map(x=>({ rawKey:x.rawKey, score:Number(x.score.toFixed(2)) }));

    return json({ ok:true, source:snap.source, snapshot_key:snap.key, target, normalized:targetNorm, exact_count: exact.length, exact: exact.slice(0,10), fuzzy_count:fuzzy.length, fuzzy_sample });
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
