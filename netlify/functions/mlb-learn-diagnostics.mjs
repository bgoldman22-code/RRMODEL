// netlify/functions/mlb-learn-diagnostics.mjs
// Quick check to ensure this function context can access Netlify Blobs.
import { getStore } from "@netlify/blobs";

const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
const json = (b, code=200) => ({ statusCode: code, headers: { "content-type":"application/json" }, body: JSON.stringify(b) });

export const handler = async () => {
  try{
    const store = getStore({ name: STORE });
    // light probe read
    const keys = ["learn/mlb/summary.json", process.env.ODDS_SNAPSHOT_KEY || "latest.json"];
    const probe = {};
    for (const k of keys){
      try{
        const raw = await store.get(k);
        probe[k] = raw ? "ok" : "missing";
      }catch(e){
        probe[k] = "error: " + String(e);
      }
    }
    return json({ ok:true, store: STORE, probe });
  }catch(e){
    return json({ ok:false, error:String(e) });
  }
};
