// netlify/functions/nfl-rosters-list.mjs
import { maybeGetStore, parseQuery } from "./_blobs.mjs";

export const handler = async (event) => {
  const q = parseQuery(event);
  const store = await maybeGetStore(event, { fallbackName: "nfl-td" });
  if (!store) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, keys: { blobs: [], directories: [] }, note: "blobs disabled or unavailable" })
    };
  }
  try {
    const list = await store.list();
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, keys: list })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
