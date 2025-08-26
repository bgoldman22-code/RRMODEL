// netlify/functions/odds-hits2.mjs
// Player 2+ hits via per-event odds endpoint.
// Tries multiple market keys and normalizes to the shortest absolute American price per player per game.

export default async function handler(request){
  try{
    const url = new URL(request.url);
    const league = (url.searchParams.get('league') || 'mlb').toLowerCase();
    const regions = url.searchParams.get('regions') || 'us';
    const oddsFormat = url.searchParams.get('oddsFormat') || 'american';
    const bookmakers = url.searchParams.get('bookmakers') || '';
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10)));
    const sport = toOddsSport(league);
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
    if(!apiKey) return resp({ ok:false, usingOddsApi:false, reason:'no api key' }, 200);

    // 1) List upcoming events
    const evUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events?apiKey=${encodeURIComponent(apiKey)}`;
    const er = await fetch(evUrl, { headers:{ 'accept':'application/json' } });
    if(!er.ok) return resp({ ok:false, usingOddsApi:false, reason:`events http ${er.status}` }, 200);
    const events = (await er.json()).slice(0, limit);

    // 2) For each event, request odds for hits markets
    const targetMarkets = [
      'batter_hits', 'batter_hits_over_under', 'batter_hits_alternate',
      'player_hits', 'player_hits_over_under', 'player_2+_hits'
    ];
    const outRows = [];
    const quota = { remaining:null, used:null, reset:null };

    const chunks = chunk(events, 6);
    for(const group of chunks){
      const per = group.map(async ev => {
        for(const key of targetMarkets){
          const qs = new URLSearchParams({ apiKey, regions, oddsFormat, markets:key, includeLinks:'false' });
          if(bookmakers) qs.set('bookmakers', bookmakers);
          const ou = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(ev.id)}/odds?${qs.toString()}`;
          const r = await fetch(ou, { headers:{ 'accept':'application/json' } });
          quota.remaining = r.headers.get('x-requests-remaining') ?? quota.remaining;
          quota.used = r.headers.get('x-requests-used') ?? quota.used;
          quota.reset = r.headers.get('x-requests-reset') ?? quota.reset;
          if(!r.ok) continue;
          const data = await r.json();

          let found = false;
          for(const bk of (data.bookmakers||[])){
            for(const mk of (bk.markets||[])){
              if(!mk || !mk.key || !mk.outcomes) continue;
              const mkKey = String(mk.key).toLowerCase();
              if(!(mkKey.includes('hits'))) continue;
              for(const out of mk.outcomes){
                const desc = String(out?.description || out?.point || '').toLowerCase();
                const isTwoPlus = /2\+/.test(desc) || /over\s*1\.5/.test(desc) || /two\+/.test(desc) || /2 plus/.test(desc);
                if(!isTwoPlus) continue;
                if(!out?.name || out.price == null) continue;
                outRows.push({
                  eventId: ev.id,
                  commence_time: data.commence_time || ev.commence_time,
                  home_team: data.home_team || ev.home_team,
                  away_team: data.away_team || ev.away_team,
                  bookmaker: bk.key,
                  market: mk.key,
                  player: out.name,
                  description: out.description || 'over 1.5',
                  price: Number(out.price)
                });
                found = true;
              }
            }
          }
          if(found) break;
        }
      });
      await Promise.all(per);
    }

    const usingOddsApi = outRows.length > 0;
    return resp({ ok:true, usingOddsApi, reason: usingOddsApi ? 'ok' : 'empty', rows: outRows, quota }, 200);
  }catch(err){
    return resp({ ok:false, usingOddsApi:false, reason:String(err) }, 200);
  }
}

function chunk(arr, n){
  const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out;
}
function toOddsSport(league){
  switch(league){
    case 'mlb':
    case 'baseball': return 'baseball_mlb';
    default: return 'baseball_mlb';
  }
}
function resp(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
  });
}
