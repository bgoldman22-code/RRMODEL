// netlify/functions/odds-diagnostics.js
// Reports whether theodds snapshot is present + quick provider sanity.
const { getStore } = require('@netlify/blobs');
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
    const latest = await store.get('latest.json');
    const env_present = !!process.env.THEODDS_API_KEY;
    const provider = (process.env.PROVIDER||'').toLowerCase() || 'theoddsapi';
    let has_hr_market=false, events_count=0, sample_hr_outcomes=0;
    if (latest){
      const j = JSON.parse(latest);
      has_hr_market = (j.market || '').toLowerCase() === String(process.env.PROP_MARKET_KEY||'batter_home_runs').toLowerCase();
      events_count = Array.isArray(j.events) ? j.events.length : (j.events || 0);
      const players = j.players ? Object.keys(j.players).length : 0;
      sample_hr_outcomes = players;
    }
    return { statusCode: 200, body: JSON.stringify({ ok:true, provider, env_present, has_hr_market, events_count, sample_hr_outcomes }) };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
