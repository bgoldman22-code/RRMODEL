// netlify/functions/mlb-backfill-pitchers.mjs
// Backfill pitcher profiles (mlb-learning/profiles/pitcher/{id}.json) using MLB StatsAPI.
// Collects HR allowed and batters faced per pitcher from the MLB feeds for a date range.
//
// Usage examples:
//   /.netlify/functions/mlb-backfill-pitchers?start=2024-03-28&end=2024-10-01
//   /.netlify/functions/mlb-backfill-pitchers?start=2023-03-30&end=2023-10-05
//
// Run in multiple chunks to avoid timeouts (e.g., 10–14 day windows).
// Safe: returns 200 even on partial errors; aggregates incrementally.
//
// Notes:
// - We use game boxscore to get battersFaced per pitcher and ER/H/HR allowed totals.
// - We also read the play-by-play to ensure HR attribution is correct (home_run events).
// - Result fields updated per pitcher profile: samples (batters faced), hr (home runs allowed).
// - Adds `lastUpdated` and `backfill:{ from, to }` markers.

import { getStore } from '@netlify/blobs';

function ok(data){ return new Response(JSON.stringify(data), { headers:{ 'content-type':'application/json' }}); }
function ymd(d){ return new Date(d).toISOString().slice(0,10); }
function clampDate(s){ return String(s||'').slice(0,10); }
function addCount(map, key, by=1){ if(!key) return; map[key]=(map[key]||0)+by; }

async function j(url){
  const r = await fetch(url, { headers:{ 'accept':'application/json' } });
  if(!r.ok) throw new Error(`http ${r.status}`);
  return r.json();
}

function eachDate(start, end){
  const out=[];
  const d0 = new Date(start+"T00:00:00Z");
  const d1 = new Date(end+"T00:00:00Z");
  for(let t=d0.getTime(); t<=d1.getTime(); t+=24*60*60*1000){
    out.push(new Date(t).toISOString().slice(0,10));
  }
  return out;
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const start = clampDate(url.searchParams.get('start'));
    const end   = clampDate(url.searchParams.get('end') || start);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)) return ok({ ok:false, error:'bad-start' });
    if(!/^\d{4}-\d{2}-\d{2}$/.test(end))   return ok({ ok:false, error:'bad-end' });
    const store = getStore('mlb-learning');

    let days = eachDate(start, end);
    let updatedPitchers = new Set();
    let gamesProcessed = 0, errors = 0;

    for(const d of days){
      try{
        const sched = await j(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(d)}`);
        const games = (sched?.dates?.[0]?.games)||[];
        for(const g of games){
          try{
            const gamePk = g?.gamePk;
            if(!gamePk) continue;
            // Boxscore for samples
            const box = await j(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
            const allPitchers = Object.assign({}, box?.teams?.home?.players || {}, box?.teams?.away?.players || {});
            // Play-by-play for HR allowed per pitcher (for safety, though box has HR too)
            const feed = await j(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
            const plays = feed?.liveData?.plays?.allPlays || [];
            const hrByPitcher = {};
            for(const p of plays){
              if((p?.result?.eventType||'') !== 'home_run') continue;
              const pid = p?.matchup?.pitcher?.id;
              if(typeof pid === 'number') hrByPitcher[pid] = (hrByPitcher[pid]||0) + 1;
            }

            // Aggregate per pitcher
            for(const k of Object.keys(allPitchers)){
              const obj = allPitchers[k];
              const pid = obj?.person?.id;
              if(!pid) continue;
              const stats = obj?.stats || {};
              const battersFaced = Number(stats?.battersFaced || 0);
              const hrAllowedBox = Number(stats?.homeRuns || 0);
              const hrAllowedPbp = Number(hrByPitcher[pid]||0);
              const hrAllowed = Math.max(hrAllowedBox, hrAllowedPbp); // prefer boxscore total

              if(battersFaced>0 || hrAllowed>0){
                const key = `profiles/pitcher/${pid}.json`;
                const prof = await store.get(key, { type:'json' }) || { samples:0, hr:0, vsPitchType:{}, zoneBucket:{}, lastUpdated:null };
                prof.samples = Number(prof.samples||0) + battersFaced;
                prof.hr      = Number(prof.hr||0) + hrAllowed;
                prof.lastUpdated = new Date().toISOString();
                prof.backfill = { from:start, to:end };
                await store.setJSON(key, prof);
                updatedPitchers.add(pid);
              }
            }

            gamesProcessed += 1;
          }catch{ errors += 1; /* continue next game */ }
        }
      }catch{ errors += 1; /* continue next day */ }
    }

    return ok({ ok:true, start, end, gamesProcessed, pitchersUpdated: updatedPitchers.size, errors });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
