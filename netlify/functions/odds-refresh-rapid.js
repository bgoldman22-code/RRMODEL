// odds-refresh-rapid.js (CommonJS)
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

exports.handler = async (event) => {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;
  const EVENTS_URL = process.env.RAPIDAPI_EVENTS_URL;
  const EVENT_PROPS_URL = process.env.RAPIDAPI_EVENT_PROPS_URL;
  const PROP_MARKET_KEY = process.env.PROP_MARKET_KEY || 'batter_anytime_hr';
  const PROP_OUTCOME_FIELD = process.env.PROP_OUTCOME_FIELD || 'participant';
  const BOOKS = (process.env.BOOKS||'').split(',').map(s=>s.trim()).filter(Boolean);

  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST || !EVENTS_URL || !EVENT_PROPS_URL){
    return { statusCode: 400, body: JSON.stringify({ ok:false, error: 'Missing RAPIDAPI_* envs (HOST/KEY/EVENTS_URL/EVENT_PROPS_URL)' }) };
  }

  const store = initStore();
  const date = (event.queryStringParameters && event.queryStringParameters.date) || dateETISO();
  const eventsUrl = EVENTS_URL.replace('{DATE}', date);

  const headers = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST };

  
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
async function safeJson(url){
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return await r.json();
  }

  // 1) Events
  let events = [];
  try {
    const ej = await jsonWithBackoff(eventsUrl, headers);
    events = Array.isArray(ej && ej.events) ? ej.events : (Array.isArray(ej) ? ej : ((ej && ej.data) || []));
  } catch (e) {
    try { await store.set('latest_error.json', JSON.stringify({ date, step:'events', error: String(e) })); } catch(_e) {}
    return { statusCode: 429, body: JSON.stringify({ ok:false, step:'events', error: String(e), hint:'Rate limited or provider busy; try again in a minute.' }) };
  }

  const evIds = [];
  for (const ev of events){
    const id = (ev && (ev.event_id || ev.id || ev.eventId));
    if (id) evIds.push(String(id));
  }

  if (evIds.length === 0){
    await store.set(date + '.json', JSON.stringify({ date, provider:'rapidapi', players:{} }));
    await store.set('latest.json', JSON.stringify({ date, provider:'rapidapi', players:{} }));
    return { statusCode: 200, body: JSON.stringify({ ok:true, events:0, players:0 }) };
  }

  // 2) Props per event
  const playersMap = new Map();
  let totalMarkets = 0;

  for (const id of evIds){
    const url = EVENT_PROPS_URL.replace('{EVENT_ID}', id);
    let pj;
    try { pj = await safeJson(url); } catch (e){ continue; }
    const markets = (pj && (pj.markets || pj.props || pj.data)) || [];
    totalMarkets += Array.isArray(markets) ? markets.length : 0;
    for (const mk of (Array.isArray(markets) ? markets : [])){
      const key = mk && (mk.key || mk.market || mk.name);
      if (!key || String(key).toLowerCase().indexOf(String(PROP_MARKET_KEY).toLowerCase()) === -1) continue;
      const outcomes = mk.outcomes || mk.selections || mk.offers || [];
      for (const o of (Array.isArray(outcomes) ? outcomes : [])){
        const rawName = o[PROP_OUTCOME_FIELD] || o.name || o.title || o.runner || '';
        if (!rawName) continue;
        const american = Number(o.price_american || o.american || o.price || o.odds || 0);
        const book = ((o.book || o.bookmaker || o.source || '') + '').toLowerCase();
        if ((process.env.BOOKS||'') && process.env.BOOKS.length){
          const allow = process.env.BOOKS.split(',').map(s=>s.trim().toLowerCase());
          if (!book || allow.indexOf(book) === -1) continue;
        }
        const keyName = rawName.trim().toLowerCase();
        const rec = playersMap.get(keyName) || { prices: [], by_book: {} };
        if (!Number.isNaN(american) && american !== 0){
          rec.prices.push(american);
          if (book) rec.by_book[book] = american;
        }
        playersMap.set(keyName, rec);
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

  const snapshot = { date, provider:'rapidapi', market: process.env.PROP_MARKET_KEY||'batter_anytime_hr', players: playersOut };

  await store.set(date + '.json', JSON.stringify(snapshot));
  await store.set('latest.json', JSON.stringify(snapshot));

  return { statusCode: 200, body: JSON.stringify({ ok:true, events: evIds.length, players: Object.keys(playersOut).length, markets: totalMarkets }) };
};
