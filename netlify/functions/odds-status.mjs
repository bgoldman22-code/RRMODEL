/**
 * odds-status — small status endpoint that touches blobs store
 */
import { makeStore } from "./_lib/blobs-helper.mjs";

export async function handler() {
  try {
    const s = makeStore();
    const pongKey = "odds_status_pong.txt";
    await s.set(pongKey, `pong ${new Date().toISOString()}`, { contentType: "text/plain" });
    return { statusCode: 200, body: JSON.stringify({ ok:true, store: "ok", wrote: pongKey }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: e.message }) };
  }
}
export default { handler };