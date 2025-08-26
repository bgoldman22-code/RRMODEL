// netlify/functions/mlb-game-context.mjs
// Returns probable starter info + bullpen usage (last 3 days) for each team in a game.

export default async function handler(request){
  try{
    const url = new URL(request.url);
    const gamePk = url.searchParams.get('gamePk');
    if(!gamePk) return resp({ ok:false, message:'missing gamePk' }, 400);

    const feedUrl = `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
    const feed = await fetchJson(feedUrl);

    const gameData = feed?.gameData || {};
    const liveData = feed?.liveData || {};
    const teams = gameData?.teams || {};
    const homeId = teams?.home?.id, awayId = teams?.away?.id;

    const probable = gameData?.probablePitchers || {};
    const homeSP = probable?.home, awaySP = probable?.away;

    const out = { ok:true, gamePk, home: null, away: null };

    // Build per-side info
    out.home = await buildSide(homeId, homeSP);
    out.away = await buildSide(awayId, awaySP);

    return resp(out, 200);
  }catch(err){
    return resp({ ok:false, message:String(err) }, 200);
  }
}

async function buildSide(teamId, sp){
  if(!teamId) return null;
  const side = { teamId, starter:null, bullpen:null };
  // Starter details
  if(sp?.id){
    const pInfo = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${sp.id}?hydrate=stats(group=[pitching],type=[season],season=${new Date().getUTCFullYear()})`);
    const person = Array.isArray(pInfo?.people) ? pInfo.people[0] : null;
    const stat = person?.stats?.[0]?.splits?.[0]?.stat || {};
    const throws = (person?.pitchHand?.code || person?.pitchHand?.description || '?').toString().toUpperCase().slice(0,1);
    // battingAverage for pitchers is BAA allowed
    const baa = safeNum(stat?.battingAverage);
    const gs = safeNum(stat?.gamesStarted);
    const ip = safeNum(stat?.inningsPitched);
    const ipPerStart = (gs>0 && ip>0) ? (toInn(ip)/gs) : null;
    side.starter = {
      id: sp.id,
      name: person?.fullName || sp?.fullName || 'SP',
      throws,
      baa: (typeof baa === 'number' && !isNaN(baa)) ? +baa.toFixed(3) : null,
      ipPerStart: (typeof ipPerStart === 'number' && isFinite(ipPerStart)) ? +ipPerStart.toFixed(1) : null
    };
  }

  // Bullpen fatigue: sum RP innings from boxscores of last 3 days (excluding starter IP)
  let ip3d = 0;
  try{
    const end = new Date(); end.setUTCDate(end.getUTCDate()-1);
    const start = new Date(); start.setUTCDate(start.getUTCDate()-3);
    const s = start.toISOString().slice(0,10);
    const e = end.toISOString().slice(0,10);
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${s}&endDate=${e}`;
    const sched = await fetchJson(schedUrl);
    const dates = sched?.dates || [];
    for(const d of dates){
      for(const g of (d?.games||[])){
        const b = await fetchJson(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore`);
        const sideKey = (b?.teams?.home?.team?.id === teamId) ? 'home' : 'away';
        const pitchers = b?.teams?.[sideKey]?.pitchers || [];
        // Sum non-starter pitcher IP
        let starterId = null;
        for(const plId of pitchers){
          const p = b?.teams?.[sideKey]?.players?.[`ID${plId}`];
          if(p?.stats?.pitching?.gamesStarted) { starterId = plId; break; }
        }
        for(const plId of pitchers){
          if(plId === starterId) continue;
          const p = b?.teams?.[sideKey]?.players?.[`ID${plId}`];
          const ipStr = p?.stats?.pitching?.inningsPitched;
          ip3d += toInn(ipStr);
        }
      }
    }
  }catch{}

  const fatigueAdj = calcFatigueAdj(ip3d);
  side.bullpen = { ip3d: round1(ip3d), fatigueAdj };

  return side;
}

function calcFatigueAdj(ip3d){
  // 9 IP over 3 days ~ normal; every +3 IP ~ +3% to batter hits (more tired pen)
  // Cap 0.92–1.10
  const extra = Math.max(0, ip3d - 9);
  const adj = 1 + Math.min(0.10, extra * 0.01); // +1% per extra IP above 9
  return +(Math.min(1.10, Math.max(0.92, adj))).toFixed(3);
}

function toInn(ip){
  if(ip == null) return 0;
  if(typeof ip === 'number') return ip;
  const s = String(ip);
  if(s.includes('.')){
    const [whole, frac] = s.split('.');
    const w = parseInt(whole||'0',10);
    const f = parseInt(frac||'0',10);
    // .1 -> 1/3, .2 -> 2/3
    return w + (f===1?1/3 : f===2?2/3 : 0);
  }
  const n = Number(s); return isFinite(n)? n : 0;
}
function round1(x){ return Math.round(Number(x||0)*10)/10; }
function safeNum(x){ const n = Number(x); return isFinite(n)? n : null; }
async function fetchJson(u){
  const r = await fetch(u, { headers:{ 'accept':'application/json' }});
  const t = await r.text();
  try{ return JSON.parse(t); }catch{ return null; }
}
function resp(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
  });
}
