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
let calibration = { a: 0.0, b: 1.0 }; // identity if not present

try { depthCharts = require("../../data/nfl-td/depth-charts.json"); } catch {}
try { pbpAgg = require("../../data/nfl-td/pbp-aggregates-2022-2024.json"); } catch {}
try { tendencies = require("../../data/nfl-td/team-tendencies.json"); } catch {}
try { oppDef = require("../../data/nfl-td/opponent-defense.json"); } catch {}
try { explosive = require("../../data/nfl-td/player-explosive.json"); } catch {}
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
        const roleShareBase = (pos === "RB" ? 0.48 : pos === "WR" ? 0.32 : 0.20); // base role shares
        const expIdx = (explosive[player] ?? 50) / 100; // scale 0-1
        const opp = (team === g.home) ? g.away : g.home;
        const oppRz = recencyWeight((oppDef[opp]||{})[pos+"_rz_allow"]) || 0.28; // 28% default

        const rz_path = Math.max(0, Math.min(1, rzTrips / 5.0 * roleShareBase * (0.8 + 0.4*(oppRz)) )); // bounded
        const exp_path = Math.max(0, Math.min(1, 0.15 + 0.5*expIdx )); // simple mapping

        let pRaw = 0.65*rz_path + 0.3*exp_path + 0.05*0.0; // minus vulture adj (0 for now)
        pRaw = Math.max(0.01, Math.min(0.7, pRaw)); // keep in reasonable bounds
        const model_td_pct = calibrate(pRaw);

        const why = `${team} RZ trips ~${rzTrips.toFixed(2)}/g • ${pos} share ${Math.round(roleShareBase*100)}% • vs ${opp} RZ allow ${Math.round((oppRz)*100)}% • EXP idx ${explosive[player] ?? 50}`;

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
