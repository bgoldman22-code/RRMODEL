// Wrapper endpoint that fetches your existing mlb-preds-get output,
// applies Weather + BvP, and returns adjusted rows under the same shape.
import { applyExtensions } from "./_lib/extensions-apply.mjs";

function baseUrl(){
  // Prefer Netlify-provided URLs
  return process.env.URL || process.env.DEPLOY_PRIME_URL || "";
}

export const handler = async (event) => {
  try{
    const qs = event.queryStringParameters || {};
    const query = new URLSearchParams(qs).toString();
    const url = `${baseUrl()}/.netlify/functions/mlb-preds-get${query ? `?${query}` : ""}`;

    const r = await fetch(url, { headers: { "accept":"application/json" } });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();

    if (!data || !Array.isArray(data.items)) return { statusCode: 200, body: JSON.stringify(data) };

    const items = await Promise.all(data.items.map(async row => {
      const ext = await applyExtensions({ row, context: {} });
      if (ext?.prob){
        row.p_model = ext.prob;
        row.meta = { ...(row.meta||{}), ...(ext.meta||{}) };
      }
      return row;
    }));

    return { statusCode: 200, body: JSON.stringify({ ...data, items }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
