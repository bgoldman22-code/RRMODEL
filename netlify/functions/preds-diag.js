// netlify/functions/preds-diag.js
const { getStore } = require('@netlify/blobs');
export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const date = (params.date || '').trim();
    const store = getStore('mlb-logs');
    const keys = [
      `predictions-with-ctx/${date}.json`,
      `predictions/${date}.json`,
    ];
    const out = [];
    for (const k of keys){
      const v = await store.get(k);
      out.push({ key: k, exists: !!v, size: v ? v.length : 0, head: v ? v.slice(0, 200) : null });
    }
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, date, results: out }) };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
