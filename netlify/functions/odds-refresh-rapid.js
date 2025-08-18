// netlify/functions/odds-refresh-rapid.js (CommonJS)
// Restores TheOddsAPI HR market snapshot with fallbacks and writes to Netlify Blobs.
const { getStore } = require("@netlify/blobs");

function initStore(){
  const name = process.env.BLOBS_STORE || "mlb-odds";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}
function todayETISO(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function parseBackoff(){
  const s = (process.env.BACKOFF_MS||"").trim();
  if (!s) return [300,700,1200];
  return s.split(",").map(x=>parseInt(x.trim(),10)).filter(n=>n>0);
}
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function withTimeout(fn, ms){
  return new Promise((res,rej)=>{
    const ctl = new AbortController();
    const id = setTimeout(()=>{ try{ctl.abort();}catch{}; rej(new Error("timeout")); }, ms);
    fn(ctl.signal).then(v=>{ clearTimeout(id); res(v); }).catch(e=>{ clearTimeout(id); rej(e) });
  });
}
async function jsonFetch(url, headers, attempts){
  let last;
  for (const wait of attempts){
    try{
      const r = await withTimeout(sig=>fetch(url,{headers,signal:sig}), 7000);
      if (r.status===429){ last=new Error("429"); await sleep(wait); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    }catch(e){ last=e; await sleep(wait); }
  }
  throw last||new Error("fetch failed");
}
function normalizeName(s){
  return String(s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[.]/g,"").replace(/[’']/g,"'").trim();
}
function outcomePlayer(o){
  const fields=["description","participant","name","title","runner","label"];
  for (const f of fields){ if (o && o[f]) return String(o[f]); }
  return null;
}
function isOverOutcome(o){
  const nm = String(o?.name||o?.title||"").toLowerCase();
  if (nm.includes("over")) return true;
  if (typeof o?.over_under!=="undefined") return String(o.over_under).toLowerCase()==="over";
  return true; // runner-only style
}
function median(arr){
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y);
  const i = Math.floor(a.length/2);
  return a.length%2 ? a[i] : Math.round((a[i-1]+a[i])/2);
}

exports.handler = async (event) => {
  const store = initStore();
  const provider = (process.env.PROVIDER||"theoddsapi").toLowerCase();
  if (provider!=="theoddsapi"){
    return { statusCode: 400, body: JSON.stringify({ ok:false, step:"setup", error:"Set PROVIDER=theoddsapi", provider }) };
  }
  const apiKey = process.env.THEODDS_API_KEY;
  if (!apiKey){
    return { statusCode: 400, body: JSON.stringify({ ok:false, step:"setup", error:"Missing THEODDS_API_KEY" }) };
  }
  const sport   = process.env.ODDSAPI_SPORT_KEY || "baseball_mlb";
  const regions = String(process.env.ODDSAPI_REGION || "us,us2").split(",").map(s=>s.trim()).filter(Boolean);
  const primMarket = process.env.PROP_MARKET_KEY || "batter_home_runs";
  const fallbacks = [primMarket, "player_home_runs", "player_to_hit_a_home_run", "home_runs"];
  const attempts = parseBackoff();

  // events list
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?regions=${encodeURIComponent(regions.join(","))}&dateFormat=iso&apiKey=${apiKey}`;
  let events = [];
  try{
    const ej = await jsonFetch(eventsUrl, {}, attempts);
    events = Array.isArray(ej)? ej : [];
  }catch(e){
    await store.set("latest_error.json", JSON.stringify({ step:"events", error:String(e) }));
    return { statusCode: 502, body: JSON.stringify({ ok:false, step:"events", error:String(e) }) };
  }
  const ids = events.map(ev=> String(ev?.id||ev?.event_id||ev?.eventId||"")).filter(Boolean);
  if (!ids.length){
    await store.set("latest.json", JSON.stringify({ provider, regions, market:null, events:0, players:{}, markets:0, type:"HR_over_0_5", date: todayETISO() }));
    return { statusCode: 200, body: JSON.stringify({ ok:true, provider, regions, market:null, events:0, players:0, markets:0 }) };
  }

  const BOOKS = String(process.env.BOOKS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  let chosenMarket = null;
  let playersMap = new Map();
  let totalMarkets = 0;

  for (const market of fallbacks){
    const map = new Map();
    let mktsSeen = 0;
    for (const id of ids){
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${id}/odds?regions=${encodeURIComponent(regions.join(","))}&markets=${encodeURIComponent(market)}&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
      let data; try{ data = await jsonFetch(oddsUrl, {}, attempts); }catch(_e){ continue; }
      const bms = Array.isArray(data?.bookmakers) ? data.bookmakers : [];
      for (const bm of bms){
        const bookKey = String(bm?.key||bm?.title||"").toLowerCase();
        if (BOOKS.length && (!bookKey || !BOOKS.includes(bookKey))) continue;
        const mkts = bm?.markets || [];
        for (const mk of mkts){
          const key = (mk?.key||mk?.market||mk?.name);
          if (key !== market) continue;
          mktsSeen++;
          const outs = mk?.outcomes || [];
          for (const o of outs){
            if (!isOverOutcome(o)) continue;
            if (typeof o?.point!=="undefined"){
              const pt = Number(o.point);
              if (Number.isFinite(pt) && Math.abs(pt-0.5)>1e-6) continue;
            }
            const player = outcomePlayer(o);
            if (!player) continue;
            const american = Number(o.price||o.odds||o.american||0);
            if (!american) continue;
            const norm = normalizeName(player);
            const rec = map.get(norm) || { prices: [], by_book: {} };
            rec.prices.push(american);
            if (bookKey) rec.by_book[bookKey] = american;
            map.set(norm, rec);
          }
        }
      }
    }
    if (map.size){
      chosenMarket = market;
      playersMap = map;
      totalMarkets = mktsSeen;
      break;
    }
  }

  // Build snapshot
  const out = {};
  for (const [k, rec] of playersMap.entries()){
    out[k] = {
      median_american: median(rec.prices),
      by_book: rec.by_book,
      count_books: Object.keys(rec.by_book).length
    };
  }
  const snapshot = {
    date: todayETISO(),
    provider, regions, market: chosenMarket,
    events: ids.length, markets: totalMarkets,
    players: out,
    type: "HR_over_0_5"
  };
  await store.set("latest.json", JSON.stringify(snapshot));
  await store.set(`${todayETISO()}.json`, JSON.stringify(snapshot));

  return { statusCode: 200, body: JSON.stringify({ ok:true, provider, regions, market: chosenMarket, events: ids.length, players: Object.keys(out).length, markets: totalMarkets }) };
};
