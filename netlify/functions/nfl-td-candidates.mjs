import { getNFLStore } from "./_blobs.js";

export const handler = async (event) => {
  try {
    const store = getNFLStore();
    const schedKey = "weeks/2025/1/schedule.json";
    const depthKey = "weeks/2025/1/depth/21.json"; // sample key just to sanity check presence

    const schedule = await store.get(schedKey, { type: "json" }).catch(() => null);
    const depth = await store.get(depthKey, { type: "json" }).catch(() => null);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        diag: {
          store: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "site:nfl-td",
          hasSchedule: !!schedule,
          hasDepthSample: !!depth,
          schedKey,
          depthKey,
        },
        candidates: [],
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(e),
        blobs: e?.cause?.diag || null,
      }),
    };
  }
};
