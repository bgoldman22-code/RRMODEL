// Minimal bootstrap that verifies Blobs access and echoes schedule status.
// (Leaves your existing fetching + caching logic untouched in other functions.)
import { getNFLStore } from "./_blobs.js";

export const handler = async (event) => {
  try {
    const store = getNFLStore();

    // Probe existing cached schedule for week 1/2025
    const key = "weeks/2025/1/schedule.json";
    const existing = await store.get(key, { type: "json" }).catch(() => null);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        store: (process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "site:nfl-td"),
        hasSchedule: !!existing,
        sampleKey: key,
        now: new Date().toISOString(),
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
