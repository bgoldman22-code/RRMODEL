// netlify/functions/odds-refresh-rapid.js (multi-region Over 0.5 HR via TheOddsAPI)
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
  let arr = env ? env.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>0) : [500, 1000];
  if (query && (query.quick === '1' || query.quick === 1)) arr = [400, 800];
  return arr;
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
      const r = await withTimeout((signal)=>fetch(url, { headers, signal }), 4500);
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
  const sport     = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
  const regions   = String(process.env.ODDSAPI_REGION || 'us').split(',').map(s=>s.trim()).filter(Boolean);
  const marketKey = (process.env.ODDSAPI_MARKET || process.env.PROP_MARKET_KEY || 'batter_home_runs').trim();

  if (providerPref && providerPref !== 'theoddsapi'){
    return { error: 'Only TheOddsAPI supported in this build (set PROVIDER=theoddsapi).', provider: providerPref };
  }
  if (!apiKeyOdds) return { error: 'Missing THEODDS_API_KEY for TheOddsAPI', provider: 'theoddsapi' };

  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${encodeURIComponent(regions.join(','))}&dateFormat=iso&apiKey=${apiKeyOdds}`;
  const propsTpl  = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${encodeURIComponent(regions.join(','))}&markets=${encodeURIComponent(marketKey)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
  return { provider:'theoddsapi', headers:{}, eventsUrl, propsTpl, regions, marketKey };
}

function median(arr){
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return a.length%2 ? a[mid] : Math.round((a[mid-1]+a[mid])/2);
}
function getOutcomePlayer(o){
  const fields = (process.env.PROP_OUTCOME_PLAYER_FIELDS || 'description,participant,name').split(',').map(s=>s.trim());
  for (const f of fields){
    if (o && o[f]) return String(o[f]).trim();
  }
  if (o && o.description) return String(o.description).replace(/Over.*$/i,'').trim();
  return null;
}
function isOverOutcome(o){
  const name = (o && (o.name || o.title || o.label || '')).toString().toLowerCase();
  if (name.includes('over')) return true;
  if (o && typeof o.over_under !== 'undefined') return String(o.over_under).toLowerCase() === 'over';
  return false;
}

export const handler = async (event) => {
  const BOOKS = (process.env.BOOKS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const date = (event.queryStringParameters && event.queryStringParameters.date) || dateETISO();
  const debug = !!(event.queryStringParameters && event.queryStringParameters.debug);
  const backoff = parseBackoff(event.queryStringParameters || {});
  const setup = buildUrls(date);
  const store = initStore();

  if (setup && setup.error){
    return { statusCode: 400, body: JSON.stringify({ ok:false, step:'setup', error: setup.error, provider: setup.provider }) };
  }
  const { provider, headers, eventsUrl, propsTpl, regions, marketKey } = setup;

  let events = [];
  try {
    const ej = await jsonWithBackoff(eventsUrl, headers, backoff);
    events = Array.isArray(ej && ej.events) ? ej.events : (Array.isArray(ej) ? ej : ((ej && ej.data) || ej || []));
  } catch (e) {
    try { await store.set('latest_error.json', JSON.stringify({ date, step:'events', provider, error: String(e) })); } catch(_e) {}
    return { statusCode: 504, body: JSON.stringify({ ok:false, step:'events', provider, error: String(e), regions, marketKey }) };
  }

  const evIds = [];
  for (const ev of events){
    const id = (ev && (ev.event_id || ev.id || ev.eventId));
    if (id) evIds.push(String(id));
  }
  if (!evIds.length){
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no MLB events returned for date', provider, regions, marketKey }) };
  }

  const playersMap = new Map();
  let totalMkts = 0;
  for (const id of evIds){
    const url = propsTpl.replace('{EVENT_ID}', id);
    let pj;
    try { pj = await jsonWithBackoff(url, headers, backoff); } catch (e) { continue; }

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
          if (!isOverOutcome(o)) continue;
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
    return { statusCode: 204, body: JSON.stringify({ ok:false, reason:'no Over 0.5 HR outcomes found', provider, regions, marketKey }) };
  }

  const snapshot = { date, provider, market: marketKey, regions, players: playersOut, type: 'HR_over_0_5' };
  await store.set(date + '.json', JSON.stringify(snapshot));
  await store.set('latest.json', JSON.stringify(snapshot));

  return { statusCode: 200, body: JSON.stringify({ ok:true, provider, regions, marketKey, events: evIds.length, players: Object.keys(playersOut).length, markets: totalMkts }) };
};
