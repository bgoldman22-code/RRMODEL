// src/nfl/tdEngine.js
// Produces Anytime TD candidates with recency weighting (last season > prior 2),
// optional preseason usage blend (supplemental), and optional odds mapping to compute EV.
// Exports default + named tdEngine.

function normName(s) {
  if (!s) return "";
  s = s.toLowerCase();
  s = s.replace(/\./g, "");                       // D.K. -> DK
  s = s.replace(/,?\s*(jr|sr|iii|ii|iv)\b/g, ""); // drop suffixes
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z]/g, "");
  return s;
}

function americanToDecimal(american) {
  const a = Number(american);
  if (!Number.isFinite(a)) return null;
  if (a > 0) return 1 + a / 100;
  if (a < 0) return 1 + 100 / Math.abs(a);
  return null;
}

// safe getter for local JSON (vite will inline it)
let depthCharts = {};
let pbpAgg = {};
let tendencies = {};
let oppDef = {};
let explosive = {};
let injuries = {}; // Add injuries data
let calibration = { a: 0.0, b: 1.0 }; // identity if not present

try { depthCharts = require("../../data/nfl-td/depth-charts.json"); } catch {}
try { pbpAgg = require("../../data/nfl-td/pbp-aggregates-2022-2024.json"); } catch {}
try { tendencies = require("../../data/nfl-td/team-tendencies.json"); } catch {}
try { oppDef = require("../../data/nfl-td/opponent-defense.json"); } catch {}
try { explosive = require("../../data/nfl-td/player-explosive.json"); } catch {}
try { injuries = require("../../test-injury-data.json"); } catch {} // Use test data for now

// Elite injury cascade system
const QB_INJURY_CASCADES = {
  qb_out: {
    RB: { share_multiplier: 1.25, rz_efficiency: 1.15 },    // More rushing, checkdowns
    WR: { share_multiplier: 0.85, rz_efficiency: 0.9 },     // Less deep threats (WR1)
    WR2: { share_multiplier: 1.1, rz_efficiency: 1.05 },    // More slot/safety valve 
    TE: { share_multiplier: 1.2, rz_efficiency: 1.1 }       // More checkdown targets
  },
  qb_doubtful: {
    RB: { share_multiplier: 1.1, rz_efficiency: 1.05 },
    WR: { share_multiplier: 0.95, rz_efficiency: 0.97 },
    WR2: { share_multiplier: 1.05, rz_efficiency: 1.02 },
    TE: { share_multiplier: 1.08, rz_efficiency: 1.03 }
  },
  qb_questionable: {
    RB: { share_multiplier: 1.05, rz_efficiency: 1.02 },
    WR: { share_multiplier: 0.98, rz_efficiency: 0.99 },
    WR2: { share_multiplier: 1.02, rz_efficiency: 1.01 },
    TE: { share_multiplier: 1.04, rz_efficiency: 1.02 }
  }
};

// Team-specific QB tiers for cascade calculations
const QB_TIERS = {
  'BUF': 'elite',   // Josh Allen
  'KC': 'elite',    // Patrick Mahomes  
  'BAL': 'elite',   // Lamar Jackson
  'CIN': 'good',    // Joe Burrow
  'MIA': 'good',    // Tua Tagovailoa
  'LAC': 'good',    // Justin Herbert
  'ARI': 'good',    // Kyler Murray
  'SEA': 'average', // Geno Smith
  'ATL': 'average', // Kirk Cousins
  'NYJ': 'good',    // Aaron Rodgers
  'GB': 'good',     // Jordan Love
  'DET': 'good',    // Jared Goff
  'HOU': 'good',    // CJ Stroud
  'DAL': 'average', // Dak Prescott
  'PHI': 'good',    // Jalen Hurts
  'SF': 'average',  // Brock Purdy
  'MIN': 'good',    // Sam Darnold/McCarthy
  'TB': 'average',  // Baker Mayfield
  'LAR': 'average', // Matthew Stafford
  'PIT': 'average', // Russell Wilson
  'DEN': 'average', // Bo Nix
  'IND': 'average', // Anthony Richardson
  'LV': 'poor',     // Gardner Minshew
  'TEN': 'poor',    // Will Levis
  'JAX': 'poor',    // Trevor Lawrence
  'CLE': 'poor',    // Deshaun Watson
  'NE': 'poor',     // Drake Maye/Brissett
  'WAS': 'average', // Jayden Daniels
  'NYG': 'poor',    // Daniel Jones
  'CHI': 'average', // Caleb Williams
  'CAR': 'poor',    // Bryce Young
  'NO': 'poor'      // Derek Carr
};

