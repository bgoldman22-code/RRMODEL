// netlify/functions/mlb-learn.mjs
// Minimal backfill-by-date that does NOT touch your pages.
// It writes learn/mlb/{date}.json and updates learn/mlb/summary.json in Netlify Blobs.
// It loads odds snapshot from Blobs or falls back to /.netlify/functions/odds-get.

import { getStore } from "@netlify/blobs";

const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
const SNAPSHOT_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

const normDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s||"") ? s : null;

const json = (b) => ({ statusCode: 200, headers: { "content-type":"application/json", "cache-control":"no-store" }, body: JSON.stringify(b) });

const toMap = (obj) => {
  const m = new Map();
  if (obj?.players && typeof obj.players === "object") {
    for (const [k,v] of Object.entries(obj.players)) m.set(k, v);
  } else if (obj && typeof obj === "object") {
    for (const [k,v] of Object.entries(obj)) m.set(k, v);
  }
  return m;
};

const baseUrl = (evt) => {
  const h = evt?.headers?.host;
  if (process.env.URL) return process.env.URL;
  return h ? `https://${h}` : "";
};

async function loadSnapshotFromBlobs(store, tried) {
  for (const key of SNAPSHOT_KEYS) {
    try {
      const raw = await store.get(key);
      if (raw) return { source:"blobs", key, map: toMap(JSON.parse(raw)) };
      tried.push({ where:"blobs", key, ok:false });
    } catch(e) {
      tried.push({ where:"blobs", key, ok:false, error:String(e) });
    }
  }
  return null;
}

async function loadSnapshotFromFunction(evt, tried) {
  try {
    const r = await fetch(baseUrl(evt)+"/.netlify/functions/odds-get");
    const j = await r.json();
    if (j && typeof j === "object") return { source:"odds-get", key:"func", map: toMap(j) };
    tried.push({ where:"odds-get", ok:false, body:j });
  } catch(e) {
    tried.push({ where:"odds-get", ok:false, error:String(e) });
  }
  return null;
}

export const handler = async (event) => {
  const qp = event?.queryStringParameters || {};
  const date = normDate(qp.date);
  if (!date) return json({ ok:false, error:"missing or invalid ?date=YYYY-MM-DD" });

  const tried = [];
  try {
    const store = getStore({ name: STORE });
    let src = await loadSnapshotFromBlobs(store, tried);
    if (!src) src = await loadSnapshotFromFunction(event, tried);
    if (!src) return json({ ok:false, error:"no snapshot available (blobs+functions failed)", tried });

    const players = Array.from(src.map.keys());
    const rec = {
      date,
      captured_at: new Date().toISOString(),
      source: src.source,
      snapshot_key: src.key,
      players: players.length,
      sample_keys: players.slice(0, 50)
    };

    await store.setJSON(`learn/mlb/${date}.json`, rec, { metadata: { contentType: "application/json" }});

    const sumKey = "learn/mlb/summary.json";
    const raw = await store.get(sumKey);
    let summary = raw ? JSON.parse(raw) : { days:0, samples:0, last_run:null, dates:[] };
    if (!summary.dates.includes(date)) summary.dates.push(date);
    summary.days = summary.dates.length;
    summary.samples = (summary.samples || 0) + rec.players;
    summary.last_run = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

    await store.setJSON(sumKey, summary, { metadata: { contentType: "application/json" }});

    return json({ ok:true, date, saved:`learn/mlb/${date}.json`, counted_players: rec.players, summary, tried });
  } catch(e) {
    return json({ ok:false, error:String(e), tried });
  }
};
