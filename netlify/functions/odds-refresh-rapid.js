// netlify/functions/odds-refresh-rapid.js
// Restores TheOddsAPI multi-region Over 0.5 HR props -> Netlify Blobs snapshot.
// Env required:
//   PROVIDER=theoddsapi
//   THEODDS_API_KEY=<your key>
//   ODDSAPI_SPORT_KEY=baseball_mlb
//   ODDSAPI_REGION=us,us2
//   PROP_MARKET_KEY=batter_home_runs
// Optional:
//   BLOBS_STORE=mlb-odds
//   BACKOFF_MS=500,1000
//   BOOKS=fanduel,draftkings,betmgm,caesars
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
  if (query && (query.quick === '1' || query.quick === 1)) arr = [300, 700];
  return arr;
}
function withTimeout(fn, ms){
  return new Promise((resolve,reject)=>{
    const ctrl = new AbortController();
    const id = setTimeout(()=>{ try{ ctrl.abort(); }catch(_){}; reject(new Error('fetch timeout')); }, ms);
    fn(ctrl.signal).then(x=>{ clearTimeout(id); resolve(x); }).catch(e=>{ clearTimeout(id); reject(e); });
  });
}
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function jsonWithBackoff(url, headers, attempts){
  let last;
  for (let i=0;i<attempts.length;i++){
    try{
      const r = await withTimeout((signal)=>fetch(url, { headers, signal }), 5000);
      if (r.status === 429){ last = new Error('429'); await sleep(attempts[i]); continue; }
      if (!r.ok) throw new Error('HTTP '+r.status+' for '+url);
      return await r.json();
    }catch(e){ last = e; await sleep(attempts[i]); }
  }
  throw last || new Error('failed');
}
function buildUrls(){
  const provider = String(process.env.PROVIDER||'theoddsapi').toLowerCase();
  if (provider !== 'theoddsapi') return { error:'Set PROVIDER=theoddsapi', provider };
  const apiKey = process.env.THEODDS_API_KEY;
  if (!apiKey) return { error:'Missing THEODDS_API_KEY', provider };
  const sport   = process.env.ODDSAPI_SPORT_KEY || 'baseball_mlb';
  const regions = String(process.env.ODDSAPI_REGION || 'us').split(',').map(s=>s.trim()).filter(Boolean);
  const market  = process.env.PROP_MARKET_KEY || 'batter_home_runs';
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${encodeURIComponent(regions.join(','))}&dateFormat=iso&apiKey=${apiKey}`;
  const propsTpl  = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${encodeURIComponent(regions.join(','))}&markets=${encodeURIComponent(market)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
  return { provider, eventsUrl, propsTpl, regions, market };
}
function median(arr){
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y);
  const i = Math.floor(a.length/2);
  return a.length%2 ? a[i] : Math.round((a[i-1]+a[i])/2);
}
function normalizeName(s){
  if (!s) return '';
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[.]/g,'').replace(/[’']/g,"'").trim();
}
function outcomePlayer(o){
  const fields = ['description','participant','name','title','runner','label'];
  for (const f of fields){ if (o && o[f]) return String(o[f]); }
  return null;
}
function isOver(o){
  const nm = (o && (o.name||o.title||'')).toLowerCase();
  if (nm.includes('over')) return true;
  if (typeof o.over_under !== 'undefined') return String(o.over_under).toLowerCase()==='over';
  return true; // for O/U markets where outcomes are separate runners
}

exports.handler = async (event)=>{
  const store = initStore();
  const backoff = parseBackoff(event.queryStringParameters||{});
  const cfg = buildUrls();
  if (cfg.error){
    return { statusCode: 400, body: JSON.stringify({ ok:false, step:'setup', error: cfg.error, provider: cfg.provider }) };
  }
  const { provider, eventsUrl, propsTpl, regions, market } = cfg;

  let events = [];
  try{
    const ej = await jsonWithBackoff(eventsUrl, {}, backoff);
    events = Array.isArray(ej) ? ej : (Array.isArray(ej?.events) ? ej.events : []);
  }catch(e){
    await store.set('latest_error.json', JSON.stringify({ step:'events', error:String(e) }));
    return { statusCode: 502, body: JSON.stringify({ ok:false, step:'events', error:String(e) }) };
  }
  const ids = events.map(ev=> String(ev.id || ev.event_id || ev.eventId)).filter(Boolean);
  if (!ids.length){
    await store.set('latest_error.json', JSON.stringify({ step:'events', error:'no events' }));
    return { statusCode: 200, body: JSON.stringify({ ok:true, provider, regions, market, events:0, players:0, markets:0 }) };
  }

  const BOOKS = String(process.env.BOOKS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const map = new Map();
  let totalMkts = 0;
  for (const id of ids){
    const url = propsTpl.replace('{EVENT_ID}', id);
    let pj; try{ pj = await jsonWithBackoff(url, {}, backoff); }catch(e){ continue; }
    const bms = Array.isArray(pj?.bookmakers) ? pj.bookmakers : [];
    for (const bm of bms){
      const bookKey = String(bm.key || bm.title || '').toLowerCase();
      if (BOOKS.length && (!bookKey || !BOOKS.includes(bookKey))) continue;
      const mkts = bm.markets || [];
      for (const mk of mkts){
        const mkey = String(mk.key || mk.market || mk.name);
        if (mkey !== market) continue;
        totalMkts++;
        const outs = mk.outcomes || [];
        for (const o of outs){
          if (!isOver(o)) continue;
          if (typeof o.point !== 'undefined'){
            const p = Number(o.point);
            if (Number.isFinite(p) && Math.abs(p-0.5)>1e-6) continue;
          }
          const player = outcomePlayer(o);
          if (!player) continue;
          const american = Number(o.price || o.odds || o.american || 0);
          if (!american) continue;
          const key = normalizeName(player);
          const rec = map.get(key) || { prices: [], by_book: {} };
          rec.prices.push(american);
          if (bookKey) rec.by_book[bookKey] = american;
          map.set(key, rec);
        }
      }
    }
  }

  const out = {};
  for (const [k, rec] of map.entries()){
    out[k] = { median_american: median(rec.prices), by_book: rec.by_book, count_books: Object.keys(rec.by_book).length };
  }
  const snapshot = { date: dateETISO(), provider, regions, market, players: out, type: 'HR_over_0_5' };
  await store.set('latest.json', JSON.stringify(snapshot));
  await store.set(`${dateETISO()}.json`, JSON.stringify(snapshot));

  return { statusCode: 200, body: JSON.stringify({ ok:true, provider, regions, market, events: ids.length, players: Object.keys(out).length, markets: totalMkts }) };
};
