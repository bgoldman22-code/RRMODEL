// src/nfl/tdEngine.js
import agg from '../../data/nfl-td/pbp-aggregates-2022-2024.json';
import tendencies from '../../data/nfl-td/team-tendencies.json';
import oppDef from '../../data/nfl-td/opponent-defense.json';
import baseDepthCharts from '../../data/nfl-td/depth-charts.json';
import explosive from '../../data/nfl-td/player-explosive.json';
import calibration from '../../data/nfl-td/calibration.json';

// Optional preseason context (if file missing, we fall back gracefully)
let preseasonSnaps = [];
try {
  preseasonSnaps = (await import('../../data/nfl-td/preseason-snaps.json')).default;
} catch (_e) {
  try {
    preseasonSnaps = (await import('../../data/nfl-td/preseason-snaps.sample.json')).default;
  } catch (_e2) {
    preseasonSnaps = [];
  }
}

import { computeStarterRepWeights, applyPreseasonWeights } from './usageAdjuster.js';

const POS_FROM_ROLE = { RB1:'RB', WR1:'WR', WR2:'WR', TE1:'TE', QB1:'QB' };
const ROLE_SHARE = { RB1:0.70, WR1:0.50, WR2:0.30, TE1:0.70, QB1:1.00 };
const PATH_CAP = 0.80;

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function logistic(x){ return 1/(1+Math.exp(-x)); }
function logit(p){ p=clamp(p,1e-6,1-1e-6); return Math.log(p/(1-p)); }

function calibrateProb(pRaw){
  if (!calibration || calibration.method !== 'platt') return clamp(pRaw, 0, 0.95);
  const a = calibration.a ?? 0;
  const b = calibration.b ?? 1;
  const z = a + b * logit(clamp(pRaw, 1e-6, 1-1e-6));
  return clamp(logistic(z), 0, 0.95);
}

function playerExplosiveIdx(name){
  const e = explosive[name];
  return e ? (e.explosive_idx/100) : 0.5;
}

function makeWhy(team, pos, name, tAgg, tTen, def, expIdx){
  const rzTrips = tAgg.rz_trips_pg?.toFixed?.(2) ?? '—';
  const posShare = Math.round((tTen.rz_pos_share[POS_FROM_ROLE[pos]] || 0)*100);
  const rzAllow = Math.round((def.rz_allow[POS_FROM_ROLE[pos]] || 0)*100);
  const expPct = Math.round(expIdx*100);
  return `${team} RZ trips ~${rzTrips}/g • ${POS_FROM_ROLE[pos]} share ${posShare}% • vs ${def._code ?? 'OPP'} RZ allow ${rzAllow}% • EXP idx ${expPct}`;
}

export function tdEngine(games, opts = {}){
  const offers = opts.offers || [];
  const candidates = [];
  const preseasonAlpha = 0.6; // blend strength for preseason starter-rep

  // Adjust depth charts with preseason starter-rep weights (if any)
  let depth = baseDepthCharts;
  try {
    const weights = computeStarterRepWeights(preseasonSnaps);
    depth = applyPreseasonWeights(baseDepthCharts, weights, preseasonAlpha);
  } catch (_e) {
    depth = baseDepthCharts;
  }

  // Build a quick name->odds map for convenience
  const oddsMap = new Map();
  for (const o of offers){
    if (!o || !o.player) continue;
    oddsMap.set(o.player.toLowerCase(), o.american ?? null);
  }

  for (const g of games || []){
    const home = g.home, away = g.away;
    if (!home || !away) continue;
    for (const side of [away, home]){
      const opp = side === home ? away : home;
      const tAgg = agg[side] || { rz_trips_pg: 3.1, vulture_prob: 0.08 };
      const tTen = tendencies[side] || tendencies["DAL"]; // default template
      const def = (oppDef[opp] ? { ...oppDef[opp], _code: opp } : { rz_allow:{RB:0.28,WR:0.28,TE:0.24,QB:0.05}, exp_allow:{rush:0.28,rec:0.30}, _code: opp });
      const chart = depth[side] || {};

      for (const role of ["RB1","WR1","WR2","TE1"]){
        const name = chart[role];
        if (!name) continue;
        const pos = POS_FROM_ROLE[role];
        const posShareTeam = tTen.rz_pos_share[pos] ?? 0.30;
        const playerShare = ROLE_SHARE[role] ?? 0.5;

        const expIdx = playerExplosiveIdx(name);

        // RZ lambda
        const lambdaRZ = (tAgg.rz_trips_pg || 3.0) * posShareTeam * playerShare * (def.rz_allow[pos] || 0.28) * 0.55;
        const pRZ = clamp(1 - Math.exp(-lambdaRZ), 0, PATH_CAP);

        // Explosive path
        const expAllow = pos === 'RB' ? (def.exp_allow.rush || 0.27) : (def.exp_allow.rec || 0.30);
        const pEXP = clamp(expAllow * expIdx * 0.40, 0, PATH_CAP);

        // Vulture penalty
        const vult = (pos === 'RB') ? (tAgg.vulture_prob || 0.08) * 0.20 : 0;

        const w = tTen.weights || { w_rz:0.65, w_exp:0.30, w_vult:0.05 };
        const pRaw = clamp(w.w_rz*pRZ + w.w_exp*pEXP - w.w_vult*vult, 0, 0.80);
        const pCal = calibrateProb(pRaw);

        const total = (w.w_rz*pRZ + w.w_exp*pEXP) || 1e-6;
        const rzShare = (w.w_rz*pRZ)/total;
        const expShare = (w.w_exp*pEXP)/total;

        const american = oddsMap.get((name||"").toLowerCase()) ?? null;
        const why = makeWhy(side, role, name, tAgg, tTen, def, expIdx);

        candidates.push({
          player: name,
          team: side,
          game: `${away} @ ${home}`,
          model_td_pct: pCal,
          model_td_pct_raw: pRaw,
          rz_path_pct: rzShare,
          exp_path_pct: expShare,
          american,
          why
        });
      }
    }
  }

  candidates.sort((a,b) => b.model_td_pct - a.model_td_pct);
  return candidates.slice(0, 40);
}

export default tdEngine;
