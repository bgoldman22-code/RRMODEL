/**
 * Netlify Function: odds-refresh-rapid (FIXED store usage)
 * Uses a NAMED Blobs store. Set BLOBS_STORE to override (default 'mlb-odds').
 */
import { getStore } from '@netlify/blobs';

function dateETISO(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

export const handler = async (event) => {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;
  const EVENTS_URL = process.env.RAPIDAPI_EVENTS_URL;
  const EVENT_PROPS_URL = process.env.RAPIDAPI_EVENT_PROPS_URL;
  const PROP_MARKET_KEY = process.env.PROP_MARKET_KEY || 'batter_anytime_hr';
  const PROP_OUTCOME_FIELD = process.env.PROP_OUTCOME_FIELD || 'participant';
  const BOOKS = (process.env.BOOKS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const STORE_NAME = process.env.BLOBS_STORE || 'mlb-odds';

  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST || !EVENTS_URL || !EVENT_PROPS_URL){
    return { statusCode: 400, body: JSON.stringify({ ok:false, error: 'Missing RAPIDAPI_* envs (HOST/KEY/EVENTS_URL/EVENT_PROPS_URL)' }) };
  }

  const store = getStore(STORE_NAME);
  const date = (event.queryStringParameters && event.queryStringParameters.date) || dateETISO();
  const eventsUrl = EVENTS_URL.replace('{DATE}', date);

  const headers = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST };

  async function safeJson(url){
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  // 1) Fetch events
  let events = [];
  try {
    const ej = await safeJson(eventsUrl);
    events = Array.isArray(ej?.events) ? ej.events : (Array.isArray(ej) ? ej : (ej?.data || []));
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok:false, step:'events', error: String(e) }) };
  }

  // Extract event ids
  const evIds = [];
  for (const ev of events){
    const id = ev?.event_id || ev?.id || ev?.eventId;
    if (id) evIds.push(String(id));
  }

  if (evIds.length === 0){
    await store.set(`${date}.json`, JSON.stringify({ date, provider:'rapidapi', players:{} }));
    await store.set('latest.json', JSON.stringify({ date, provider:'rapidapi', players:{} }));
    return { statusCode: 200, body: JSON.stringify({ ok:true, events:0, players:0 }) };
  }

  // 2) For each event, fetch props
  const playersMap = new Map();
  let totalMarkets = 0;

  for (const id of evIds){
    const url = EVENT_PROPS_URL.replace('{EVENT_ID}', id);
    let pj;
    try { pj = await safeJson(url); } catch (e){ continue; }

    const markets = pj?.markets || pj?.props || pj?.data || [];
    totalMarkets += Array.isArray(markets) ? markets.length : 0;

    for (const mk of (Array.isArray(markets) ? markets : [])){
      const key = mk?.key || mk?.market || mk?.name;
      if (!key || String(key).toLowerCase().indexOf(String(PROP_MARKET_KEY).toLowerCase()) === -1) continue;

      const outcomes = mk?.outcomes || mk?.selections || mk?.offers || [];
      for (const o of (Array.isArray(outcomes) ? outcomes : [])){
        const rawName = o?.[PROP_OUTCOME_FIELD] || o?.name || o?.title || o?.runner || '';
        if (!rawName) continue;
        const american = Number(o?.price_american || o?.american || o?.price || o?.odds || 0);
        const book = (o?.book || o?.bookmaker || o?.source || '').toLowerCase();
        if ((process.env.BOOKS||'') && process.env.BOOKS.length){
          const allow = process.env.BOOKS.split(',').map(s=>s.trim().toLowerCase());
          if (!book || !allow.includes(book)) continue;
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

  await store.set(`${date}.json`, JSON.stringify(snapshot));
  await store.set('latest.json', JSON.stringify(snapshot));

  return { statusCode: 200, body: JSON.stringify({ ok:true, events: evIds.length, players: Object.keys(playersOut).length, markets: totalMarkets, store: STORE_NAME }) };
};
