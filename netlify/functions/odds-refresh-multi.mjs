import { getStore } from "@netlify/blobs";

export async function handler(event, context) {
  try {
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = getStore(storeName);

    // For now, just test writing a timestamp so we know it runs
    const key = `refresh-${Date.now()}.json`;
    const data = { ok: true, refreshed: new Date().toISOString() };

    await store.setJSON(key, data);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Refresh complete", key, store: storeName })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
}
