import { getBlobsStore, openStore, getSafeStore, makeStore } from './_blobs.js';
import { getStore } from '@netlify/blobs';
import { pitcherHRMultiplier } from './lib/hrPitcherMultiplier.js';
import { parkHRFactorForAbbrev } from './lib/parkFactors.js';
import { weatherHRMultiplier } from './lib/weatherMultiplier.js';

/**
 * Clean ESM version of mlb-slate-lite.mjs
 * - Safe braces/blocks
 * - Fast-fail timeouts on upstream fetches
 * - 15 min cache in Netlify Blobs (slates/{date}.json)
 * - Same math: baseline × pitcher × park × weather → per-game HR%
 */
const SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=";
const TEAMS    = (season)=> `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`;
const ROSTER   = (tid)=> `https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active`;
const PEOPLE   = (ids, season)=> `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=stats(group=hitting,type=season,season=${season})`;

function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }

async function fetchJSON(url, { timeoutMs=6000 } = {}){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const r = await fetch(url, { headers:{ "accept":"application/json" }, signal: controller.signal });
    if(!r.ok) throw new Error(`http ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function seasonFromET(d=new Date()){
  const et = new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric" }).format(d);
  return Number(et) || (new Date().getFullYear());
}
function dateET(d=new Date()){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}

async function getProbablePitcherMap(games){
  const out = new Map(); // teamId -> { pitcherId, name, hand }
  for(const g of (games||[])){
    const gamePk = g?.gamePk;
    if(!gamePk) continue;
    try{
      const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
      const homeId = g?.teams?.home?.team?.id;
      const awayId = g?.teams?.away?.team?.id;
      const probHome = feed?.gameData?.probablePitchers?.home?.id || g?.teams?.home?.probablePitcher?.id;
      const probAway = feed?.gameData?.probablePitchers?.away?.id || g?.teams?.away?.probablePitcher?.id;
      const homeName = feed?.gameData?.probablePitchers?.home?.fullName || null;
      const awayName = feed?.gameData?.probablePitchers?.away?.fullName || null;
      const homeHand = feed?.liveData?.boxscore?.teams?.home?.players?.[probHome?`ID${probHome}`:'']?.person?.pitchHand?.code || null;
      const awayHand = feed?.liveData?.boxscore?.teams?.away?.players?.[probAway?`ID${probAway}`:'']?.person?.pitchHand?.code || null;
      if(homeId && probAway) out.set(homeId, { pitcherId:probAway, name:awayName, hand:awayHand });
      if(awayId && probHome) out.set(awayId, { pitcherId:probHome, name:homeName, hand:homeHand });
    }catch{ /* ignore single game failures */ }
  }
  return out;
}

async function extractWeatherForGame(game){
  try{
    const gamePk = game?.gamePk;
    if(!gamePk) return { tempF:null, windOutMph:null, precip:false };
    const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    const w = feed?.gameData?.weather || {};
    const tempF = typeof w?.temp === 'number' ? w.temp : null;
    let windOutMph = null;
    if(typeof w?.windSpeed === 'number'){
      const dir = String(w?.windDirection||'').toLowerCase();
      const towardCF = /out.*center|out.*cf/.test(dir);
      const fromCF   = /in.*center|in.*cf/.test(dir);
      windOutMph = towardCF ? w.windSpeed : (fromCF ? -w.windSpeed : 0);
    }
    const precip = String(w?.condition||'').toLowerCase().includes('rain');
    return { tempF, windOutMph, precip };
  }catch{
    return { tempF:null, windOutMph:null, precip:false };
  }
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || dateET(new Date());
    const season = Number(url.searchParams.get("season")) || seasonFromET(new Date());
    const priorPA = Number(url.searchParams.get("priorPA")) || 60;
    const priorHRrate = Number(url.searchParams.get("priorHR")) || 0.04;
    const expPA = Number(url.searchParams.get("expPA")) || 4.1;
    const capProb = Number(url.searchParams.get("cap")) || 0.40;

    // Cache check (15 min)
    const cache = getStore('mlb-learning');
    const cacheKey = `slates/${date}.json`;
    try{
      const cached = await cache.get(cacheKey, { type:'json' });
      if(cached && typeof cached.ts==='number' && (Date.now() - cached.ts) < 15*60*1000){
        return ok(cached.payload);
      }
    }catch{ /* no cache */ }

    // 1) Schedule
    const sched = await fetchJSON(SCHEDULE + encodeURIComponent(date));
    const games = (sched?.dates?.[0]?.games)||[];
    if(games.length===0){
      const payload = { ok:true, date, games:0, candidates:[] };
      try{ await cache.set(cacheKey, JSON.stringify({ ts: Date.now(), payload })); }catch{}
      return ok(payload);
    }

    // 2) Teams map
    const teamsJ = await fetchJSON(TEAMS(season));
    const abbrevById = new Map();
    for(const t of (teamsJ?.teams||[])){
      abbrevById.set(t.id, t.abbreviation || t.teamCode || t.clubName || t.name);
    }

    // 3) Build team -> opp mapping
    const mapTeamToGame = new Map();
    for(const g of games){
      const home = g?.teams?.home?.team?.id;
      const away = g?.teams?.away?.team?.id;
      if(!home || !away) continue;
      mapTeamToGame.set(home, { oppId: away, game: g, side:"home" });
      mapTeamToGame.set(away, { oppId: home, game: g, side:"away" });
    }

    // 4) Rosters
    const teamIds = [...new Set(games.flatMap(g => [g?.teams?.home?.team?.id, g?.teams?.away?.team?.id]).filter(Boolean))];
    const rosterByTeam = new Map();
    for(const tid of teamIds){
      try{
        const r = await fetchJSON(ROSTER(tid));
        const hitters = (r?.roster||[]).filter(x => String(x?.position?.code).toUpperCase() !== "P");
        rosterByTeam.set(tid, hitters);
      }catch{ rosterByTeam.set(tid, []); }
    }

    // 5) Stats for hitters
    const allIds = [];
    for(const tid of teamIds){
      for(const r of (rosterByTeam.get(tid)||[])){
        const pid = r?.person?.id;
        if(pid) allIds.push(pid);
      }
    }
    const uniqueIds = [...new Set(allIds)];
    const chunks = [];
    for(let i=0;i<uniqueIds.length;i+=100) chunks.push(uniqueIds.slice(i,i+100));
    const statById = new Map();
    for(const chunk of chunks){
      try{
        const pj = await fetchJSON(PEOPLE(chunk, season));
        for(const p of (pj?.people||[])){
          const id = p?.id;
          const name = p?.fullName || p?.firstLastName || p?.lastFirstName;
          let hr=0, pa=0;
          for(const s of (p?.stats||[])){
            for(const sp of (s?.splits||[])){
              hr += Number(sp?.stat?.homeRuns||0);
              pa += Number(sp?.stat?.plateAppearances||0);
            }
          }
          statById.set(id, { name, hr, pa });
        }
      }catch{ /* skip chunk on failure */ }
    }

    // 6) Multiplier sources
    const learn = getStore('mlb-learning');
    const teamToProbPitcher = await getProbablePitcherMap(games);
    const weatherByGamePk = new Map();
    for(const g of games){ weatherByGamePk.set(g.gamePk, await extractWeatherForGame(g)); }

    // 7) Build candidates
    const candidates = [];
    for(const tid of teamIds){
      const meta = mapTeamToGame.get(tid);
      if(!meta) continue;
      const oppId = meta.oppId;
      const teamAb = abbrevById.get(tid) || "TEAM";
      const oppAb  = abbrevById.get(oppId) || "OPP";
      for(const r of (rosterByTeam.get(tid)||[])){
        const pid = r?.person?.id;
        const st  = statById.get(pid);
        if(!st) continue;
        const seasonHR = Number(st.hr||0);
        const seasonPA = Number(st.pa||0);
        if(seasonPA <= 0) continue;

        // baseline per-PA
        const adjHR = seasonHR + priorPA * priorHRrate;
        const adjPA = seasonPA + priorPA;
        const p_pa = Math.max(0, Math.min(0.15, adjHR / adjPA));

        // pitcher multiplier
        let pitcherMult = 1.00, pitcherName=null, pitcherHand=null;
        try{
          const info = teamToProbPitcher.get(oppId);
          if(info && info.pitcherId){
            const prof = await learn.get(`profiles/pitcher/${info.pitcherId}.json`, { type:'json' }) || null;
            if(prof && typeof prof.samples==='number' && typeof prof.hr==='number'){
              pitcherMult = pitcherHRMultiplier({ samples: prof.samples, hr: prof.hr });
            }
            pitcherName = info.name || null;
            pitcherHand = info.hand || null;
          }
        }catch{ /* stay at 1.00 */ }

        // park + weather multipliers (home park)
        const homeAbbrev = meta.side==="home" ? teamAb : oppAb;
        const parkHRMult = parkHRFactorForAbbrev(homeAbbrev);
        const wx = weatherByGamePk.get(meta.game?.gamePk) || {};
        const weatherHRMult = weatherHRMultiplier(wx);

        // per-game prob
        const p_pa_adj = Math.max(0, Math.min(0.15, p_pa * pitcherMult * parkHRMult * weatherHRMult));
        const p_game = 1 - Math.pow(1 - p_pa_adj, expPA);
        const baseProb = Math.min(capProb, Math.max(0.001, p_game));

        candidates.push({
          name: st.name || r?.person?.fullName || "Batter",
          team: teamAb,
          opp: oppAb,
          gameId: meta.side==="home" ? `${oppAb}@${teamAb}` : `${teamAb}@${oppAb}`,
          batterId: pid,
          seasonHR, seasonPA,
          baseProb,
          pitcherName, pitcherHand,
          parkHR: parkHRMult,
          weatherHR: weatherHRMult
        });
      }
    }

    const payload = { ok:true, date, games: games.length, candidates };
    try{ await cache.set(cacheKey, JSON.stringify({ ts: Date.now(), payload })); }catch{ /* ignore cache errors */ }
    return ok(payload);
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
