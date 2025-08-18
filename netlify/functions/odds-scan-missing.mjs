// netlify/functions/odds-scan-missing.mjs
import { getStore } from "@netlify/blobs";

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

async function getSnapshot(store) {
  for (const key of CANDIDATE_KEYS) {
    try {
      const blob = await store.get(key);
      if (blob) return { key, json: JSON.parse(blob) };
    } catch {}
  }
  return { key: null, json: null };
}

function buildIndex(odds) {
  const map = new Map();
  if (odds.players && typeof odds.players === "object") {
    for (const [k,v] of Object.entries(odds.players)) map.set(normName(k), v);
  } else {
    for (const [k,v] of Object.entries(odds)) map.set(normName(k), v);
  }
  return map;
}

export const handler = async (event) => {
  try {
    const store = getStore({ name: STORE_NAME });
    const snap = await getSnapshot(store);
    if (!snap.json) {
      return json({ ok:false, error:"no odds snapshot found", tried: CANDIDATE_KEYS });
    }

    let names = [];
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      names = Array.isArray(body.names) ? body.names : [];
    } else {
      const qp = event?.queryStringParameters || {};
      if (qp.names) names = qp.names.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!names.length) {
      return json({ ok:false, error:"provide names via POST {names:[...]} or ?names=a,b,c" });
    }

    const idx = buildIndex(snap.json);
    const missing = [];
    const found = [];
    for (const name of names) {
      const k = normName(name);
      if (idx.has(k)) {
        found.push({ name, key:k, sample: idx.get(k) });
      } else {
        missing.push({ name, key:k, diagnosis:"No exact match in snapshot (check name formatting or coverage)" });
      }
    }

    return json({
      ok: true,
      snapshot_key: snap.key,
      counts: { provided: names.length, found: found.length, missing: missing.length },
      missing,
      found_sample: found.slice(0, 10)
    });
  } catch (e) {
    return json({ ok:false, error:String(e) });
  }
};

function json(body) {
  return {
    statusCode: 200,
    headers: { "content-type":"application/json", "cache-control":"no-store" },
    body: JSON.stringify(body)
  };
}
