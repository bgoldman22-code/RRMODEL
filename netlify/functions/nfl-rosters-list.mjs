import { getEnv } from "./_env.mjs";
import { getBlobsStoreSafe } from "./_blobs.mjs";

export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.rawQuery || event.queryStringParameters || "");
    const noblobs = (qs.get("noblobs") === "1" || qs.get("noblobs") === "true");
    const env = getEnv();
    const { store } = await getBlobsStoreSafe(env.NFL_STORE_NAME, { noblobs });
    if (!store) {
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, keys: { blobs: [], directories: [] } }) };
    }
    const keys = await store.list();
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, keys }) };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
