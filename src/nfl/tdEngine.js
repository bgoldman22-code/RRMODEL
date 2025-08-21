// src/nfl/tdEngine.js
// Baseline Anytime TD engine (RZ + Explosive) with odds-agnostic fallback.
// Works even if offers == [] by using local 3yr aggregates & tendencies.
// Exports both default and named for import flexibility.

import pbpAgg from '../../data/nfl-td/pbp-aggregates-2022-2024.json';
import tendencies from '../../data/nfl-td/team-tendencies.json';
import oppDef from '../../data/nfl-td/opponent-defense.json';
import depth from '../../data/nfl-td/depth-charts.json';
import playerExp from '../../data/nfl-td/player-explosive.json';

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function nz(x, v=0) { return (x===undefined || x===null || Number.isNaN(x)) ? v : x; }

function teamKey(code){ return code; }

function playerListForTeam(team){
  const dc = depth[team];
  if(!dc) return [];
  const out = [];
  const add = (pos, name, share=1) => { if(name){ out.push({player:name, pos, share}); } };
  // Basic extraction; adjust as needed based on your depth-charts.json structure
  ['RB1','RB2','FB','WR1','WR2','WR3','WR4','TE1','TE2','QB1'].forEach(k=>{
    const name = dc[k];
    if(name) add(k.replace(/[0-9]/g,''), name, 1);
  });
  return out;
}

function modelForTeamVs(team, opp){
  const tkey = teamKey(team);
  const okey = teamKey(opp);
  const agg = pbpAgg[tkey] || {};
  const tend = tendencies[tkey] || { w_rz:0.65, w_exp:0.3, w_vult:0.05, rz_pos_share:{RB:0.5, WR:0.35, TE:0.12, QB:0.03} };
  const od = oppDef[okey] || { rz_allow:{RB:0.35, WR:0.3, TE:0.28, QB:0.07}, exp_allow:{rush:0.08, rec:0.09} };
  const rzTrips = nz(agg.rz_trips_pg, 3.0);
  const vultureProb = clamp(nz(agg.vulture_prob, 0.08), 0, 0.3);
  return { rzTrips, tend, od, vultureProb };
}

function posOf(k){
  if(k.startsWith('RB')) return 'RB';
  if(k.startsWith('WR')) return 'WR';
  if(k.startsWith('TE')) return 'TE';
  if(k.startsWith('QB')) return 'QB';
  if(k==='FB') return 'RB';
  return 'WR';
}

function playerExplosiveIdx(name, pos){
  const p = playerExp[name];
  if(!p) return 0.5;
  // Map 0-100 to 0-1
  if(typeof p.explosive_idx === 'number') return clamp(p.explosive_idx/100, 0, 1);
  // or compute from components if available
  return clamp(nz(p.deep_share,0.1)*0.4 + nz(p.yac_per_tgt,0.2)*0.3 + nz(p.breakaway,0.1)*0.3, 0, 1);
}

function buildCandidatesForGame(game){
  const { away, home } = game;
  const rows = [];

  const teams = [
    { atk: away, def: home, game: `${away} @ ${home}`, side:'away' },
    { atk: home, def: away, game: `${away} @ ${home}`, side:'home' }
  ];

  teams.forEach(({atk, def, game})=>{
    const { rzTrips, tend, od, vultureProb } = modelForTeamVs(atk, def);
    const pool = playerListForTeam(atk);
    // Assign naive internal depth shares by position
    const posDepthShares = { RB: [0.6, 0.3, 0.1], WR: [0.4,0.3,0.2,0.1], TE: [0.75,0.25], QB:[1.0] };

    // Build position-index list from depth keys order
    const dc = depth[atk] || {};
    const ordered = [];
    ['RB1','RB2','FB','WR1','WR2','WR3','WR4','TE1','TE2','QB1'].forEach(key=>{
      if(dc[key]) ordered.push({name:dc[key], key});
    });

    ordered.forEach(({name, key}, idx)=>{
      const pos = posOf(key);
      const posShare = nz((tend.rz_pos_share||{})[pos], 0.2);
      const depthIdx = (pos==='RB') ? ['RB1','RB2','FB'].indexOf(key) :
                       (pos==='WR') ? ['WR1','WR2','WR3','WR4'].indexOf(key) :
                       (pos==='TE') ? ['TE1','TE2'].indexOf(key) :
                       (pos==='QB') ? 0 : 0;
      const depthArray = posDepthShares[pos] || [1];
      const depthShare = depthArray[depthIdx] ?? depthArray[depthArray.length-1] ?? 1;

      // RZ path
      const posRzAllow = nz((od.rz_allow||{})[pos], 0.28);
      const P_RZ = clamp(rzTrips/4.0 * posShare * depthShare * posRzAllow, 0, 0.8);

      // EXP path
      const expIdx = playerExplosiveIdx(name, pos); // 0..1
      const expAllow = (pos==='RB') ? nz((od.exp_allow||{}).rush, 0.08) : nz((od.exp_allow||{}).rec, 0.09);
      const P_EXP = clamp(expAllow * (0.5 + 0.8*expIdx), 0, 0.5);

      // Vulture
      const vultPenalty = (pos==='RB') ? vultureProb * (depthIdx>0 ? 0.4 : 0.15) : 0.0;

      const w_rz = nz(tend.w_rz, 0.65), w_exp = nz(tend.w_exp, 0.30), w_vult = nz(tend.w_vult, 0.05);
      let P_TD = clamp(w_rz*P_RZ + w_exp*P_EXP - w_vult*vultPenalty, 0, 0.95);

      rows.push({
        player: name,
        team: atk,
        game,
        model_td_pct: P_TD,
        rz_path_pct: clamp(P_RZ, 0, 1),
        exp_path_pct: clamp(P_EXP, 0, 1),
        why: buildWhy({name, pos, P_RZ, P_EXP, posShare, expIdx, od})
      });
    });
  });

  // Sort by model probability and return top n
  rows.sort((a,b)=> b.model_td_pct - a.model_td_pct);
  return rows.slice(0, 30);
}

function buildWhy({name, pos, P_RZ, P_EXP, posShare, expIdx, od}){
  const bits = [];
  if(P_RZ > 0.10) bits.push('strong RZ share');
  if(P_EXP > 0.06) bits.push('live for explosive play');
  if(posShare >= 0.4) bits.push('team favors this position in RZ');
  const vsTag = (od && od.rz_allow && od.rz_allow[pos]) ? `vs RZ allow ${(od.rz_allow[pos]*100).toFixed(0)}%` : null;
  if(vsTag) bits.push(vsTag);
  if(expIdx >= 0.6) bits.push('high explosive index');
  return bits.slice(0,3).join(' • ') || 'balanced profile';
}

/**
 * tdEngine
 * @param {Array} games - [{ away, home, date }]
 * @param {Object} opts - { offers?: [], usingOdds?: boolean }
 * @returns Array of candidate rows
 */
export function tdEngine(games, opts={}){
  const list = Array.isArray(games) ? games : [];
  if(list.length===0) return [];
  try{
    const rows = list.flatMap(g => buildCandidatesForGame(g));
    return rows;
  }catch(err){
    console.error('[tdEngine] error', err);
    return [];
  }
}

export default tdEngine;