function calculateInjuryCascadeAdjustments(teamCode, baseShares) {
  if (!injuries || !injuries.teams || !injuries.teams[teamCode]) {
    return baseShares;
  }
  
  const teamInjuries = injuries.teams[teamCode];
  let adjustedShares = { ...baseShares };
  
  // QB injury cascade effects - affects ALL positions
  if (teamInjuries.qb_status && teamInjuries.qb_status !== 'active') {
    const qbTier = QB_TIERS[teamCode] || 'average';
    const cascade = QB_INJURY_CASCADES[teamInjuries.qb_status];
    
    if (cascade && (qbTier === 'elite' || qbTier === 'good')) {
      // Apply stronger cascades for better QBs (bigger dropoff)
      const tierMultiplier = qbTier === 'elite' ? 1.0 : 0.7;
      
      Object.keys(adjustedShares).forEach(role => {
        const position = role.includes('RB') ? 'RB' : 
                        role.includes('WR') && role !== 'WR2' ? 'WR' :
                        role === 'WR2' ? 'WR2' :
                        role.includes('TE') ? 'TE' : null;
        
        if (position && cascade[position]) {
          const adjustment = cascade[position].share_multiplier;
          const cascadeEffect = 1 + ((adjustment - 1) * tierMultiplier);
          adjustedShares[role] *= cascadeEffect;
        }
      });
    }
  }
  
  // Position-specific injury adjustments (avoiding double-counting with depth charts)
  const skillInjuries = ['rb_injuries', 'wr_injuries', 'te_injuries'];
  skillInjuries.forEach(injuryType => {
    const positionInjuries = teamInjuries[injuryType] || [];
    positionInjuries.forEach(injury => {
      if (injury.status !== 'active' && injury.depth === 1) {
        // Only apply if the injury ISN'T already reflected in depth charts
        if (!isInjuryInDepthChart(teamCode, injury, injuryType)) {
          redistributeInjuredPlayerShare(adjustedShares, injury, injuryType);
        }
      }
    });
  });
  
  // Normalize shares to prevent over-reduction
  normalizeShares(adjustedShares);
  
  return adjustedShares;
}

function isInjuryInDepthChart(teamCode, injury, injuryType) {
  // Check if injury is already reflected in depth chart positioning
  const chart = depthCharts[teamCode] || {};
  const playerName = injury.name || injury.player;
  
  if (injuryType === 'rb_injuries' && chart.RB) {
    return !chart.RB.includes(playerName) || chart.RB.indexOf(playerName) > 0;
  }
  if (injuryType === 'wr_injuries' && chart.WR) {
    return !chart.WR.includes(playerName) || chart.WR.indexOf(playerName) > 0;
  }
  if (injuryType === 'te_injuries' && chart.TE) {
    return !chart.TE.includes(playerName) || chart.TE.indexOf(playerName) > 0;
  }
  
  return false; // Assume not in depth chart if we can't determine
}

