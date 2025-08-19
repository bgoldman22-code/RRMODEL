// netlify/functions/mlb-learn.mjs
// Backfill one date into learning store using Netlify Blobs (same style as your odds functions).
// Usage: /.netlify/functions/mlb-learn?date=YYYY-MM-DD
import { getStore } from "@netlify/blobs";

const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
const SNAPSHOT_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

const json = (b, code=200) => ({ statusCode: code, headers: { "content-type":"application/json", "cache-control":"no-store" }, body: JSON.stringify(b) });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s||"");
const norm = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/[.]/g,"").replace(/,+/g,"").replace(/\s+/g," ").trim();

function baseUrl(evt){
  const h = evt?.headers?.host;
  if (process.env.URL) return process.env.URL;
  return h ? `https://${h}` : "";
}

function toMap(obj){
  const m = new Map();
  if (obj?.players && typeof obj.players === "object"){
    for (const [k,v] of Object.entries(obj.players)) m.set(norm(k), v);
  } else if (obj && typeof obj === "object"){
    for (const [k,v] of Object.entries(obj)) m.set(norm(k), v);
  }
  return m;
}

async function loadSnapshotFromBlobs(store, tried){
  for (const key of SNAPSHOT_KEYS){
    try{
      const raw = await store.get(key);
      if (raw){
        const json = JSON.parse(raw);
        return { source:"blobs", key, map: toMap(json) };
      }
      tried.push({ where:"blobs", key, ok:false });
    }catch(e){
      tried.push({ where:"blobs", key, ok:false, error:String(e) });
    }
  }
  return null;
}

async function loadSnapshotFromFunction(evt, tried){
  try{
    const r = await fetch(baseUrl(evt)+"/.netlify/functions/odds-get");
    const j = await r.json();
    if (j && typeof j === "object"){
      return { source:"odds-get", key:"func", map: toMap(j) };
    }
    tried.push({ where:"odds-get", ok:false, body:j });
  }catch(e){
    tried.push({ where:"odds-get", ok:false, error:String(e) });
  }
  return null;
}

export const handler = async (event) => {
  const tried = [];
  const date = (event?.queryStringParameters?.date)||"";
  if (!isDate(date)) return json({ ok:false, error:"missing or invalid ?date=YYYY-MM-DD" }, 400);

  try{
    const store = getStore({ name: STORE }); // <-- no manual siteID/token
    let src = await loadSnapshotFromBlobs(store, tried);
    if (!src) src = await loadSnapshotFromFunction(event, tried);
    if (!src) return json({ ok:false, error:"no odds snapshot available (blobs+functions failed)", tried }, 503);

    const players = Array.from(src.map.keys());
    const record = {
      date,
      captured_at: new Date().toISOString(),
      source: src.source,
      snapshot_key: src.key,
      players: players.length,
      sample_keys: players.slice(0, 50),
    };

    await store.setJSON(`learn/mlb/${date}.json`, record, { metadata: { contentType: "application/json" }});

    // Summary maintenance
    const sumKey = "learn/mlb/summary.json";
    const raw = await store.get(sumKey);
    let summary = raw ? JSON.parse(raw) : { days:0, samples:0, last_run:null, dates:[] };
    if (!summary.dates.includes(date)) summary.dates.push(date);
    summary.days = summary.dates.length;
    summary.samples = (summary.samples || 0) + record.players;
    summary.last_run = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

    await store.setJSON(sumKey, summary, { metadata: { contentType: "application/json" }});

    return json({ ok:true, date, saved:`learn/mlb/${date}.json`, counted_players: record.players, summary, tried });
  }catch(e){
    return json({ ok:false, error:String(e), tried });
  }
};
