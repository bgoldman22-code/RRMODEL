import { getEnv } from "./_env.mjs";
import { getBlobsStoreSafe } from "./_blobs.mjs";

export const handler = async (event) => {
  const q = Object.fromEntries(new URLSearchParams(event.rawQuery || event.queryStringParameters || ""));
  const noblobs = q.noblobs === "1" || q.noblobs === "true";
  const env = getEnv();
  const res = await getBlobsStoreSafe(env.NFL_STORE_NAME, { noblobs });
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      NFL_STORE_NAME: env.NFL_STORE_NAME,
      blobs: {
        available: !!res.store,
        context: res.context
      }
    })
  };
};
