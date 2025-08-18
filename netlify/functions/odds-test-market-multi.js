// netlify/functions/odds-test-market-multi.js
// Probe market across regions; confirms data exists before refresh.
exports.handler = async (event) => {
  const apiKey = process.env.THEODDS_API_KEY;
  if (!apiKey) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing THEODDS_API_KEY' }) };
  const sport  = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
  const regions = String(process.env.ODDSAPI_REGION || 'us').split(',').map(s=>s.trim()).filter(Boolean);
  const market = (event.queryStringParameters?.market || 'batter_home_runs').trim();
  const limit  = Math.max(1, Math.min(20, parseInt(event.queryStringParameters?.limit || '8', 10)));

  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${encodeURIComponent(regions.join(','))}&dateFormat=iso&apiKey=${apiKey}`;
  const er = await fetch(eventsUrl);
  if (!er.ok) return { statusCode: er.status, body: JSON.stringify({ ok:false, step:'events', status: er.status }) };
  const events = await er.json();
  const picked = Array.isArray(events) ? events.slice(0, limit) : [];

  let marketsSeen = 0, outcomesSeen = 0;
  const sample = [];
  for (const ev of picked){
    const id = ev && (ev.id || ev.event_id || ev.eventId);
    if (!id) continue;
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${id}/odds?regions=${encodeURIComponent(regions.join(','))}&markets=${encodeURIComponent(market)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
    const orr = await fetch(oddsUrl);
    if (!orr.ok) continue;
    const data = await orr.json();
    const bms = Array.isArray(data?.bookmakers) ? data.bookmakers : [];
    for (const bm of bms){
      const mkts = bm?.markets || [];
      for (const mk of mkts){
        if ((mk.key || mk.market || mk.name) !== market) continue;
        marketsSeen++;
        const outs = mk?.outcomes || [];
        outcomesSeen += outs.length;
        sample.push({
          event_id: id,
          book: (bm.key || bm.title || '').toLowerCase(),
          count_outcomes: outs.length,
          sample_labels: outs.slice(0,5).map(o => o.name || o.description || o.participant || o.title)
        });
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok:true, market, regions, events_scanned: picked.length, markets_seen: marketsSeen, outcomes_seen: outcomesSeen, sample }) };
};
