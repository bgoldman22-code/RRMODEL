
import { getStore } from "@netlify/blobs";
export default async function handler(req) {
  try {
    const store = getStore({ name: process.env.NFL_TD_BLOBS || "nfl-td" });
    const keys = await store.list();
    return new Response(JSON.stringify({ ok:true, keys }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers: { "content-type":"application/json" } });
  }
}