function redistributeInjuredPlayerShare(shares, injury, injuryType) {
  // Elite approach: Redistribute share rather than eliminate
  const injuredRole = getPlayerRole(injury, injuryType);
  if (!shares[injuredRole]) return;
  
  const lostShare = shares[injuredRole] * getInjuryShareLoss(injury.status);
  shares[injuredRole] -= lostShare;
  
  // Redistribute lost share intelligently
  if (injuryType === 'rb_injuries') {
    shares['TE1'] = (shares['TE1'] || 0) + lostShare * 0.4;  // More checkdowns
    shares['WR2'] = (shares['WR2'] || 0) + lostShare * 0.35; // More short routes
    shares['WR1'] = (shares['WR1'] || 0) + lostShare * 0.25; // Some increase
  } else if (injuryType === 'wr_injuries' && injuredRole === 'WR1') {
    shares['WR2'] = (shares['WR2'] || 0) + lostShare * 0.5;  // Primary beneficiary
    shares['TE1'] = (shares['TE1'] || 0) + lostShare * 0.3;  // More targets
    shares['RB1'] = (shares['RB1'] || 0) + lostShare * 0.2;  // Checkdowns
  } else if (injuryType === 'te_injuries') {
    shares['WR2'] = (shares['WR2'] || 0) + lostShare * 0.6;  // Slot receiver benefit
    shares['RB1'] = (shares['RB1'] || 0) + lostShare * 0.4;  // More dump-offs
  }
}

function getPlayerRole(injury, injuryType) {
  const depth = injury.depth || 1;
  if (injuryType === 'rb_injuries') return depth === 1 ? 'RB1' : 'RB2';
  if (injuryType === 'wr_injuries') return depth === 1 ? 'WR1' : 'WR2';
  if (injuryType === 'te_injuries') return depth === 1 ? 'TE1' : 'TE2';
  return 'UNKNOWN';
}

function getInjuryShareLoss(status) {
  switch (status) {
    case 'out': return 0.85;        // 85% of touches lost
    case 'doubtful': return 0.6;    // 60% of touches lost
    case 'questionable': return 0.3; // 30% of touches lost
    default: return 0;
  }
}

function normalizeShares(shares) {
  const totalShare = Object.values(shares).reduce((a, b) => a + b, 0);
  if (totalShare < 0.8 || totalShare > 1.2) {
    // Re-normalize if shares drift too far from 100%
    Object.keys(shares).forEach(role => {
      shares[role] = (shares[role] / totalShare) * 1.0;
    });
  }
}
try { calibration = require("../../data/nfl-td/calibration.json"); } catch {}

function getTeamCode(name) {
  // naive: many code systems use 2-3 letters; assume keys of depthCharts are team codes already
  return name;
}

function recencyWeight(feature) {
  // If feature has per-season breakdown, combine with weights; else return as-is.
  // Expected shape option A: { s2024: x, s2023: y, s2022: z }
  if (feature && typeof feature === "object" && ("s2024" in feature || "s2023" in feature || "s2022" in feature)) {
    const w24 = 0.6, w23 = 0.25, w22 = 0.15;
    const v24 = feature.s2024 ?? 0;
    const v23 = feature.s2023 ?? 0;
    const v22 = feature.s2022 ?? 0;
    const denom = (("s2024" in feature) ? w24 : 0) + (("s2023" in feature) ? w23 : 0) + (("s2022" in feature) ? w22 : 0);
    if (denom > 0) return (w24 * v24 + w23 * v23 + w22 * v22) / denom;
  }
  return typeof feature === "number" ? feature : 0;
}

function calibrate(pRaw) {
  // simple Platt-like: sigmoid(a + b*logit(pRaw)) but we only have a,b linear;
  // fallback: linear scale a + b*p
  const a = Number(calibration.a ?? 0);
  const b = Number(calibration.b ?? 1);
  let p = pRaw;
  if (!Number.isFinite(p)) p = 0;
  p = Math.max(0, Math.min(1, p));
  const pc = Math.max(0, Math.min(1, a + b * p));
  return pc;
}

