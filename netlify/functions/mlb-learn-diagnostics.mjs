// netlify/functions/mlb-learn-diagnostics.mjs
import { getStore } from "@netlify/blobs";
function dualGetStore(getStore){
  const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
  // First try ambient Netlify runtime
  try {
    const s = getStore({ name: STORE });
    return s;
  } catch(e) {
    // Fallback to explicit credentials if provided
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (!siteID || !token) {
      throw new Error("Netlify Blobs not configured: need NETLIFY_SITE_ID/SITE_ID and NETLIFY_BLOBS_TOKEN/NETLIFY_API_TOKEN");
    }
    return getStore({ name: STORE, siteID, token });
  }
}

const json = (b, code=200) => ({ statusCode: code, headers: { "content-type":"application/json" }, body: JSON.stringify(b) });

export const handler = async () => {
  try{
    const store = dualGetStore(getStore);
    const keys = ["learn/mlb/summary.json", process.env.ODDS_SNAPSHOT_KEY || "latest.json"];
    const probe = {};
    for (const k of keys){
      try{ const raw = await store.get(k); probe[k] = raw ? "ok" : "missing"; }catch(e){ probe[k] = "error: "+String(e); }
    }
    return json({ ok:true, probe });
  }catch(e){
    return json({ ok:false, error:String(e), hint:"Set NETLIFY_SITE_ID/SITE_ID and NETLIFY_BLOBS_TOKEN/NETLIFY_API_TOKEN if ambient creds not present." }, 500);
  }
};
