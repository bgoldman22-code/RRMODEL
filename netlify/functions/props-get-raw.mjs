
// netlify/functions/props-get-raw.mjs
import { getBlobsStore } from "./_blobs.js";
export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const market = (q.market || "tb").toLowerCase();
  const key = market === "hrrbi" ? "props/latest_hrrbi.json" : "props/latest_tb.json";
  const store = getBlobsStore();
  try{
    const map = await store.getJSON(key);
    return { statusCode:200, headers:{"content-type":"application/json"}, body: JSON.stringify({ ok:true, market, map })};
  }catch(e){
    return { statusCode:500, headers:{"content-type":"application/json"}, body: JSON.stringify({ ok:false, error:String(e) })};
  }
};
