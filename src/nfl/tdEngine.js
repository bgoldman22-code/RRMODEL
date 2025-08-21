// src/nfl/tdEngine.js
// Anytime TD model engine (RZ + Explosive) with vulture handling.
// Uses 3 seasons of aggregates (2022-2024) from data/nfl-td/pbp-aggregates-2022-2024.json
export const YEARS_BACK = 3;

import pbpAgg from '../../data/nfl-td/pbp-aggregates-2022-2024.json';
import depthCharts from '../../data/nfl-td/depth-charts.json';
import tendencies from '../../data/nfl-td/team-tendencies.json';
import defOpp from '../../data/nfl-td/opponent-defense.json';
import explosive from '../../data/nfl-td/player-explosive.json';

function posOf(player) {
  return (explosive[player]?.pos) || 
         (Object.entries(depthCharts).find(([team, dc]) => 
            (dc.QB||[]).includes(player) || (dc.RB||[]).includes(player) || (dc.WR||[]).includes(player) || (dc.TE||[]).includes(player)
          ) && (
            (depthCharts[RegExp.$1]?.QB||[]).includes(player) ? 'QB' :
            (depthCharts[RegExp.$1]?.RB||[]).includes(player) ? 'RB' :
            (depthCharts[RegExp.$1]?.WR||[]).includes(player) ? 'WR' : 'TE'
          )) || 'WR';
}

function shareByDepth(team, position, player) {
  const dc = depthCharts[team] || {};
  const arr = (dc[position] || []);
  const idx = arr.indexOf(player);
  if (idx === -1) return 0.0;
  // simple diminishing shares by depth
  const base = [0.62, 0.28, 0.10, 0.05]; // WR up to 4th
  const baseRB = [0.68, 0.24, 0.08];
  const baseTE = [0.70, 0.30, 0.15];
  if (position === 'RB') return baseRB[idx] || 0.02;
  if (position === 'TE') return baseTE[idx] || 0.05;
  if (position === 'QB') return 1.0;
  return base[idx] || 0.03;
}

function combineProb(pRz, pExp, vPenalty, weights) {
  const { w_rz=0.65, w_exp=0.30 } = weights || {};
  let p = w_rz * pRz + w_exp * pExp;
  p = Math.max(0, p - vPenalty);
  // cap
  return Math.min(p, 0.85);
}

function fmtPct(x){ return Math.round(x*1000)/10; }

export function buildWeekCandidates(week, games) {
  const results = [];
  const w = tendencies._weights || { w_rz: 0.65, w_exp: 0.30, w_vult: 0.05 };

  games.forEach(g => {
    const home = g.home, away = g.away;
    const teams = [away, home];
    teams.forEach(team => {
      const opp = (team === home) ? away : home;
      const teamAgg = pbpAgg.teams[team] || { rz_trips_pg: 2.7, exp_rush_rate: 0.10, exp_rec_rate: 0.12, vulture_prob: 0.06 };
      const oppDef = defOpp[opp] || { allow_rz_td_rate:{RB:0.47,WR:0.27,TE:0.22,QB:0.04}, exp_allow:{rush:0.11,rec:0.12} };
      const tend = tendencies[team] || { rz_pos_share:{RB:0.45,WR:0.30,TE:0.20,QB:0.05}, inside5_bias:{RB:0.55,QB:0.15,TE:0.20,WR:0.10} };

      // candidate players from depth chart top options
      const dc = depthCharts[team] || {};
      const cand = [].concat(dc.RB||[], dc.WR||[], dc.TE||[], (dc.QB||[]).slice(0,1));

      cand.forEach(player => {
        const P = posOf(player);
        const share = shareByDepth(team, P, player);
        const rzTrips = teamAgg.rz_trips_pg || 2.7;
        const posShare = tend.rz_pos_share[P] || 0.2;
        const allowPos = oppDef.allow_rz_td_rate[P] || 0.2;
        const roleWeight = (P==='QB') ? 0.35 : (P==='RB' ? 1.0 : 0.8);
        const pRZ = (rzTrips/3.0) * posShare * share * allowPos * roleWeight; // calibrated scale

        const expOpp = (P==='RB') ? oppDef.exp_allow.rush : oppDef.exp_allow.rec;
        const playerExp = (explosive[player]?.explosive_idx || 0.18);
        const pExp = expOpp * playerExp * 0.9; // mild dampener to avoid double counting

        const vult = (teamAgg.vulture_prob || 0.05) * (P==='RB' ? 0.6 : (P==='TE'?0.2:0.1)) * (share < 0.5 ? 0.6 : 1.0);
        const pTD = combineProb(pRZ, pExp, w.w_vult * vult, w);

        const why = [
          `RZ trips ~${rzTrips.toFixed(1)}`,
          `${P} share ${Math.round(share*100)}%`,
          `vs ${opp} RZ allow ${Math.round((allowPos)*100)}%`,
          `explosive idx ${Math.round(playerExp*100)}`
        ].join(' • ');

        results.push({
          week, game: `${away}@${home}`, team, opp, player, pos: P,
          td_prob: pTD, paths: { rz: pRZ, exp: pExp }, why
        });
      });
    });
  });

  // rank within games and overall
  const byGame = {};
  results.forEach(r => {
    byGame[r.game] = byGame[r.game] || [];
    byGame[r.game].push(r);
  });
  Object.values(byGame).forEach(arr => arr.sort((a,b)=>b.td_prob-a.td_prob));
  const overall = [...results].sort((a,b)=>b.td_prob-a.td_prob);
  return { overall, byGame, diagnostics: { years_used: YEARS_BACK, pbp_ok: !!pbpAgg?.meta } };
}
