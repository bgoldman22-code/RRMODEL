// netlify/functions/mlb-learn-summary.mjs
import { getStore } from "@netlify/blobs";
const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
const json = (b, code=200) => ({ statusCode: code, headers: { "content-type":"application/json" }, body: JSON.stringify(b) });

export const handler = async () => {
  try{
    const store = getStore({ name: STORE });
    const raw = await store.get("learn/mlb/summary.json");
    if (!raw) return json({ ok:false, error:"no summary yet" }, 404);
    return json({ ok:true, summary: JSON.parse(raw) });
  }catch(e){
    return json({ ok:false, error:String(e) }, 500);
  }
};
