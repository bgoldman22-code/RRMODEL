// netlify/functions/odds-diagnostics.js (CommonJS)
const { getStore } = require("@netlify/blobs");
function initStore(){
  const name = process.env.BLOBS_STORE || "mlb-odds";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}
exports.handler = async () => {
  try {
    const store = initStore();
    const latest = await store.get("latest.json");
    const base = { ok:true, env_present: !!process.env.THEODDS_API_KEY, provider:(process.env.PROVIDER||"theoddsapi").toLowerCase(), has_hr_market:false, events_count:0, sample_hr_outcomes:0 };

    if (latest){
      try{
        const j = JSON.parse(latest);
        base.has_hr_market = !!j.market;
        base.events_count = j.events || 0;
        base.sample_hr_outcomes = j.players ? Object.keys(j.players).length : 0;
        return { statusCode: 200, body: JSON.stringify(base) };
      }catch{ /* fallthrough */ }
    }

    // Probe upstream if snapshot empty
    const key = process.env.THEODDS_API_KEY;
    if (!key) return { statusCode: 200, body: JSON.stringify(base) };
    const sport   = process.env.ODDSAPI_SPORT_KEY || "baseball_mlb";
    const regions = String(process.env.ODDSAPI_REGION || "us,us2").split(",").map(s=>s.trim()).filter(Boolean);
    const market  = process.env.PROP_MARKET_KEY || "batter_home_runs";

    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${encodeURIComponent(regions.join(","))}&dateFormat=iso&apiKey=${key}`;
    const er = await fetch(eventsUrl);
    if (!er.ok) return { statusCode: 200, body: JSON.stringify({ ...base, probe:{ step:"events", status: er.status } }) };
    const events = await er.json();
    const pick = Array.isArray(events) ? events.slice(0,4) : [];
    let marketsSeen = 0, outcomesSeen = 0;

    for (const ev of pick){
      const id = String(ev?.id||ev?.event_id||ev?.eventId||"");
      if (!id) continue;
      const oUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${id}/odds?regions=${encodeURIComponent(regions.join(","))}&markets=${encodeURIComponent(market)}&oddsFormat=american&dateFormat=iso&apiKey=${key}`;
      const orr = await fetch(oUrl);
      if (!orr.ok) continue;
      const data = await orr.json();
      const bms = Array.isArray(data?.bookmakers) ? data.bookmakers : [];
      for (const bm of bms){
        const mkts = bm?.markets || [];
        for (const mk of mkts){
          const k = (mk?.key||mk?.market||mk?.name);
          if (k!==market) continue;
          marketsSeen++;
          const outs = mk?.outcomes || [];
          outcomesSeen += outs.length;
        }
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ...base, probe:{ market, events_scanned: pick.length, markets_seen: marketsSeen, outcomes_seen: outcomesSeen } }) };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
