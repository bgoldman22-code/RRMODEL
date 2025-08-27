// netlify/functions/odds-list-markets.js (CommonJS)
// Purpose: Discover the correct HR market key(s) from TheOddsAPI by listing all markets seen today.
// Usage:  /.netlify/functions/odds-list-markets?limit=8&debug=1
// Env: THEODDS_API_KEY (required), ODDSAPI_SPORT_KEY (default baseball_mlb), ODDSAPI_REGION (default us)

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function withTimeoutFetch(url, opts, ms=3500){
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
  try {
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey){
      return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing THEODDS_API_KEY', where:'env' }) };
    }
    const sport  = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
    const region = process.env.ODDSAPI_REGION || 'us';
    const limit  = Math.max(1, Math.min(20, parseInt((event.queryStringParameters||{}).limit || '10', 10)));

    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKey}`;
    const eresp = await withTimeoutFetch(eventsUrl, {}, 5000);
    if (!eresp.ok){
      return { statusCode: eresp.status, body: JSON.stringify({ ok:false, step:'events', status: eresp.status }) };
    }
    const events = await eresp.json();
    if (!Array.isArray(events) || events.length === 0){
      return { statusCode: 200, body: JSON.stringify({ ok:true, events_count: 0, markets: [] }) };
    }

    const marketsIndex = {}; // marketKey -> { count, sample_outcomes: Set, sample_books: Set }
    const picked = events.slice(0, limit);
    for (const ev of picked){
      const id = ev && (ev.id || ev.event_id || ev.eventId);
      if (!id) continue;
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${id}/odds?regions=${region}&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
      let ores;
      try {
        const oresp = await withTimeoutFetch(oddsUrl, {}, 6000);
        if (!oresp.ok) continue;
        ores = await oresp.json();
      } catch (e){ continue; }

      const bms = Array.isArray(ores && ores.bookmakers) ? ores.bookmakers : [];
      for (const bm of bms){
        const mkts = (bm && bm.markets) || [];
        for (const mk of mkts){
          const key = (mk && (mk.key || mk.market || mk.name)) || '';
          if (!key) continue;
          const out = (mk && mk.outcomes) || [];
          if (!marketsIndex[key]) marketsIndex[key] = { count: 0, sample_outcomes: new Set(), sample_books: new Set() };
          marketsIndex[key].count += 1;
          marketsIndex[key].sample_books.add((bm.key || bm.title || '').toLowerCase());
          for (const o of out.slice(0, 5)){
            const nm = o.name || o.participant || o.title || o.runner || '';
            if (nm) marketsIndex[key].sample_outcomes.add(nm);
          }
        }
      }
      await sleep(150); // light pacing
    }

    const markets = Object.entries(marketsIndex).map(([key, v])=> ({
      key,
      count: v.count,
      sample_outcomes: Array.from(v.sample_outcomes).slice(0, 8),
      sample_books: Array.from(v.sample_books).slice(0, 8),
      hr_like: /home[_\s-]?run|hr\b|to\s+hit\s+a\s+home\s+run/i.test(key)
    })).sort((a,b)=> b.count - a.count);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok:true, events_count: events.length, scanned: picked.length, markets })
    };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
