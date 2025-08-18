// netlify/functions/odds-refresh-rapid.js
// Supports TheOddsAPI "batter_home_runs" (Over/Under) as proxy for Anytime HR (we take Over only).
// Also still supports RapidAPI (The Rundown) if PROVIDER=rapidapi and RAPIDAPI_* envs are present.

const { getStore } = require('@netlify/blobs');

function initStore(){
  const name = process.env.BLOBS_STORE || 'mlb-odds';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

function dateETISO(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function parseBackoff(query){
  const env = (process.env.BACKOFF_MS||'').trim();
  let arr = env ? env.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>0) : [600, 1200, 2000];
  if (query && (query.quick === '1' || query.quick === 1)) arr = [400, 900];
  let total=0, trimmed=[];
  for (const ms of arr){
    if (total + ms > 8000) break;
    trimmed.push(ms); total += ms;
  }
  return trimmed.length ? trimmed : [800];
}

function withTimeout(promise, ms){
  return new Promise((resolve,reject)=>{
    const ctrl = new AbortController();
    const id = setTimeout(()=>{ try{ ctrl.abort(); }catch(_e){}; reject(new Error('fetch timeout '+ms+'ms')); }, ms);
    promise(ctrl.signal).then(v=>{ clearTimeout(id); resolve(v); }).catch(e=>{ clearTimeout(id); reject(e) });
  });
}
async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function jsonWithBackoff(url, headers, attempts){
  let lastErr = null;
  for (let i=0;i<attempts.length;i++){
    try{
      const r = await withTimeout((signal)=>fetch(url, { headers, signal }), 4000);
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
  const marketKey = (process.env.ODDSAPI_MARKET || process.env.PROP_MARKET_KEY || 'batter_home_runs').trim();

  // Force override by PROVIDER
  if (providerPref === 'theoddsapi'){
    if (!apiKeyOdds) return { error: 'Missing THEODDS_API_KEY for TheOddsAPI', provider: 'theoddsapi' };
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKeyOdds}`;
    const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${encodeURIComponent(marketKey)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
    return { provider:'theoddsapi', mode:'forced', headers:{}, eventsUrl, propsTpl: propsTpl2, marketKey };
  }
  if (providerPref === 'rapidapi'){
    if (!(rapidHost && rapidKey && evTpl && propsTpl)) return { error: 'PROVIDER=rapidapi but missing RAPIDAPI_* envs', provider:'rapidapi' };
    return { provider:'rapidapi', mode:'forced', headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost }, eventsUrl: evTpl.replace('{DATE}', date), propsTpl, marketKey };
  }

  // Auto
  if (rapidHost && rapidKey && evTpl && propsTpl){
    return { provider:'rapidapi', mode:'auto', headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost }, eventsUrl: evTpl.replace('{DATE}', date), propsTpl, marketKey };
  }
  if (!apiKeyOdds) return { error: 'No provider configured: set THEODDS_API_KEY or RAPIDAPI_* envs', provider:'auto' };
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKeyOdds}`;
  const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${encodeURIComponent(marketKey)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
  return { provider:'theoddsapi', mode:'auto', headers:{}, eventsUrl, propsTpl: propsTpl2, marketKey };
}

function median(arr){
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return a.length%2 ? a[mid] : Math.round((a[mid-1]+a[mid])/2);
}

// Try to extract the player name from an outcome object in batter_home_runs market
function getOutcomePlayer(o){
  const fields = (process.env.PROP_OUTCOME_PLAYER_FIELDS || 'description,participant,name').split(',').map(s=>s.trim());
  for (const f of fields){
    if (o && o[f]) return String(o[f]).trim();
  }
  // Sometimes book embeds player in outcome "description" like "Aaron Judge Over 0.5"
  if (o && o.description) return String(o.description).replace(/Over.*$/i,'').trim();
  return null;
}

// Decide if an outcome is the "Over" side
function isOverOutcome(o){
  const name = (o && (o.name || o.title || o.label || '')).toString().toLowerCase();
  if (name.includes('over')) return true;
  // Some books use boolean "over_under" or a code
  if (o && typeof o.over_under !== 'undefined') return String(o.over_under).toLowerCase() === 'over';
  // Fallback: if outcome has point and maybe implied it's the higher side, but skip guessing
  return false;
}

exports.handler = async (event) => {
  const BOOKS = (process.env.BOOKS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const date = (event.queryStringParameters && event.queryStringParameters.date) || dateETISO();
  const debug = !!(event.queryStringParameters && event.queryStringParameters.debug);
  const backoff = parseBackoff(event.queryStringParameters || {});
  const setup = buildUrls(date);
  const store = initStore();

  if (setup && setup.error){
    return { statusCode: 400, body: JSON.stringify({ ok:false, step:'setup', error: setup.error, provider: setup.provider }) };
  }
  const { provider, headers, eventsUrl, propsTpl, mode, marketKey } = setup;

  // 1) Fetch events
  let events = [];
  try {
    const ej = await jsonWithBackoff(eventsUrl, headers, backoff);
    events = Array.isArray(ej && ej.events) ? ej.events : (Array.isArray(ej) ? ej : ((ej && ej.data) || ej || []));
  } catch (e) {
    try { await store.set('latest_error.json', JSON.stringify({ date, step:'events', provider, error: String(e) })); } catch(_e) {}
    return { statusCode: 504, body: JSON.stringify({ ok:false, step:'events', provider, error: String(e), backoff, debug: debug ? setup : undefined }) };
  }

  const evIds = [];
  for (const ev of events){
    const id = (ev && (ev.event_id || ev.id || ev.eventId));
    if (id) evIds.push(String(id));
  }
  if (!evIds.length){
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no MLB events returned for date', provider, debug: debug ? setup : undefined }) };
  }

  // 2) Per-event props → collect Over 0.5 odds per player
  const playersMap = new Map();
  let totalMkts = 0;
  for (const id of evIds){
    const url = propsTpl.replace('{EVENT_ID}', id);
    let pj;
    try { pj = await jsonWithBackoff(url, headers, backoff); } catch (e) { continue; }

    // TheOddsAPI shape
    const bms = Array.isArray(pj && pj.bookmakers) ? pj.bookmakers : [];
    for (const bm of bms){
      const bookKey = ((bm && (bm.key || bm.title)) || '').toLowerCase();
      if (BOOKS.length && (!bookKey || !BOOKS.includes(bookKey))) continue;
      const mkts = (bm && bm.markets) || [];
      for (const mk of mkts){
        const mkey = (mk && (mk.key || mk.market || mk.name)) || '';
        if (String(mkey).toLowerCase() !== String(marketKey).toLowerCase()) continue;
        totalMkts++;
        const outs = (mk && mk.outcomes) || [];
        for (const o of outs){
          if (!isOverOutcome(o)) continue; // we only take Over
          // If point exists, ensure it's 0.5 (typical for anytime proxy). If absent, accept.
          if (typeof o.point !== 'undefined'){
            const p = Number(o.point);
            if (!isNaN(p) && Math.abs(p - 0.5) > 1e-6) continue;
          }
          const player = getOutcomePlayer(o);
          if (!player) continue;
          const american = Number(o.price || o.odds || o.american || 0);
          if (!american) continue;
          const keyName = player.toLowerCase();
          const rec = playersMap.get(keyName) || { prices: [], by_book: {} };
          rec.prices.push(american);
          if (bookKey) rec.by_book[bookKey] = american;
          playersMap.set(keyName, rec);
        }
      }
    }
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
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no Over 0.5 HR outcomes found', provider, marketKey, debug: debug ? setup : undefined }) };
  }

  const snapshot = { date, provider, market: marketKey, players: playersOut, mode, type: 'HR_over_0_5' };
  await store.set(date + '.json', JSON.stringify(snapshot));
  await store.set('latest.json', JSON.stringify(snapshot));

  const resp = { ok:true, provider, mode, events: evIds.length, players: Object.keys(playersOut).length, markets: totalMkts, marketKey };
  if (debug) resp.debug = { ...setup, backoff };
  return { statusCode: 200, body: JSON.stringify(resp) };
};
