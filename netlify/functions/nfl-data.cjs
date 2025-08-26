// netlify/functions/nfl-data.cjs
// Returns the latest NFL TD data files. Prefers Netlify Blobs; falls back to repo /data.
const { getStore } = require("@netlify/blobs");
const fs = require("fs");
const path = require("path");
const STORE = process.env.NFL_TD_BLOBS || "nfl-td";

async function readBlob(store, key) {
  try {
    const r = await store.get(key);
    if (!r) return null;
    const txt = await r.text();
    return JSON.parse(txt);
  } catch (_) { return null; }
}
function readRepo(rel) {
  try {
    const p = path.join(process.cwd(), "data", "nfl-td", rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {}
  return null;
}

module.exports.handler = async () => {
  const store = getStore(STORE);
  const keys = [
    "depth-charts.json",
    "pbp-aggregates-2022-2024.json",
    "team-tendencies.json",
    "opponent-defense.json",
    "player-explosive.json",
    "calibration.json",
    // NEW: roster meta so UI can show status
    "meta-rosters.json"
  ];
  const out = {};
  for (const k of keys) {
    out[k] = await readBlob(store, k) ?? readRepo(k);
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, data: out }) };
};
