// src/utils/why.js
export function buildWhy(input, seed){
  const rng = seeded((input.player||"") + (input.opponent||"") + new Date().toDateString(), seed);
  const parts = [];
  push(parts, pick(T_BASELINE, rng), input);

  const match = bestPitchMatch(input);
  if (match) push(parts, pick(T_PITCH_MATCH, rng), {...input, ...match});
  else push(parts, pick(T_PITCHER, rng), {...input, pitch_list: pitchList(input.pitcher||{primary_pitches:[]})});

  const env = envSummary(input);
  if (env) push(parts, pick(T_ENV, rng), {...input, ...env});

  const ip = num(input.implied_prob), tp = num(input.true_hr_prob);
  const edge_pts = (ip!=null && tp!=null) ? Math.round((tp - ip) * 1000)/10 : null;
  push(parts, pick(T_MARKET, rng), {...input, edge_pts});

  if (input.risk_notes) push(parts, pick(T_RISK, rng), input);
  if ((input.ev_per_unit ?? 0) <= 0) parts.unshift("Price-sensitive;");
  if (input.lineup_slot == null) parts.push("Lineup pending; PA subject to change.");

  const text = parts.filter(Boolean).slice(0,5).join(" ");
  return { text, bullets: parts };
}

const T_BASELINE = [
  "{player} projects from a {pct(base_hr_pa)} HR/PA baseline with ~{fix(exp_pa,1)} expected plate appearances.",
  "Baseline power is {pct(base_hr_pa)} per PA, supported by a likely {fix(exp_pa,1)} PA workload."
];
const T_PITCHER = [
  "He draws {pitcher.name}, a {pitcher.throws}-hander allowing {val(pitcher.hr9)} HR/9 and {pct(pitcher.barrel_pct_allowed)} barrels.",
  "{pitcher.name} leans on the {pitch_list} and has been vulnerable when behind in the count.",
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
const T_RISK = [ "Notes: {risk_notes}." ];

function push(arr, tpl, ctx){ if(!tpl) return; const s=render(tpl,ctx); if(s && !(/(\{\w+)/.test(s))) arr.push(s); }
function num(x){ return x==null? null : (typeof x==="number"? x : Number(x)); }
function seeded(key, extra){
  let h = 2166136261 >>> 0;
  for(let i=0;i<key.length;i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ()=>{ h += (extra ?? 0x9e3779b9); let t=(h^h>>>15)*2246822507; t=(t^t>>>13)*3266489909; return ((t^t>>>16)>>>0)/4294967296; }
}
function pick(arr, rng){ return arr[Math.floor(rng()*arr.length)]; }
function render(tpl, ctx){
  return tpl.replace(/\{(.*?)\}/g, (_,expr)=>{
    const m = expr.match(/(\w+)\((.*?)\)/);
    if(m){ const fn=m[1], arg=m[2]; return (formatters)[fn]?.(arg, ctx) ?? ""; }
    const v = get(ctx, expr); return v==null? "—" : String(v);
  });
}
function get(o, path){ return path.split(".").reduce((a,k)=> a? a[k]:undefined, o); }
const formatters = {
  pct: (field,c)=>{ const v=get(c,field); if(v==null) return "—"; const n=Number(v); return isFinite(n)? (Math.round(n*1000)/10)+"%":"—"; },
  fix: (field,c)=>{ const [f,precStr]=field.split(","); const v=get(c,f); const n=v==null? null:Number(v); const prec=precStr?Number(precStr):0; return n==null||!isFinite(n)?"—":n.toFixed(prec); },
  val: (field,c)=>{ const v=get(c,field); return v==null? "—": String(v); },
  dir: (field,c)=>{ const v=get(c,field); if(v==null) return "flat"; const n=Number(v); return n>0?"up":(n<0?"down":"flat"); }
};
function pitchList(p){ const arr=(p&&Array.isArray(p.primary_pitches)?p.primary_pitches:[]).slice(0,3).map(x=>x.pitch); return arr.join("/"); }
function bestPitchMatch(input){ const arr = Array.isArray(input.hitter_vs_pitch)? input.hitter_vs_pitch: []; const cand = arr.find(x=>x.sample_pa>=25 && x.xiso!=null); if(!cand) return null; return { match_pitch: cand.pitch, match_xiso: cand.xiso }; }
function envSummary(input){
  const bats = input.bats==="S"?"R":input.bats;
  const idx = bats==="R"? input?.park?.hr_index_rhb : input?.park?.hr_index_lhb;
  if (!idx) return null;
  let park_dir="neutral"; if(idx>=120) park_dir="very plus"; else if(idx>=110) park_dir="slightly plus"; else if(idx<=80) park_dir="very tough"; else if(idx<=90) park_dir="slightly tough";
  let env_boost="neutral"; const w=input.weather||{};
  if (w.temp_f && w.temp_f>=80) env_boost="plus";
  if (w.wind_dir && String(w.wind_dir).startsWith("out") && w.wind_mph && w.wind_mph>=8) env_boost="plus";
  if (w.wind_dir==="in" && w.wind_mph && w.wind_mph>=8) env_boost="minus";
  const weather_blurb = w ? `${w.temp_f??"—"}F, wind ${w.wind_mph??0}mph ${w.wind_dir??"calm"}` : "";
  return { park_dir, park_idx: idx, hand:bats, weather_blurb, env_boost };
}
