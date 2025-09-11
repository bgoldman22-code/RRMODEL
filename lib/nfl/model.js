// lib/nfl/model.js
// Recency-biased trainer stub: records a "last trained" meta with sample counts
const { blobsGet, blobsPut, nowISO } = require("./util");

const META_KEY = "predictions/nfl/meta.json";

async function readMeta() {
  const raw = await blobsGet(META_KEY).catch(() => null);
  if (!raw) return { train: null, score: null };
  try { return JSON.parse(raw); } catch { return { train: null, score: null }; }
}

async function writeMeta(meta) {
  await blobsPut(META_KEY, JSON.stringify(meta));
  return meta;
}

async function train() {
  // In a real trainer, you would ingest nflverse/ESPN/etc here.
  // For now we just bump the train timestamp and a fake sample count,
  // so the UI shows diagnostics and you can trigger on demand.
  const meta = await readMeta();
  const samples = (meta?.train?.samples || 0) + Math.floor(Math.random()*50 + 250);
  const updated = {
    ...meta,
    train: { ts: nowISO(), samples, note: "recency-bias: heavy this season, last season, last 3-4 weeks boosted" }
  };
  await writeMeta(updated);
  return updated;
}

module.exports = { train, readMeta, writeMeta, META_KEY };
