#!/usr/bin/env node

// Format injuries per game for a specific week using the generator's POST input.
// Usage: node scripts/format_injury_by_week.mjs 2025 6 > reports/injury-impacts-week6.md

import fetch from 'node-fetch';

const [,, seasonArg, weekArg] = process.argv;
const SEASON = seasonArg || '2025';
const WEEK = Number(weekArg || '6');
const GEN_URL = process.env.GEN_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate';
const SCHED_URL = process.env.SCHED_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-schedule-get';

function fmtPts(x) { if (x===null||x===undefined||isNaN(x)) return '0.0 pts'; const n=Number(x); const s=n>=0?`+${n.toFixed(1)}`:n.toFixed(1); return `${s} pts`; }
function titleCase(s){ if(!s) return 'Unknown'; return String(s).charAt(0).toUpperCase()+String(s).slice(1).toLowerCase(); }
function dedupeAndSortAdjustments(adjs){ if(!Array.isArray(adjs)) return []; const m=new Map(); for(const a of adjs){ const key=(a.player||a.name||`${a.position||''}:${a.status||''}`).trim(); const prev=m.get(key); if(!prev||Math.abs(a.impact||0)>Math.abs(prev.impact||0)) m.set(key,a);} const out=[...m.values()]; out.sort((a,b)=>Math.abs(b.impact||0)-Math.abs(a.impact||0)); return out; }

function printTeamBlock(teamCode, ia, options={}){
  const { maxItems=8, minAbs=0.1, includeZeros=false } = options;
  const total = ia?.totalImpact ?? 0;
  const adjustments = dedupeAndSortAdjustments(ia?.adjustments||[]);
  console.log(`${teamCode} (${fmtPts(total)})`);
  let printed=0;
  for(const adj of adjustments){
    const impact = Number(adj.impact||0);
    if(!includeZeros && Math.abs(impact)<minAbs) continue;
    const name = adj.player || adj.name || 'Unknown Player';
    const status = titleCase(adj.status || 'Unknown');
    console.log(`${name} (${status}) ${fmtPts(impact)}`);
    if(++printed>=maxItems) break;
  }
  if(printed===0) console.log('—');
}

function getTeamAbbr(name){
  const map={ 'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LAR','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS' };
  return map[name]||name;
}

(async()=>{
  try{
    // 1) Fetch the schedule and filter week
    const schedRes = await fetch(`${SCHED_URL}?season=${SEASON}`);
    if(!schedRes.ok) throw new Error(`schedule ${schedRes.status}`);
    const sched = await schedRes.json();
    const all = (sched.matchups||sched.games||[]);
    const weekGames = all.filter(g=>Number(g.week||g.weekNumber||g.week_number)===WEEK).map(g=>({
      game_id: g.id || `${g.away||g.awayTeam}_${g.home||g.homeTeam}`,
      home_team: getTeamAbbr(g.home||g.homeTeam),
      away_team: getTeamAbbr(g.away||g.awayTeam),
      start: g.kickoff||g.start
    }));
    if(!weekGames.length){
      console.warn(`No games found for season ${SEASON} week ${WEEK} via schedule; falling back to current week from generator GET`);
      const fallbackRes = await fetch(`${GEN_URL}?season=${SEASON}`, { method:'GET' });
      if(!fallbackRes.ok) throw new Error(`generator fallback ${fallbackRes.status}`);
      const fb = await fallbackRes.json();
      const games = fb?.predictions || [];
      for(const g of games){
        const homeIA = g.teamStats?.home?.injuryImpact || g.modelEnhancements?.injuryAnalysis?.home || null;
        const awayIA = g.teamStats?.away?.injuryImpact || g.modelEnhancements?.injuryAnalysis?.away || null;
        console.log(`${g.away_team} vs ${g.home_team}`);
        if(awayIA) printTeamBlock(g.away_team, awayIA); else { console.log(`${g.away_team} (+0.0 pts)`); console.log('—'); }
        if(homeIA) printTeamBlock(g.home_team, homeIA); else { console.log(`${g.home_team} (+0.0 pts)`); console.log('—'); }
        console.log('');
      }
      process.exit(0);
    }

    // 2) Ask the generator for these games specifically (POST)
    const genRes = await fetch(GEN_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ season: SEASON, games: weekGames }) });
    if(!genRes.ok) throw new Error(`generator ${genRes.status}`);
    const gen = await genRes.json();
    const games = gen?.predictions || [];

    // 3) Print games in requested format
    for(const g of games){
      const homeIA = g.teamStats?.home?.injuryImpact || g.modelEnhancements?.injuryAnalysis?.home || null;
      const awayIA = g.teamStats?.away?.injuryImpact || g.modelEnhancements?.injuryAnalysis?.away || null;
      console.log(`${g.away_team} vs ${g.home_team}`);
      if(awayIA) printTeamBlock(g.away_team, awayIA); else { console.log(`${g.away_team} (+0.0 pts)`); console.log('—'); }
      if(homeIA) printTeamBlock(g.home_team, homeIA); else { console.log(`${g.home_team} (+0.0 pts)`); console.log('—'); }
      console.log('');
    }
  }catch(e){
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
