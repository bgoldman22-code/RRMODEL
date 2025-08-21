// src/nfl/tdEngine.js
import agg from '../../data/nfl-td/pbp-aggregates-2022-2024.json';
import tendencies from '../../data/nfl-td/team-tendencies.json';
import oppDef from '../../data/nfl-td/opponent-defense.json';
import baseDepth from '../../data/nfl-td/depth-charts.json';
import explosive from '../../data/nfl-td/player-explosive.json';
import calibration from '../../data/nfl-td/calibration.json';
import rosterOverrides from '../../data/nfl-td/roster-overrides.json'; // optional mapping
import { computeStarterRepWeights } from './preseasonUsage.js';

const POS_FROM_ROLE = { RB1:'RB', WR1:'WR', WR2:'WR', TE1:'TE', QB1:'QB' };
const ROLE_SHARE = { RB1:0.70, WR1:0.50, WR2:0.30, TE1:0.70, QB1:1.00 };
const PATH_CAP = 0.80;
const PRESEASON_ALPHA = 0.25; // preseason influence cap
const OVERRIDE_ALPHA = 0.85;  // roster override trust (explicit human fixes dominate)

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

// Safely load preseason snaps if present (build won't fail if absent)
async function safeLoadPreseason(){
  try {
    const mod = await import('../../data/nfl-td/preseason-snaps.json');
    return mod.default || [];
  } catch {
    try {
      const mod2 = await import('../../data/nfl-td/preseason-snaps.sample.json');
      return mod2.default || [];
    } catch {
      return [];
    }
  }
}

function applyRosterOverrides(depth){
  // rosterOverrides format:
  // { "SEA": { "WR1": "Jaxon Smith-Njigba" }, "NE": { "RB1": "TreVeyon Henderson" } }
  if (!rosterOverrides || typeof rosterOverrides !== 'object') return depth;
  const out = JSON.parse(JSON.stringify(depth));
  for(const team of Object.keys(rosterOverrides)){
    out[team] = out[team] || {};
    const patch = rosterOverrides[team] || {};
    for(const role of Object.keys(patch)){
      const name = patch[role];
      if (!name) continue;
      out[team][role] = name;
    }
  }
  return out;
}

export async function tdEngine(games, opts = {}){
  const offers = opts.offers || [];
  const preseasonSnaps = await safeLoadPreseason();
  const psWeights = computeStarterRepWeights(preseasonSnaps); // name -> 0..1
  const depth = applyRosterOverrides(baseDepth);

  // Build name->odds map
  const oddsMap = new Map();
  for (const o of offers){
    if (!o || !o.player) continue;
    oddsMap.set(o.player.toLowerCase(), o.american ?? null);
  }

  const candidates = [];
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
        let name = chart[role];
        if (!name) continue;
        const pos = POS_FROM_ROLE[role];

        // Base role share, then blend preseason and explicit overrides (if any name changed it is already applied in chart)
        const baseShare = ROLE_SHARE[role] ?? 0.5;
        const psWeight = psWeights[name] ?? 0; // 0..1
        const playerShare = clamp(baseShare*(1-PRESEASON_ALPHA) + psWeight*PRESEASON_ALPHA, 0.05, 0.95);

        const posShareTeam = tTen.rz_pos_share[pos] ?? 0.30;
        const expIdx = playerExplosiveIdx(name);

        const lambdaRZ = (tAgg.rz_trips_pg || 3.0) * posShareTeam * playerShare * (def.rz_allow[pos] || 0.28) * 0.55;
        const pRZ = clamp(1 - Math.exp(-lambdaRZ), 0, PATH_CAP);

        const expAllow = pos === 'RB' ? (def.exp_allow.rush || 0.27) : (def.exp_allow.rec || 0.30);
        const pEXP = clamp(expAllow * expIdx * 0.40, 0, PATH_CAP);

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
          player_share: playerShare,
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
