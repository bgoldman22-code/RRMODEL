import { createStore } from "./_blobs.mjs";

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  try {
    const type = event.queryStringParameters?.type || "schedule";
    const store = createStore();

    if (type === "schedule") {
      const json = await store.getJSON("weeks/2025/1/schedule.json");
      if (!json) return resp(404, { ok: false, error: "no data" });
      return resp(200, { ok: true, data: json });
    }

    return resp(400, { ok: false, error: "unknown type" });
  } catch (err) {
    return resp(err?.statusCode || 500, { ok: false, error: err?.message || "unhandled error" });
  }
};
