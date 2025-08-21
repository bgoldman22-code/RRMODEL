// src/nfl/tdEngine.js
// Two-path Anytime TD engine with a DEFAULT export for Netlify build.
// Safe, self-contained, and reads local JSON data built in previous patches.
import aggregates from "../../data/nfl-td/pbp-aggregates-2022-2024.json";
import depths from "../../data/nfl-td/depth-charts.json";
import tendencies from "../../data/nfl-td/team-tendencies.json";
import oppDef from "../../data/nfl-td/opponent-defense.json";
import playerX from "../../data/nfl-td/player-explosive.json";

/**
 * games: [{ away, home, date }]
 * opts: { offers?: [], weights?: { w_rz, w_exp, w_vult } }
 * returns: array of { player, pos, team, game, model_td_pct, rz_path_pct, exp_path_pct, why }
 */
export function tdEngine(games = [], opts = {}) {
  const weights = { w_rz: 0.65, w_exp: 0.30, w_vult: 0.05, ...(tendencies?.weights || {}), ...(opts.weights || {}) };

  const teamSet = new Set();
  games.forEach(g => { if (g?.home) teamSet.add(g.home); if (g?.away) teamSet.add(g.away); });

  const rows = [];

  for (const team of teamSet) {
    const opp = findOpponent(team, games);
    if (!opp) continue;

    const teamAgg = aggregates[team] || {};
    const teamTen = tendencies[team] || {};
    const oppD = oppDef[opp] || {};
    const depth = depths[team] || {};

    const players = [
      ...(depth.RB || []),
      ...(depth.WR || []),
      ...(depth.TE || []),
      ...(depth.QB || [])
    ];

    for (const p of players) {
      const pos = p.pos || inferPos(p, depth);
      const gameStr = `${opp}@${team}` ifHome(team, games) ? `${opp}@${team}` : `${team}@${opp}`;

      // --- RZ path ---
      const rzTripsPg = num(teamAgg.rz_trips_pg, 3.0);
      const posShare = num(getNested(teamTen, ["rz_pos_share", pos]), defaultPosShare(pos));
      const oppAllowRZ = num(getNested(oppD, ["rz_allow_td_rate", pos]), 0.25); // 25% baseline
      const depthShare = num(p.share, defaultDepthShare(pos));
      const playerRZ = rzTripsPg * posShare * oppAllowRZ * depthShare;

      // --- Explosive path ---
      const oppExp = pos === "RB"
        ? num(getNested(oppD, ["exp_allow", "rush"]), 0.10)
        : num(getNested(oppD, ["exp_allow", "rec"]), 0.10);

      const px = playerX[p.name] || {};
      const explosiveIdx = num(px.explosive_idx, 25) / 100.0; // scale 0..1
      const playerEXP = oppExp * explosiveIdx;

      // --- Vulture penalty ---
      const vultureProb = num(teamAgg.vulture_prob, 0.05) * overlapVulture(pos, depth);

      // --- Combine ---
      const rzComponent = weights.w_rz * playerRZ;
      const expComponent = weights.w_exp * playerEXP;
      let tdProb = rzComponent + expComponent - weights.w_vult * vultureProb;

      // sanity clamps
      tdProb = Math.max(0, Math.min(tdProb, 0.9));

      const why =
        `RZ trips ~${rzTripsPg.toFixed(1)} • ${pos} share ${(posShare*100).toFixed(0)}%` +
        ` • vs ${opp} RZ allow ${(oppAllowRZ*100).toFixed(0)}%` +
        ` • explosive idx ${(explosiveIdx*100).toFixed(0)}`;

      rows.push({
        player: p.name,
        pos,
        team,
        game: gameStr,
        model_td_pct: tdProb,
        rz_path_pct: rzComponent,
        exp_path_pct: expComponent,
        why
      });
    }
  }

  // Pick top 20
  rows.sort((a,b) => b.model_td_pct - a.model_td_pct);
  return rows.slice(0, 20);
}

// Helper: find opponent for a given team from games[]
function findOpponent(team, games) {
  for (const g of games) {
    if (g.home === team) return g.away;
    if (g.away === team) return g.home;
  }
  return null;
}

function ifHome(team, games){
  for (const g of games) if (g.home === team) return true;
  return false;
}

function getNested(obj, pathArr){
  return pathArr.reduce((o,k)=> (o && o[k] != null) ? o[k] : undefined, obj);
}

function num(v, d){ return (typeof v === "number" && Number.isFinite(v)) ? v : d; }

function defaultPosShare(pos){
  switch(pos){
    case "RB": return 0.45;
    case "WR": return 0.35;
    case "TE": return 0.20;
    case "QB": return 0.05;
    default: return 0.10;
  }
}
function defaultDepthShare(pos){
  switch(pos){
    case "RB": return 0.7; // RB1
    case "WR": return 0.5; // WR1
    case "TE": return 0.7; // TE1
    case "QB": return 1.0;
    default: return 0.5;
  }
}
function inferPos(p, depth) {
  const name = p?.name;
  if (!name) return p?.pos || "WR";
  if ((depth.RB||[]).some(x=>x.name===name)) return "RB";
  if ((depth.TE||[]).some(x=>x.name===name)) return "TE";
  if ((depth.QB||[]).some(x=>x.name===name)) return "QB";
  return "WR";
}

// Also provide a default export to satisfy `import tdEngine from "./nfl/tdEngine"`
export default tdEngine;
