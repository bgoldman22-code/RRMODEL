
// src/utils/why.js
// SAFETY PATCH: prefer opponentPitcher and guard against using the hitter's own pitcher.
// This file is drop-in compatible with your existing imports: `import { buildWhy } from "./utils/why.js"`

export function buildWhy(input, seed) {
  const rng = seeded(`${input.player||""}|${input.game||""}|${seed||1}`);

  // pick the correct pitcher once
  const pitcher = chooseOpponentPitcher(input);

  const parts = [];

  // 1) baseline
  parts.push(render(pick(T_BASELINE, rng), input));

  // 2) matchup vs pitch (if provided by caller)
  const match = bestPitchMatch(input);
  if (match) {
    parts.push(render(pick(T_PITCH_MATCH, rng), {...input, ...match}));
  }

  // 3) pitcher line (only if we have one after safety check)
  if (pitcher) {
    parts.push(render(pick(T_PITCHER, rng), {...input, pitcher}));
  }

  // 4) park / weather
  const env = envSummary(input);
  if (env) {
    parts.push(render(pick(T_ENV, rng), {...input, ...env}));
  }

  // 5) market/EV
  parts.push(render(pick(T_MARKET, rng), {
    ...input,
    odds_best_american: input.odds_best_american ?? input.actual_american ?? input.american ?? "—",
    implied_prob: input.implied_prob ?? null,
    true_hr_prob: input.true_hr_prob ?? input.model_prob ?? null,
    ev_per_unit: input.ev_per_unit ?? input.ev ?? null,
    edge_pts: (() => {
      const p = input.true_hr_prob ?? input.model_prob;
      const q = input.implied_prob;
      if (p == null || q == null) return "—";
      return Math.round((p - q)*1000)/10;
    })()
  }));

  // optional risk note
  if (input.risk_notes) parts.push(render("Notes: {risk_notes}.", input));

  return {
    text: parts.filter(Boolean).slice(0,5).join(" • "),
    bullets: parts
  };
}

// —— helpers ——

function chooseOpponentPitcher(input){
  // If caller passes opponentPitcher explicitly, prefer it.
  let p = input.opponentPitcher || input.pitcher || null;
  if (!p) return null;

  // If we can detect that `p` is the same team as the batter, drop it.
  const batterTeam = (input.team || input.batter_team || input.player_team || "").toLowerCase();
  const pitcherTeam = (p.team || p.team_name || p.club || "").toLowerCase();
  if (batterTeam && pitcherTeam && batterTeam === pitcherTeam) {
    // wrong-side pitcher slipped in (home/away flip) — try altOpponentPitcher or give up gracefully
    return input.altOpponentPitcher || null;
  }
  return p;
}

const T_BASELINE = [
  "{player} baseline HR/PA {pct(base_hr_pa)} over ~{fix(exp_pa,1)} PA.",
  "Baseline power {pct(base_hr_pa)} per PA; workload ~{fix(exp_pa,1)} PA."
];

const T_PITCHER = [
  "vs {pitcher.name} ({pitcher.throws}), {pitcher.hr9} HR/9 allowed; barrels {pct(pitcher.barrel_pct_allowed)}.",
  "{pitcher.name} leans on {pitch_list}; playable power spot."
];

const T_PITCH_MATCH = [
  "Pitch-type edge: vs {match_pitch} xISO {val(match_xiso)}.",
  "Profiles well vs {match_pitch} ({val(match_xiso)} xISO window)."
];

const T_ENV = [
  "{park.name} plays {park_dir} for {hand} power (HR idx {park_idx}).",
  "Weather {weather_blurb} → {env_boost} HR tilt."
];

const T_MARKET = [
  "Odds {odds_best_american} imply {pct(implied_prob)}; model {pct(true_hr_prob)} → EV {fix(ev_per_unit,2)}u.",
  "Market {odds_best_american} ({pct(implied_prob)}) vs model {pct(true_hr_prob)}; edge {edge_pts} pts."
];

function seeded(str, seed=1){
  let h=0; for (let i=0;i<str.length;i++) h=Math.imul(31,h)+str.charCodeAt(i)|0;
  return ()=>{ seed=Math.imul(48271, seed)%2147483647; return ((h^seed)>>>0)/2147483647; };
}
function pick(arr, rng){ return arr[Math.floor(rng()*arr.length)]; }
function render(tpl, ctx){
  return tpl.replace(/\{(.*?)\}/g, (_,k)=>{
    try{
      if (k.startsWith("pct(")) return fmtPct(get(ctx, k.slice(4,-1)));
      if (k.startsWith("fix(")) { const [v,d]=k.slice(4,-1).split(","); return fmtFix(get(ctx,v.trim()), Number(d)); }
      if (k.startsWith("val(")) return fmtVal(get(ctx, k.slice(4,-1)));
      if (k==="pitch_list") return (ctx.pitcher?.primary_pitches||[]).slice(0,2).map(p=>p.pitch).join("/");
      return get(ctx,k);
    }catch{ return ""; }
  });
}
function get(obj, path){ return path.split(".").reduce((o,k)=>o?.[k], obj); }
function fmtPct(x){ return x==null?"—":(100*Number(x)).toFixed(1)+"%"; }
function fmtFix(x,d){ return x==null?"—":Number(x).toFixed(d); }
function fmtVal(x){ return x==null?"—":String(x); }
function bestPitchMatch(input){ return input.pitch_match || null; }
function envSummary(input){ return input.env || null; }

export function normName(name){
  return (name||"").toLowerCase().replace(/[^a-z0-9 ]+/g,"").replace(/\s+/g," ").trim();
}
