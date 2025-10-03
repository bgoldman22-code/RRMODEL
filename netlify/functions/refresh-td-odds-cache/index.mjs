// netlify/functions/refresh-td-odds-cache/index.mjs
// Refresh NFL TD props odds cache using The Odds API, with name variants for robust matching
// Safe to run manually or via Netlify schedule

import fs from 'fs/promises';

const ODDS_CACHE_FILE = 'public/data/nfl-td-odds-cache.json';
const SPORT_KEY = 'americanfootball_nfl';
const MARKETS = ['player_anytime_td','player_1st_td','player_tds_over'];
const DEFAULT_BOOKS = 'fanduel,draftkings,betmgm,caesars,espnbet,betfanatics';

function jsonResponse(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  });
}

function toVariants(fullName){
  // Build keys that match model names like "T.Lockett" and common variations
  const out = new Set();
  const name = String(fullName || '').trim();
  if(!name) return out;
  out.add(name);
  const parts = name.split(/\s+/);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ') || '';
  if(first && last){
    const fi = first.charAt(0);
    out.add(`${fi}.${last}`);           // T.Lockett
    out.add(`${fi}${last}`);            // TLockett
    out.add(`${fi}. ${last}`);          // T. Lockett
    out.add(`${first[0]}. ${last}`);    // T. Lockett (same)
    out.add(`${first} ${last}`);        // Tyler Lockett (canonical)
  }
  // also lower/upper variants will be matched by caller via lookup, but include lowercase key too
  out.add(name.toLowerCase());
  return out;
}

export default async function handler(request){
  const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
  const bookmakers = new URL(request.url).searchParams.get('bookmakers') || DEFAULT_BOOKS;
  const regions = 'us';
  const oddsFormat = 'american';

  if(!apiKey){
    return jsonResponse({ success:false, reason:'missing_api_key' }, 200);
  }

  try{
    console.log('� Refreshing NFL TD odds via The Odds API');
    // 1) Get events list (window defaults to upcoming events)
    const evUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(SPORT_KEY)}/events?apiKey=${encodeURIComponent(apiKey)}&dateFormat=iso`;
    const evRes = await fetch(evUrl, { headers:{ 'accept':'application/json' } });
    if(!evRes.ok){
      return jsonResponse({ success:false, step:'events', status:evRes.status }, 200);
    }
    const events = await evRes.json();
    console.log(`🗓️ Found ${events.length} NFL events`);

    // 2) For each event, fetch markets
    const oddsByPlayer = {}; // nameKey -> { player_anytime_td:{books:{}}, ... }
    const quota = { remaining:null, used:null, reset:null };

    // modest concurrency
    const chunk = (arr,n)=>{ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; };
    const chunks = chunk(events, 6);
    for(const group of chunks){
      await Promise.all(group.map(async ev => {
        const qs = new URLSearchParams({
          apiKey, regions, oddsFormat, markets: MARKETS.join(','), includeLinks:'false', bookmakers
        });
        const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(SPORT_KEY)}/events/${encodeURIComponent(ev.id)}/odds?${qs.toString()}`;
        const r = await fetch(url, { headers:{ 'accept':'application/json' } });
        quota.remaining = r.headers.get('x-requests-remaining') ?? quota.remaining;
        quota.used = r.headers.get('x-requests-used') ?? quota.used;
        quota.reset = r.headers.get('x-requests-reset') ?? quota.reset;
        if(!r.ok) return;
        const data = await r.json();
        for(const bk of (data.bookmakers||[])){
          const bookKey = (bk.key || '').toLowerCase();
          for(const mk of (bk.markets||[])){
            const marketKey = mk.key; // expect one of MARKETS
            if(!MARKETS.includes(marketKey)) continue;
            for(const out of (mk.outcomes||[])){
              const player = out.description || out.name;
              const price = Number(out.price);
              if(!player || !Number.isFinite(price)) continue;
              const variants = toVariants(player);
              for(const v of variants){
                if(!oddsByPlayer[v]) oddsByPlayer[v] = {};
                if(!oddsByPlayer[v][marketKey]) oddsByPlayer[v][marketKey] = { books:{} };
                oddsByPlayer[v][marketKey].books[bookKey] = price;
              }
            }
          }
        }
      }));
    }

    // Primary count by canonical (non-variant) names
    const canonicalPlayers = new Set();
    for(const key of Object.keys(oddsByPlayer)){
      if(key.includes(' ')) canonicalPlayers.add(key);
    }

    const cache = {
      timestamp: new Date().toISOString(),
      player_count: canonicalPlayers.size || Object.keys(oddsByPlayer).length,
      refresh_type: 'manual',
      odds: oddsByPlayer,
      quota
    };

    await fs.mkdir('public/data', { recursive: true });
    await fs.writeFile(ODDS_CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Saved NFL TD odds cache with ${cache.player_count} players to ${ODDS_CACHE_FILE}`);

    return jsonResponse({ success:true, player_count: cache.player_count, quota, cache_file: ODDS_CACHE_FILE }, 200);
  }catch(err){
    console.error('❌ refresh-td-odds-cache error:', err);
    return jsonResponse({ success:false, error:String(err?.message||err) }, 200);
  }
}