function buildCandidatesForGames(games) {
  // Minimal example using available data shapes; produce RB1/WR1/TE1 etc. with real names if present.
  const out = [];
  for (const g of games) {
    const game = `${g.away} @ ${g.home}`;
    const teams = [g.home, g.away];
    for (const t of teams) {
      const chart = depthCharts[t] || {};
      const roles = [["RB1","RB"],["WR1","WR"],["WR2","WR"],["TE1","TE"]];
      for (const [role, pos] of roles) {
        const player = chart[role] || `${t} ${role}`;
        const team = t;
        // Compose paths (toy but stable): use tendencies + oppDef + explosive with recency
        const tTend = tendencies[team] || {};
        const rzTrips = recencyWeight(tTend.rz_trips_per_g) || 3.0;
        
        // ELITE: Apply injury-adjusted role shares
        const baseRoleShares = {
          "RB1": 0.48, "WR1": 0.32, "WR2": 0.20, "TE1": 0.20
        };
        const injuryAdjustedShares = calculateInjuryCascadeAdjustments(team, baseRoleShares);
        const roleShareBase = injuryAdjustedShares[role] || (pos === "RB" ? 0.48 : pos === "WR" ? 0.32 : 0.20);
        
        const expIdx = (explosive[player] ?? 50) / 100; // scale 0-1
        const opp = (team === g.home) ? g.away : g.home;
        const oppRz = recencyWeight((oppDef[opp]||{})[pos+"_rz_allow"]) || 0.28; // 28% default

        const rz_path = Math.max(0, Math.min(1, rzTrips / 5.0 * roleShareBase * (0.8 + 0.4*(oppRz)) )); // bounded
        const exp_path = Math.max(0, Math.min(1, 0.15 + 0.5*expIdx )); // simple mapping

        let pRaw = 0.65*rz_path + 0.3*exp_path + 0.05*0.0; // minus vulture adj (0 for now)
        pRaw = Math.max(0.01, Math.min(0.7, pRaw)); // keep in reasonable bounds
        const model_td_pct = calibrate(pRaw);

        const why = `${team} RZ trips ~${rzTrips.toFixed(2)}/g • ${pos} share ${Math.round(roleShareBase*100)}%${roleShareBase !== (pos === "RB" ? 0.48 : pos === "WR" ? 0.32 : 0.20) ? ' (injury adj)' : ''} • vs ${opp} RZ allow ${Math.round((oppRz)*100)}% • EXP idx ${explosive[player] ?? 50}`;

        out.push({
          player, team, game,
          model_td_pct,
          rz_path_pct: Math.max(0, Math.min(1, rz_path)),
          exp_path_pct: Math.max(0, Math.min(1, exp_path)),
          why
        });
      }
    }
  }
  // sort by model %
  out.sort((a,b)=> b.model_td_pct - a.model_td_pct);
  return out.slice(0, 40);
}

function attachOddsAndEV(cands, offers) {
  if (!Array.isArray(cands) || !Array.isArray(offers) || offers.length === 0) return cands;
  const map = new Map();
  for (const o of offers) {
    const key = o.player_key || normName(o.player);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(o);
  }
  return cands.map(c => {
    const key = normName(c.player);
    const list = map.get(key) || [];
    // prefer same game if available
    let best = null;
    if (list.length) {
      best = list[0];
      for (const o of list) {
        if (o.game === c.game) { best = o; break; }
      }
    }
    if (best) {
      const dec = americanToDecimal(best.american);
      const p = c.model_td_pct;
      const ev = (p * ((dec ?? 0) - 1)) - (1 - p);
      return { ...c, odds_american: best.american, ev_1u: ev };
    }
    return c;
  });
}

function tdEngine(games, opts = {}) {
  const offers = opts.offers || [];
  let cands = buildCandidatesForGames(games);
  cands = attachOddsAndEV(cands, offers);
  return cands;
}

module.exports = { tdEngine };
module.exports.default = tdEngine;
