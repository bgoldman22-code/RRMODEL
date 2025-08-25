
// netlify/functions/nfl-rosters-list.mjs
export const config = { path: "/.netlify/functions/nfl-rosters-list" };
import { getStoreOrNull, listKeys } from "./_lib/blobs-optional.mjs";

function jsonResponse(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function handler(event) {
  const url = new URL(event.rawUrl || `https://x/?${event.rawQuery}`);
  const debug = url.searchParams.get("debug") !== null;
  const noblobs = url.searchParams.get("noblobs") === "1";

  if (noblobs) {
    return jsonResponse({ ok: true, keys: { blobs: [], directories: [] }, diag: { blobs: "skipped" } });
  }
  const store = await getStoreOrNull(["BLOBS_STORE_NFL"]);
  if (!store) {
    return jsonResponse({ ok: true, keys: { blobs: [], directories: [] }, diag: { blobs: "unavailable" } });
  }
  const keys = await listKeys(store, "weeks/2025/1/");
  return jsonResponse({ ok: true, keys });
}
