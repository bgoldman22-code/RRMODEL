// Ensure we import existing openStore symbol from blobs-helper (exported above)
import { openStore } from "./_lib/blobs-helper.mjs";

export async function handler() {
  const store = await openStore("BLOBS_STORE_NFL");
  const stamp = new Date().toISOString();
  await store.set("rosters-run-heartbeat.txt", stamp, { contentType: "text/plain" });
  return new Response(JSON.stringify({ ok:true, updated: stamp }), { headers:{ "content-type":"application/json" } });
}

export const config = { path: "/.netlify/functions/nfl-rosters-run" };
