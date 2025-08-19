
// netlify/functions/props-diagnostics.mjs
import { getBlobsStore } from "./_blobs.js";
export const handler = async () => {
  const store = getBlobsStore();
  const out = { ok:true, snapshots:{} };
  for (const key of ["props/latest_tb.json","props/latest_hrrbi.json"]){
    try{
      const data = await store.getJSON(key);
      out.snapshots[key] = data ? { count: Object.keys(data).length } : "missing";
    }catch(e){ out.snapshots[key] = String(e); }
  }
  return { statusCode:200, headers:{"content-type":"application/json"}, body: JSON.stringify(out)};
};
