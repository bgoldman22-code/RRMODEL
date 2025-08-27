// netlify/functions/odds-test-market.js (CommonJS)
// Usage: /.netlify/functions/odds-test-market?market=player_home_runs&limit=8
// Env: THEODDS_API_KEY, ODDSAPI_SPORT_KEY (default baseball_mlb), ODDSAPI_REGION (default us)

async function withTimeoutFetch(url, opts, ms=5000){
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e){
    clearTimeout(id);
    throw e;
  }
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
  if (!apiKey){
    return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing THEODDS_API_KEY' }) };
  }
  const sport  = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
  const region = process.env.ODDSAPI_REGION || 'us';
  const market = (q.market || '').trim();
  if (!market){
    return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Provide ?market=...' }) };
  }
  const limit  = Math.max(1, Math.min(20, parseInt(q.limit || '8', 10)));

  try {
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKey}`;
    const eresp = await withTimeoutFetch(eventsUrl, {}, 7000);
    if (!eresp.ok){
      return { statusCode: eresp.status, body: JSON.stringify({ ok:false, step:'events', status: eresp.status }) };
    }
    const events = await eresp.json();
    const picked = Array.isArray(events) ? events.slice(0, limit) : [];

    let marketsSeen = 0, outcomesSeen = 0;
    const sample = [];
    for (const ev of picked){
      const id = ev && (ev.id || ev.event_id || ev.eventId);
      if (!id) continue;
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${id}/odds?regions=${region}&markets=${encodeURIComponent(market)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
      const oresp = await withTimeoutFetch(oddsUrl, {}, 8000);
      if (!oresp.ok) continue;
      const data = await oresp.json();
      const bms = Array.isArray(data && data.bookmakers) ? data.bookmakers : [];
      for (const bm of bms){
        const mkts = (bm && bm.markets) || [];
        for (const mk of mkts){
          if ((mk.key || mk.market || mk.name) !== market) continue;
          marketsSeen++;
          const outs = (mk && mk.outcomes) || [];
          outcomesSeen += outs.length;
          sample.push({
            event_id: id,
            book: (bm.key || bm.title || '').toLowerCase(),
            count_outcomes: outs.length,
            sample_players: outs.slice(0,5).map(o => o.name || o.participant || o.title || o.runner)
          });
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, market, events_scanned: picked.length, markets_seen: marketsSeen, outcomes_seen: outcomesSeen, sample }) };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
