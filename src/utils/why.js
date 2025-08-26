// src/utils/why.js
// NOTE: patched to enforce opponent pitcher sanity.
// We normalize the input so that `input.pitcher` always refers to the OPPONENT pitcher.
// If an incorrect self-team pitcher is detected, we swap to `input.opponent_pitcher` when present
// or clear it to null (and the pitcher copy will gracefully fallback).

import { ensureOpponentPitcher } from "./pitcher_guard.js";

export function buildWhy(input, seed) {
  // sanitize pitcher reference
  input = ensureOpponentPitcher(input);

  const rng = seeded((input.player || "") + (input.opponent || "") + (new Date()).toDateString(), seed);
  const parts = [];

  push(parts, pick(T_BASELINE, rng), input);

  const match = bestPitchMatch(input);
  if (match) push(parts, pick(T_PITCH_MATCH, rng), {...input, ...match});
  else push(parts, pick(T_PITCHER, rng), input);

  const env = envSummary(input);
  if (env) push(parts, pick(T_ENV, rng), {...input, ...env});

  push(parts, pick(T_MARKET, rng), {
    ...input,
    edge_pts: Math.round(((input.true_hr_prob ?? 0) - (input.implied_prob ?? 0))*1000)/10
  });

  if (input.risk_notes) push(parts, pick(T_RISK, rng), input);

  const text = parts.filter(Boolean).slice(0,5).join(" ");
  return { text, bullets: parts };
}

const T_BASELINE = [
  "{player} projects from a {pct(base_hr_pa)} HR/PA baseline with ~{fix(exp_pa,1)} expected plate appearances.",
  "Baseline power is {pct(base_hr_pa)} per PA, supported by a likely {fix(exp_pa,1)} PA workload."
];

const T_PITCHER = [
  "He draws {pitcher.name}{pitcher_tag}, a {pitcher.throws}-hander allowing {val(pitcher.hr9)} HR/9 and {pct(pitcher.barrel_pct_allowed)} barrels.",
  "{pitcher.name}{pitcher_tag} leans on the {pitch_list} and has been vulnerable when behind in the count."
];

const T_PITCH_MATCH = [
  "{player} profiles well vs {match_pitch}: xISO {val(match_xiso)} on that pitch type.",
  "Matchup edge: {player} vs {match_pitch} has played {dir(match_xiso)} in our book."
];

const T_ENV = [
  "{park.name} plays {park_dir} for {hand}-handed power (HR index {park_idx}).",
  "Weather {weather_blurb} — a small {env_boost} HR boost."
];

const T_MARKET = [
  "At {odds_best_american}, the market implies {pct(implied_prob)}, while we project {pct(true_hr_prob)} — EV {fix(ev_per_unit,2)}u.",
  "Books price it at {odds_best_american} ({pct(implied_prob)}), our edge is {edge_pts} pts to {pct(true_hr_prob)}."
];

const T_RISK = ["Notes: {risk_notes}."];

// helpers
function seeded(str, seed = 1) {
  let h = 0;
  for (let i=0; i<str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return () => {
    seed = Math.imul(48271, seed) % 2147483647;
    return (h ^ seed) / 2147483647;
  };
}
function pick(arr, rng) {
  if (!arr || arr.length === 0) return "";
  const idx = Math.floor(rng() * arr.length);
  return arr[idx];
}
function render(tpl, ctx) {
  return tpl.replace(/\{(.*?)\}/g, (_,k) => {
    try {
      if (k.startsWith("pct(")) return fmtPct(evalKey(k.slice(4,-1), ctx));
      if (k.startsWith("fix(")) { let [v,d] = k.slice(4,-1).split(","); return fmtFix(evalKey(v.trim(), ctx), Number(d)); }
      if (k.startsWith("val(")) return fmtVal(evalKey(k.slice(4,-1), ctx));
      if (k.startsWith("dir(")) return fmtDir(evalKey(k.slice(4,-1), ctx));
      if (k==="pitch_list") return (ctx.pitcher?.primary_pitches||[]).slice(0,2).map(p=>p.pitch).join("/");
      return evalKey(k, ctx);
    } catch { return ""; }
  });
}
function evalKey(path, ctx) {
  if (path === "pitcher_tag") {
    // Append a small tag when we corrected a bad mapping
    if (ctx?._pitcherFix === "swapped_to_opponent") return " (opp)";
    if (ctx?._pitcherFix === "cleared_bad_self_pitcher") return " (opp?)";
    return "";
  }
  return path.split(".").reduce((o,k)=>o?.[k], ctx);
}
function fmtPct(x){ return x==null?"—":(100*x).toFixed(1)+"%"; }
function fmtFix(x,d){ return x==null?"—":Number(x).toFixed(d); }
function fmtVal(x){ return x==null?"—":x; }
function fmtDir(x){ if(x==null) return "flat"; return x>0?"up":"down"; }
function push(arr, tpl, ctx){ if(tpl) arr.push(render(tpl,ctx)); }

function bestPitchMatch(input){
  if(!input.hitter_vs_pitch) return null;
  const good = input.hitter_vs_pitch.filter(p=>p.sample_pa>=25 && p.xiso!=null);
  if(good.length===0) return null;
  const best = good.sort((a,b)=>(b.xiso||0)-(a.xiso||0))[0];
  return { match_pitch: best.pitch, match_xiso: best.xiso };
}
function envSummary(input){
  if(!input.park && !input.weather) return null;
  const hand = input.bats;
  const park_idx = hand==="L"?input.park?.hr_index_lhb:input.park?.hr_index_rhb;
  let park_dir = "neutral";
  if(park_idx!=null){
    if(park_idx>=120) park_dir="very favorable";
    else if(park_idx>=110) park_dir="favorable";
    else if(park_idx<=90) park_dir="tough";
  }
  let weather_blurb="", env_boost="";
  if(input.weather?.temp_f>=80) { weather_blurb="warm temps"; env_boost="plus"; }
  if(input.weather?.wind_dir?.startsWith("out") && input.weather?.wind_mph>=8){ weather_blurb="wind blowing out"; env_boost="plus"; }
  if(input.weather?.wind_dir==="in" && input.weather?.wind_mph>=8){ weather_blurb="wind in"; env_boost="minus"; }
  return { park_dir, park_idx, hand, weather_blurb, env_boost };
}
