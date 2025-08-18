// odds-refresh-rapid.js (CommonJS)
// Supports TheOddsAPI *or* RapidAPI provider based on env.
// Strict mode: never overwrites with empty data; retries on 429.

const { getStore } = require('@netlify/blobs');

function initStore(){
  const name = process.env.BLOBS_STORE || 'mlb-odds';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token){
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

function dateETISO(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

// --- retry helpers ---
async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
async function jsonWithBackoff(url, headers, attempts=[1000, 2500, 6000, 10000]){
  let lastErr = null;
  for (let i=0;i<attempts.length;i++){
    try{
      const r = await fetch(url, { headers });
      if (r.status === 429){
        lastErr = new Error('429 Too Many Requests');
        await sleep(attempts[i]);
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return await r.json();
    }catch(e){
      lastErr = e;
      await sleep(attempts[i]);
    }
  }
  throw lastErr || new Error('Failed after retries');
}

function buildUrls(date){
  // If RapidAPI host & key set, use those URLs.
  const rapidHost = process.env.RAPIDAPI_HOST;
  const rapidKey  = process.env.RAPIDAPI_KEY;
  const evTpl = process.env.RAPIDAPI_EVENTS_URL || '';
  const propsTpl = process.env.RAPIDAPI_EVENT_PROPS_URL || '';

  const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY || '';

  if (rapidHost && rapidKey && evTpl && propsTpl){
    return {
      provider: 'rapidapi',
      headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost },
      eventsUrl: evTpl.replace('{DATE}', date).replace('{API_KEY}', apiKey),
      propsTpl: propsTpl.replace('{API_KEY}', apiKey),
    };
  }

  // Default to TheOddsAPI
  const sport  = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
  const region = process.env.ODDSAPI_REGION || 'us';
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKey}`;
  const market = process.env.ODDSAPI_MARKET || process.env.PROP_MARKET_KEY || 'player_home_run';
  const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${market}&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;

  return { provider: 'theoddsapi', headers: {}, eventsUrl, propsTpl: propsTpl2 };
}

exports.handler = async (event) => {
  const PROP_MARKET_KEY = process.env.PROP_MARKET_KEY || 'player_home_run';
  const PROP_OUTCOME_FIELD = process.env.PROP_OUTCOME_FIELD || 'name';
  const BOOKS = (process.env.BOOKS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

  const store = initStore();
  const date = (event.queryStringParameters && event.queryStringParameters.date) || dateETISO();
  const { provider, headers, eventsUrl, propsTpl } = buildUrls(date);

  // 1) Events
  let events = [];
  try {
    const ej = await jsonWithBackoff(eventsUrl, headers);
    events = Array.isArray(ej && ej.events) ? ej.events : (Array.isArray(ej) ? ej : ((ej && ej.data) || ej || []));
  } catch (e) {
    try { await store.set('latest_error.json', JSON.stringify({ date, step:'events', provider, error: String(e) })); } catch(_e) {}
    return { statusCode: 429, body: JSON.stringify({ ok:false, step:'events', provider, error: String(e), hint:'Provider busy or rate-limited; try again shortly.' }) };
  }

  const evIds = [];
  for (const ev of events){
    const id = (ev && (ev.event_id || ev.id || ev.eventId));
    if (id) evIds.push(String(id));
  }

  if (evIds.length === 0){
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no MLB events returned for date', provider }) };
  }

  // 2) Props per event (normalize TheOddsAPI and RapidAPI shapes)
  const playersMap = new Map();
  let totalMarkets = 0;

  for (const id of evIds){
    const url = propsTpl.replace('{EVENT_ID}', id);
    let pj;
    try { pj = await jsonWithBackoff(url, headers); } catch (e) { continue; }

    if (Array.isArray(pj && pj.bookmakers)){
      // TheOddsAPI shape
      for (const bm of pj.bookmakers){
        const bookKey = ((bm && (bm.key || bm.title)) || '').toLowerCase();
        if (BOOKS.length && (!bookKey || !BOOKS.includes(bookKey))) continue;
        const mkts = (bm && bm.markets) || [];
        for (const mk of mkts){
          const mkey = (mk && (mk.key || mk.market || mk.name)) || '';
          if (String(mkey).toLowerCase() !== String(PROP_MARKET_KEY).toLowerCase()) continue;
          totalMarkets++;
          const outcomes = (mk && mk.outcomes) || [];
          for (const o of outcomes){
            const rawName = o[PROP_OUTCOME_FIELD] || o.name || o.participant || o.title || o.runner || '';
            if (!rawName) continue;
            const american = Number(o.price || o.odds || o.american || 0);
            if (!american) continue;
            const keyName = String(rawName).trim().toLowerCase();
            const rec = playersMap.get(keyName) || { prices: [], by_book: {} };
            rec.prices.push(american);
            if (bookKey) rec.by_book[bookKey] = american;
            playersMap.set(keyName, rec);
          }
        }
      }
    } else {
      // RapidAPI-like shape (markets/props/data at top level)
      const markets = (pj && (pj.markets || pj.props || pj.data)) || [];
      for (const mk of (Array.isArray(markets) ? markets : [])){
        const key = mk && (mk.key || mk.market || mk.name);
        if (!key || String(key).toLowerCase().indexOf(String(PROP_MARKET_KEY).toLowerCase()) === -1) continue;
        totalMarkets++;
        const outcomes = mk.outcomes || mk.selections || mk.offers || [];
        for (const o of (Array.isArray(outcomes) ? outcomes : [])){
          const rawName = o[PROP_OUTCOME_FIELD] || o.name || o.title || o.runner || '';
          if (!rawName) continue;
          const american = Number(o.price_american || o.american || o.price || o.odds || 0);
          const book = ((o.book || o.bookmaker || o.source || '') + '').toLowerCase();
          if (BOOKS.length && (!book || !BOOKS.includes(book))) continue;
          if (!american) continue;
          const keyName = rawName.trim().toLowerCase();
          const rec = playersMap.get(keyName) || { prices: [], by_book: {} };
          rec.prices.push(american);
          if (book) rec.by_book[book] = american;
          playersMap.set(keyName, rec);
        }
      }
    }
  }

  function median(arr){
    if (!arr || !arr.length) return null;
    const a = arr.slice().sort((x,y)=>x-y);
    const mid = Math.floor(a.length/2);
    return a.length%2 ? a[mid] : Math.round((a[mid-1]+a[mid])/2);
  }

  const playersOut = {};
  for (const [name, rec] of playersMap.entries()){
    playersOut[name] = {
      median_american: median(rec.prices),
      by_book: rec.by_book,
      count_books: Object.keys(rec.by_book).length
    };
  }

  // If no players collected, do not overwrite snapshot.
  if (Object.keys(playersOut).length === 0){
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no HR player props found', provider }) };
  }

  const snapshot = { date, provider, market: PROP_MARKET_KEY, players: playersOut };
  await store.set(date + '.json', JSON.stringify(snapshot));
  await store.set('latest.json', JSON.stringify(snapshot));

  return { statusCode: 200, body: JSON.stringify({ ok:true, provider, events: evIds.length, players: Object.keys(playersOut).length, markets: totalMarkets }) };
};
