// netlify/functions/odds-source-diagnose.mjs
// Quick probe to see what sources are reachable right now.
import { getStore } from "@netlify/blobs";

const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const CANDIDATE_KEYS = [
  process.env.ODDS_SNAPSHOT_KEY || "latest.json",
  "odds_latest.json",
  "hr_latest.json",
  "odds_batter_home_runs.json"
];

function baseUrl(event) {
  const cfg = process.env.ODDS_INTERNAL_URL;
  if (cfg) return cfg.endsWith("/") ? cfg.slice(0,-1) : cfg;
  const host = event?.headers?.["x-forwarded-host"] || event?.headers?.host || "localhost";
  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
async function httpJson(url) {
  const res = await fetch(url);
  let data=null, raw=null;
  try { data = await res.json(); } catch(e) { raw = await res.text(); }
  return { url, status: res.status, ok: res.ok, data, raw };
}
export const handler = async (event) => {
  const tried = [];
  // Blobs keys
  try {
    const store = getStore(STORE_NAME);
    for (const key of CANDIDATE_KEYS) {
      try {
        const blob = await store.get(key);
        tried.push({ where:"blobs", key, ok: !!blob, bytes: blob ? blob.length : 0 });
      } catch (e) {
        tried.push({ where:"blobs", key, ok:false, error:String(e) });
      }
    }
  } catch (e) {
    tried.push({ where:"blobs", ok:false, error:String(e) });
  }
  const base = baseUrl(event);
  // Functions
  for (const path of ["/.netlify/functions/odds-get", "/.netlify/functions/odds-refresh-rapid?quick=1"]) {
    try {
      const r = await httpJson(`${base}${path}`);
      tried.push({ where:"func", path, status: r.status, ok: r.ok, keys: r.data ? Object.keys(r.data).slice(0,5) : [] });
    } catch (e) {
      tried.push({ where:"func", path, ok:false, error:String(e) });
    }
  }
  return {
    statusCode: 200,
    headers: { "content-type":"application/json","cache-control":"no-store" },
    body: JSON.stringify({ ok:true, store: STORE_NAME, tried })
  };
};
