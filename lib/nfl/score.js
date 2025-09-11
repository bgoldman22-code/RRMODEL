// lib/nfl/score.js
// Scores on demand by pulling your existing GET endpoint and noting "last score" meta
const { blobsGet, blobsPut, nowISO } = require("./util");
const { readMeta, writeMeta } = require("./model");

const LATEST_KEY = "predictions/nfl/latest.json";

async function score(baseUrl) {
  // Pull your live predictions list (already built from odds)
  const res = await fetch(`${baseUrl}/.netlify/functions/nfl-predictions-get`);
  if (!res.ok) throw new Error(`score fetch get -> ${res.status}`);
  const data = await res.json();
  // Save a copy (optional) for provenance
  await blobsPut(LATEST_KEY, JSON.stringify(data));
  const meta = await readMeta();
  const updated = { ...meta, score: { ts: nowISO(), rows: data?.rows?.length || 0 } };
  await writeMeta(updated);
  return { data, meta: updated };
}

async function readLatest() {
  const raw = await blobsGet(LATEST_KEY).catch(() => null);
  return raw ? JSON.parse(raw) : null;
}

module.exports = { score, readLatest, LATEST_KEY };
