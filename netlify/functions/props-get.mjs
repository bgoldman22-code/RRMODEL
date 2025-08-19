
// netlify/functions/props-get.mjs
import { getBlobsStore } from "./_blobs.js";
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/[.]/g,"").replace(/,+/g,"").replace(/\s+/g," ").trim();}
export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const market = (q.market || "tb").toLowerCase();
  const key = market === "hrrbi" ? "props/latest_hrrbi.json" : "props/latest_tb.json";
  const store = getBlobsStore();
  try{
    const data = await store.getJSON(key);
    if (!data) return json(404, { ok:false, error:"no snapshot", market });
    if (q.name){
      const k = norm(q.name);
      return json(200, { ok:true, market, name:q.name, key:k, rec:data[k]||null });
    }
    return json(200, { ok:true, market, count:Object.keys(data).length });
  }catch(e){ return json(500, { ok:false, error:String(e) }); }
};
function json(code, obj){ return { statusCode: code, headers: { "content-type":"application/json" }, body: JSON.stringify(obj) } }
