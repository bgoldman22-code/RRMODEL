// netlify/functions/_lib/learn-receipt.mjs
import { getStore } from "@netlify/blobs";

export async function writeReceipt({
  dateEt, startedAt, finishedAt, games, samples,
  factors, calibration, deltas, version, commit, warnings = []
}) {
  const store = getStore({ name: "rrmodel" });
  const key = `mlb/learn_receipts/${dateEt}.json`;
  const body = {
    date_et: dateEt,
    started_at: startedAt,
    finished_at: finishedAt,
    games, samples, factors, calibration, deltas,
    version, commit, warnings, ok: true
  };
  await store.set(key, JSON.stringify(body), { contentType: "application/json" });
  return { key };
}

export async function readLatestReceipt() {
  const store = getStore({ name: "rrmodel" });
  const list = await store.list({ prefix: "mlb/learn_receipts/", limit: 1000 });
  const files = (list?.blobs || []).filter(b => b.key.endsWith(".json"));
  if (!files.length) return null;
  files.sort((a, b) => a.key < b.key ? 1 : -1);
  const latestKey = files[0].key;
  const json = await store.get(latestKey, { type: "json" });
  return { key: latestKey, receipt: json };
}
