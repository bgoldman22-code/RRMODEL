
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

function parseBackoff(query){
  const env = (process.env.BACKOFF_MS||'').trim();
  let arr = env ? env.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>0) : [700, 1500, 2500];
  if (query && (query.quick === '1' || query.quick === 1)) arr = [500, 1000];
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
      const r = await withTimeout((signal)=>fetch(url, { headers, signal }), 3500);
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

  if (providerPref === 'theoddsapi'){
    if (!apiKeyOdds) return { error: 'Missing THEODDS_API_KEY for TheOddsAPI', provider: 'theoddsapi' };
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKeyOdds}`;
    const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${marketKey}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
    return { provider:'theoddsapi', mode:'forced', headers:{}, eventsUrl, propsTpl: propsTpl2 };
  }
  if (providerPref === 'rapidapi'){
    if (!(rapidHost && rapidKey && evTpl && propsTpl)) return { error: 'PROVIDER=rapidapi but missing RAPIDAPI_* envs', provider:'rapidapi' };
    return { provider:'rapidapi', mode:'forced', headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost }, eventsUrl: evTpl.replace('{DATE}', date), propsTpl };
  }

  if (rapidHost && rapidKey && evTpl && propsTpl){
    return { provider:'rapidapi', mode:'auto', headers: { 'x-rapidapi-key': rapidKey, 'x-rapidapi-host': rapidHost }, eventsUrl: evTpl.replace('{DATE}', date), propsTpl };
  }
  if (!apiKeyOdds) return { error: 'No provider configured: set THEODDS_API_KEY or RAPIDAPI_* envs', provider:'auto' };
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${region}&dateFormat=iso&apiKey=${apiKeyOdds}`;
  const propsTpl2 = `https://api.the-odds-api.com/v4/sports/${sport}/events/{EVENT_ID}/odds?regions=${region}&markets=${marketKey}&oddsFormat=american&dateFormat=iso&apiKey=${apiKeyOdds}`;
  return { provider:'theoddsapi', mode:'auto', headers:{}, eventsUrl, propsTpl: propsTpl2 };
}

function median(arr){
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return a.length%2 ? a[mid] : Math.round((a[mid-1]+a[mid])/2);
}

exports.handler = async (event, context) => {
  return { statusCode: 202, body: JSON.stringify({ ok:true, note:'Background job concept stub. Use non-background function for actual fetch.' }) };
};
