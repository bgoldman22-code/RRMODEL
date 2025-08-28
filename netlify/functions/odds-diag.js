// netlify/functions/odds-diag.js
const { getStore } = require('./_blobs.js');
function initStore(){
  const name = process.env.BLOBS_STORE || 'mlb-odds';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}
exports.handler = async () => {
  try {
    const store = initStore();
    let keys = [];
    try { keys = await store.list(); } catch (_) {}
    const latest = await store.get('latest.json');
    return {
      statusCode: 200,
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({
        ok: true,
        store: process.env.BLOBS_STORE || 'mlb-odds',
        siteBound: !!process.env.NETLIFY_SITE_ID,
        latestExists: !!latest,
        latestPreview: latest ? latest.slice(0, 200) : null,
        keys
      })
    };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
