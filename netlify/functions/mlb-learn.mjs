// netlify/functions/mlb-learn.mjs
import { getStore } from "@netlify/blobs";
function dualGetStore(getStore){
  const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
  // First try ambient Netlify runtime
  try {
    const s = getStore({ name: STORE });
    return s;
  } catch(e) {
    // Fallback to explicit credentials if provided
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (!siteID || !token) {
      throw new Error("Netlify Blobs not configured: need NETLIFY_SITE_ID/SITE_ID and NETLIFY_BLOBS_TOKEN/NETLIFY_API_TOKEN");
    }
    return getStore({ name: STORE, siteID, token });
  }
}


const SNAPSHOT_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

const json = (b, code=200) => ({ statusCode: code, headers: { "content-type":"application/json", "cache-control":"no-store" }, body: JSON.stringify(b) });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s||"");
const norm = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/[.]/g,"").replace(/,+/g,"").replace(/\s+/g," ").trim();

const toMap = (obj) => {
  const m = new Map();
  if (obj?.players && typeof obj.players === "object") {
    for (const [k,v] of Object.entries(obj.players)) m.set(norm(k), v);
  } else if (obj && typeof obj === "object") {
    for (const [k,v] of Object.entries(obj)) m.set(norm(k), v);
  }
  return m;
};

const baseUrl = (evt) => (process.env.URL ? process.env.URL : (evt?.headers?.host ? `https://${evt.headers.host}` : ""));

async function loadSnapshotFromBlobs(store, tried){
  for (const key of SNAPSHOT_KEYS){
    try{ const raw = await store.get(key); if(raw) return { source:"blobs", key, map: toMap(JSON.parse(raw)) }; tried.push({ where:"blobs", key, ok:false }); }
    catch(e){ tried.push({ where:"blobs", key, ok:false, error:String(e) }) }
  }
  return null;
}

async function loadSnapshotFromFunction(evt, tried){
  try{
    const r = await fetch(baseUrl(evt)+"/.netlify/functions/odds-get");
    const j = await r.json();
    if (j && typeof j === "object") return { source:"odds-get", key:"func", map: toMap(j) };
    tried.push({ where:"odds-get", ok:false, body:j });
  }catch(e){
    tried.push({ where:"odds-get", ok:false, error:String(e) });
  }
  return null;
}

export const handler = async (event) => {
  const date = event?.queryStringParameters?.date;
  if (!isDate(date)) return json({ ok:false, error:"missing or invalid ?date=YYYY-MM-DD" }, 400);
  const tried = [];
  try{
    const store = dualGetStore(getStore);
    let src = await loadSnapshotFromBlobs(store, tried);
    if (!src) src = await loadSnapshotFromFunction(event, tried);
    if (!src) return json({ ok:false, error:"no odds snapshot available (blobs+functions failed)", tried }, 503);

    const players = Array.from(src.map.keys());
    const rec = {
      date,
      captured_at: new Date().toISOString(),
      source: src.source,
      snapshot_key: src.key,
      players: players.length,
      sample_keys: players.slice(0, 50)
    };

    await store.setJSON(`learn/mlb/${date}.json`, rec, { metadata: { contentType: "application/json" } });

    const sumKey = "learn/mlb/summary.json";
    const raw = await store.get(sumKey);
    let summary = raw ? JSON.parse(raw) : { days:0, samples:0, last_run:null, dates:[] };
    if (!summary.dates.includes(date)) summary.dates.push(date);
    summary.days = summary.dates.length;
    summary.samples = (summary.samples || 0) + rec.players;
    summary.last_run = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    await store.setJSON(sumKey, summary, { metadata: { contentType: "application/json" } });

    return json({ ok:true, date, saved:`learn/mlb/${date}.json`, counted_players: rec.players, summary, tried });
  }catch(e){
    return json({ ok:false, error:String(e), hint:"Ensure NETLIFY_SITE_ID/SITE_ID and NETLIFY_BLOBS_TOKEN/NETLIFY_API_TOKEN are set if ambient creds are unavailable.", tried }, 500);
  }
};
