import { createStore } from "./_blobs.mjs";

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async () => {
  try {
    const store = createStore();
    const list = await store.list();
    return resp(200, { ok: true, keys: list });
  } catch (err) {
    return resp(err?.statusCode || 500, { ok: false, error: err?.message || "unhandled error" });
  }
};
