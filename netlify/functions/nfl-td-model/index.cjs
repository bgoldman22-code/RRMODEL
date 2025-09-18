'use strict';
/**
 * netlify/functions/nfl-td-model/index.cjs
 * Core Anytime TD model (isolated from MLB).
 *
 * Design:
 *  - Two-path score: Red Zone (RZ) & Long (explosive play) paths
 *  - Vulture TD handling via team RB committee + QB sneak rate
 *  - Depth chart + goal-line usage if available (graceful fallbacks)
 *  - Opponent RZ defense + explosive rate allowed
 *  - Weather + pace nudges (optional hooks)
 *  - Outputs per-player: td_prob, model_american, fair_price, notes
 */

const { getStore } = require('@netlify/blobs');

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function invlogit(x){ return 1 / (1 + Math.exp(-x)); }
function toAmerican(p){
  p = clamp(p, 1e-6, 0.999999);
  const dec = 1/p;
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}
function fromAmerican(a){
  if (a == null || !isFinite(a)) return null;
  if (a > 0) return 100/(a+100);
  return (-a) / ((-a)+100);
}

function safeGet(obj, path, dflt=null){
  try { return path.split('.').reduce((o,k)=>o?.[k], obj) ?? dflt; }
  catch { return dflt; }
}

async function readJsonFromBlobs(key, { name = process.env.BLOBS_STORE_NFL || 'nfl-td', siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN } = {}){
  const store = getStore({ name, siteID, token });
  const blob = await store.get(key, { type: 'json' });
  return blob || null;
}

async function writeJsonToBlobs(key, data, { name = process.env.BLOBS_STORE_NFL || 'nfl-td', siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN } = {}){
  const store = getStore({ name, siteID, token });
  await store.set(key, JSON.stringify(data), { contentType: 'application/json' });
}

function baseTeamTDsPerGame(history, abbr){
  // Approximate from recent results if available; default ~2.4 TD/g
  if (!Array.isArray(history) || history.length === 0) return 2.4;
  let pts=0, gp=0;
  for (const wk of history){
    for (const g of (wk.games || [])){
      if (!g.result) continue;
      if (g.home_abbr === abbr){ pts += (g.result.home || 0); gp++; }
      if (g.away_abbr === abbr){ pts += (g.result.away || 0); gp++; }
    }
  }
  if (!gp) return 2.4;
  const ppg = pts/gp;
  return clamp(ppg/7, 0.8, 4.5);
}

function roleShare(pos, pdata){
  // very rough priors with hooks for pdata shares
  if (!pdata) pdata = {};
  const rz = Number(pdata.red_zone_share ?? (pos === 'RB' ? 0.42 : pos === 'WR' ? 0.32 : 0.20));
  const gl = Number(pdata.goal_line_share ?? (pos === 'RB' ? 0.55 : pos === 'TE' ? 0.18 : 0.12));
  return { rz, gl };
}

function vulturePenalty(pos, context){
  // Penalize RB1 on teams with high RB committee rate and mobile QB sneak rate
  const committee = clamp(Number(context.rb_committee_rate ?? 0.25), 0, 0.9);
  const qbSneak = clamp(Number(context.qb_sneak_rate ?? 0.08), 0, 0.25);
  if (pos !== 'RB') return 0;
  return -0.15 * committee - 0.10 * qbSneak; // subtract from RZ component
}

function opponentAdjust(context){
  // Opponent RZ defense (lower is worse for offense), explosive allowed (higher helps long TDs)
  const oppRZ = clamp(Number(context.opp_rz_td_allowed_rate ?? 0.55), 0.3, 0.8);     // fraction of RZ trips ending in TD
  const oppExpl = clamp(Number(context.opp_explosive_play_rate_allowed ?? 0.11), 0.05, 0.20);
  return { oppRZ, oppExpl };
}

