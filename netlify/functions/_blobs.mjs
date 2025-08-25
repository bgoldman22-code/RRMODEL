import { getStore } from "@netlify/blobs";

export function createStore(name = process.env.BLOBS_STORE || "rr-nfl") {
  try {
    return getStore({ name });
  } catch (err) {
    const e = new Error(
      `Blobs unavailable. Enable Netlify Blobs for this site and set BLOBS_STORE. Detail: ${err?.name || ""} ${err?.message || ""}`.trim()
    );
    e.statusCode = 500;
    throw e;
  }
}
