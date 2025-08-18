// odds-refresh-rapid.js (CommonJS) with PROVIDER override + debug
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

// backoff helpers
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
  const providerPref = (process.env.PROVIDER || '').toLowerCase().trim();
  const apiKeyOdds   = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY || '';

  const rapidHost = process.env.RAPIDAPI_HOST;
  const rapidKey  = process.env.RAPIDAPI_KEY;
  const evTpl     = process.env.RAPIDAPI_EVENTS_URL || '';
  const propsTpl  = process.env.RAPIDAPI_EVENT_PROPS_URL || '';

  const sport     = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
  const region    = process.env.ODDSAPI_REGION || 'us';
  const marketKey = process.env.ODDSAPI_MARKET || process.env.PROP_MARKET_KEY || 'player_home_run';

  // 1) Explicit override
  if (providerPref === 'theoddsapi'){
    if (!apiKeyOdds) return { error: 'Missing THEODDS_API_KEY for TheOddsAPI', provider: 'theoddsapi' };
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKeyOdds}`;
    const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${marketKey}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
    return { provider:'theoddsapi', mode:'forced', headers:{}, eventsUrl, propsTpl: propsTpl2, marketKey, region, sport };
  }
  if (providerPref === 'rapidapi'){
    if (!(rapidHost && rapidKey && evTpl && propsTpl)) return { error: 'PROVIDER=rapidapi but missing RAPIDAPI_* envs', provider:'rapidapi' };
    return { provider:'rapidapi', mode:'forced', headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost }, eventsUrl: evTpl.replace('{DATE}', date), propsTpl, marketKey, region, sport };
  }

  // 2) Auto-detect
  if (rapidHost && rapidKey && evTpl && propsTpl){
    return { provider:'rapidapi', mode:'auto', headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost }, eventsUrl: evTpl.replace('{DATE}', date), propsTpl, marketKey, region, sport };
  }
  if (!apiKeyOdds) return { error: 'No provider configured: set THEODDS_API_KEY or RAPIDAPI_* envs', provider:'auto' };
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKeyOdds}`;
  const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${marketKey}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
  return { provider:'theoddsapi', mode:'auto', headers:{}, eventsUrl, propsTpl: propsTpl2, marketKey, region, sport };
}

exports.handler = async (event) => {
  const PROP_MARKET_KEY = process.env.PROP_MARKET_KEY || 'player_home_run';
  const PROP_OUTCOME_FIELD = process.env.PROP_OUTCOME_FIELD || 'name';
  const BOOKS = (process.env.BOOKS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

  const store = initStore();
  const date = (event.queryStringParameters && event.queryStringParameters.date) || dateETISO();
  const debug = !!(event.queryStringParameters && event.queryStringParameters.debug);
  const setup = buildUrls(date);

  if (setup && setup.error){
    return { statusCode: 400, body: JSON.stringify({ ok:false, step:'setup', error: setup.error, provider: setup.provider }) };
  }

  const { provider, headers, eventsUrl, propsTpl, mode } = setup;

  // 1) Events
  let events = [];
  try {
    const ej = await jsonWithBackoff(eventsUrl, headers);
    events = Array.isArray(ej && ej.events) ? ej.events : (Array.isArray(ej) ? ej : ((ej && ej.data) || ej || []));
  } catch (e) {
    try { await store.set('latest_error.json', JSON.stringify({ date, step:'events', provider, error: String(e) })); } catch(_e) {}
    return { statusCode: 429, body: JSON.stringify({ ok:false, step:'events', provider, error: String(e), hint:'Provider busy or rate-limited; try again shortly.', debug: debug ? setup : undefined }) };
  }

  const evIds = [];
  for (const ev of events){
    const id = (ev && (ev.event_id || ev.id || ev.eventId));
    if (id) evIds.push(String(id));
  }

  if (evIds.length === 0){
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no MLB events returned for date', provider, debug: debug ? setup : undefined }) };
  }

  // 2) Props per event
  const playersMap = new Map();
  let totalMarkets = 0;

  for (const id of evIds){
    const url = propsTpl.replace('{EVENT_ID}', id);
    let pj;
    try { pj = await jsonWithBackoff(url, headers); } catch (e) { continue; }

    if (provider === 'theoddsapi' || Array.isArray(pj && pj.bookmakers)){
      // TheOddsAPI shape
      const bms = Array.isArray(pj && pj.bookmakers) ? pj.bookmakers : [];
      for (const bm of bms){
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
      // RapidAPI-like shape
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

  if (Object.keys(playersOut).length === 0){
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no HR player props found', provider, debug: debug ? setup : undefined }) };
  }

  const snapshot = { date, provider, market: PROP_MARKET_KEY, players: playersOut, mode };
  const store = initStore();
  await store.set(date + '.json', JSON.stringify(snapshot));
  await store.set('latest.json', JSON.stringify(snapshot));

  const resp = { ok:true, provider, mode, events: evIds.length, players: Object.keys(playersOut).length, markets: totalMarkets };
  if (debug) resp.debug = setup;
  return { statusCode: 200, body: JSON.stringify(resp) };
};