function weatherAdjust(context){
  // Light-touch: wind hurts long TDs, indoor boosts slightly
  const wind = Number(context.wind_mph ?? 6);
  const indoor = !!context.is_indoor;
  const longMul = clamp(indoor ? 1.05 : (wind > 15 ? 0.9 : 1.0), 0.85, 1.1);
  const rzMul   = clamp(indoor ? 1.02 : 1.0, 0.95, 1.08);
  return { longMul, rzMul };
}

function paceAdjust(context){
  // Plays per game proxy influences both paths mildly
  const pace = Number(context.game_plays_proj ?? 124); // both teams
  const mul = clamp( pace / 124, 0.9, 1.1 );
  return { paceMul: mul };
}

function playerProbTD(player, context){
  const pos = player.pos || player.position || 'WR';
  const { rz, gl } = roleShare(pos, player.usage || {});
  const baseTeam = baseTeamTDsPerGame(context.history_recent || [], context.team_abbr);
  const { oppRZ, oppExpl } = opponentAdjust(context);
  const { longMul, rzMul } = weatherAdjust(context);
  const { paceMul } = paceAdjust(context);

  // Two-path score
  // Red Zone: based on team RZ TD expectations times role shares and penalties
  let rzScore = baseTeam * oppRZ * (0.55 * rz + 0.45 * gl);
  rzScore += vulturePenalty(pos, context);
  rzScore = Math.max(0, rzScore);
  rzScore *= rzMul * paceMul;

  // Long-path: explosive propensity × player long TD tendency
  const playerExpl = clamp(Number(player.explosive_propensity ?? (pos === 'WR' ? 1.0 : 0.6)), 0.2, 1.5);
  let longScore = baseTeam * oppExpl * 0.45 * playerExpl;
  longScore *= longMul * paceMul;

  // Map combined score to probability via smooth squashing
  const linear = 0.55 * rzScore + 0.45 * longScore;
  const prob = clamp(invlogit( -2.2 + 0.9 * linear ), 0.02, 0.65); // broad prior bounds
  return prob;
}

function computeEV(prob, offeredAmerican){
  const fair = toAmerican(prob);
  const offeredP = fromAmerican(offeredAmerican);
  const ev = (offeredP is null) ? null : (prob* (1/((offeredAmerican>0)?(offeredAmerican/100): (100/(-offeredAmerican)) )) - (1-prob));
  // We'll compute EV more directly in output step; keep placeholder for API symmetry
  return { fair, ev: null };
}

function shapeOutput(player, prob, market){
  const fair = toAmerican(prob);
  const row = {
    player: player.name,
    team: player.team_abbr,
    pos: player.pos || player.position,
    td_prob: Number(prob.toFixed(4)),
    model_american: fair,
    fair_decimal: Number((1/prob).toFixed(3)),
    market: market || null,
    notes: player.notes || null
  };
  return row;
}

/**
 * Build predictions.
 * @param {Object} params { season, week, candidates, context, oddsIndex? }
 */
function buildPredictions(params){
  const { season, week, candidates, context, oddsIndex } = params;
  const out = [];
  for (const p of candidates){
    const prob = playerProbTD(p, context);
    const row = shapeOutput(p, prob, "anytime_td");
    // Join odds if provided (expected shape: { best_american, by_book: {...} })
    if (oddsIndex){
      const key = `${p.name}|${p.team_abbr}`;
      const o = oddsIndex[key];
      if (o){
        row.best_american = o.best_american;
        row.by_book = o.by_book;
        if (typeof o.best_american === 'number'){
          const implied = fromAmerican(o.best_american) || 0;
          row.ev_edge = Number((prob * (o.best_american>0 ? (o.best_american/100) : (100/(-o.best_american))) - (1-prob)).toFixed(4));
          row.value = Number((prob - implied).toFixed(4));
        }
      }
    }
    out.push(row);
  }
  // sort by EV/value if present, else by prob
  out.sort((a,b) => (b.value ?? b.td_prob) - (a.value ?? a.td_prob));
  return {
    meta: { season, week, generated_at: new Date().toISOString(), model: "nfl-td v1 two-path" },
    rows: out
  };
}

module.exports = {
  buildPredictions,
  playerProbTD,
  toAmerican,
  fromAmerican
};
