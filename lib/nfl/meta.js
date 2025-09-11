// lib/nfl/meta.js
const { readMeta } = require("./model");
const { readLatest } = require("./score");

async function getMeta() {
  const meta = await readMeta();
  const latest = await readLatest();
  return { ok: true, meta, snapshotRows: latest?.rows?.length || 0, updated: new Date().toISOString() };
}

module.exports = { getMeta };
