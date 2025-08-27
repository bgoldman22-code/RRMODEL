import React, { useEffect, useState } from "react";
import { americanFromProb, impliedFromAmerican, evFromProbAndOdds } from "./utils/ev.js";
import { hotColdMultiplier } from "./utils/hotcold.js";
import { normName, buildWhy } from "./utils/why.js";
import { pitchTypeEdgeMultiplier } from "./utils/model_scalers.js";

// === Variance Controls (no UI/odds changes) ===
const ANCHOR_CAP = 3;                 // Max anchors allowed per slate
const MIDRANGE_MIN_REQUIRED = 3;      // At least this many mid-range variance picks
const MIDRANGE_P_MIN = 0.13;          // ~ +650
const MIDRANGE_P_MAX = 0.25;          // ~ +300
const REPEAT_DAY_WINDOW = 3;          // Look back days for repeats
const MAX_CONSECUTIVE_REPEATS = 2;    // No 3+ consecutive days for same player

function loadRecentPicks(){
  try{
    const j = JSON.parse(localStorage.getItem("mlb_hr_recent_picks")||"{}");
    return j && typeof j==='object' ? j : {};
  }catch{ return {}; }
}
function saveTodayPicks(dateStr, names){
  try{
    const rec = loadRecentPicks();
    rec[dateStr] = names;
    // keep only last 7 entries
    const keys = Object.keys(rec).sort().slice(-7);
    const pruned = {};
    for(const k of keys) pruned[k] = rec[k];
    localStorage.setItem("mlb_hr_recent_picks", JSON.stringify(pruned));
  }catch{/* ignore */}
}
function consecutiveRepeatCount(recentMap, targetName){
  // Count consecutive days (most recent backwards) that include targetName
  const dates = Object.keys(recentMap).sort().reverse();
  let count = 0;
  for(const d of dates){
    const arr = Array.isArray(recentMap[d]) ? recentMap[d] : [];
    if(arr.some(n => n === targetName)) count++;
    else break;
    if(count >= 99) break;
  }
  return count;
}

function tagVariance(row){
  const p = Number(row.p_model||0);
  const mid = (p >= MIDRANGE_P_MIN && p <= MIDRANGE_P_MAX);
  const park = Number(row.parkHR||0);
  const hasPitchEdge = /pitch edge|pitch-type/i.test(String(row.why||""));
  const weakPitcher = (park >= 0.20) || hasPitchEdge; // proxy for exploitable
  const tagList = [];
  if(mid) tagList.push("mid-range");
  if(weakPitcher) tagList.push("exploitable-pitcher");
  return { mid, weakPitcher, variance: (mid || weakPitcher), tagList };
}



// --- Straight HR Bets helpers ---
const _fmtPct = (p) => (p != null ? `${(p*100).toFixed(1)}%` : "—");
const _fmtAmerican = (a) => (a == null ? "—" : (a > 0 ? `+${a}` : `${a}`));


const RANK_ODDS_WEIGHT = Number(import.meta.env.VITE_RANK_ODDS_WEIGHT || process.env.RANK_ODDS_WEIGHT || 0.3);
const BVP_MIN_AB = 10; // >9 AB threshold
const BVP_MAX_BOOST = 0.06; // ±6%
const PROTECTION_MAX = 0.05; // +5% cap
const CAL_LAMBDA = 0.25;
const HOTCOLD_CAP = 0.06;
const MIN_PICKS = 12;
const BONUS_COUNT = parseInt(import.meta.env.VITE_BONUS_COUNT||process.env.BONUS_COUNT||8,10);
// Fallback Why explainer

// WHY+ (causal): build reasons and bold the biggest factor

// Build Pure EV list (p >= 19% and EV > 0)
function buildPureEV(rows){
  try{
    const out = rows
      .filter(r => Number(r.modelProb) >= 0.19 && Number(r.ev) > 0)
      .sort((a,b)=> (b.ev ?? 0) - (a.ev ?? 0));
    return out.slice(0, 40);
  }catch{ return []; }
}
// WHY+ (causal): build reasons and bold/star the biggest positive factor
function explainRow({ baseProb=0, hotBoost=1, calScale=1, pitcherName=null, pitcherHand=null, parkHR=null, weatherHR=null, spShare=null, c=null }){
  const reasons = [];
  const add = (text, score, positive=true) => { if (text) reasons.push({ text, score: Number(score)||0, positive }); };

  // 1) BIG H2H
  const bvp = c?.bvp;
  if (bvp && Number(bvp.ab)>=8 && Number(bvp.hr)>=2){
    add(`${bvp.hr} HR in ${bvp.ab} PA vs ${pitcherName||'SP'}`, 1.00, true);
  }

  // 2) Pitch-type micro edge (if provided)
  const mul = Number(c?.pitchMicroMul ?? c?.pitchMul ?? 1.0);
  if (isFinite(mul) && Math.abs(mul-1) >= 0.03){
    const sign = mul>1?'+':'−';
    const pct = Math.round(Math.abs((mul-1)*100));
    const hand = (pitcherHand?` (${String(pitcherHand).toUpperCase()})`:'');
    add(`Punishes SP pitch mix${hand} ${sign}${pct}%`, 0.85 + Math.min(0.15, Math.abs(mul-1)), mul>1);
  }

  // 3) Bullpen exposure
  if (typeof spShare==='number'){
    const bpShare = Math.max(0, Math.min(1, 1-spShare));
    const bpFit = Number(c?.bp_hr_fit ?? c?.bp_hr_mult ?? 1.0);
    const fitPct = isFinite(bpFit) ? Math.round((bpFit-1)*100) : 0;
    if (bpShare>0.25 || Math.abs(fitPct)>=2){
      if (fitPct>0){
        add(`Likely ${Math.round(bpShare*100)}% PA vs HR‑prone pen (+${fitPct}%)`, 0.70 + Math.min(0.20, (bpFit-1)), true);
      }else{
        add(`Likely ${Math.round(bpShare*100)}% PA vs bullpen`, 0.45, false);
      }
    }
  }

  // 4) Park/spray fit
  const parkMul = Number.isFinite(Number(c?.playerParkHR)) ? Number(c.playerParkHR) : (Number.isFinite(Number(parkHR)) ? Number(parkHR) : 1.0);
  if (isFinite(parkMul) && Math.abs(parkMul-1) >= 0.03){
    const sign = parkMul>1 ? '+' : '−';
    const pct = Math.round(Math.abs(parkMul-1)*100);
    add(`Spray × park fit ${sign}${pct}%`, 0.55 + Math.min(0.20, Math.abs(parkMul-1)), parkMul>1);
  }

  // 5) Weather (if available)
  const wMul = Number(c?.playerWeatherHR ?? weatherHR ?? 1.0);
  if (isFinite(wMul) && Math.abs(wMul-1) >= 0.03){
    const sign = wMul>1 ? '+' : '−';
    const pct = Math.round(Math.abs(wMul-1)*100);
    add(`Weather HR ${sign}${pct}%`, 0.45 + Math.min(0.15, Math.abs(wMul-1)), wMul>1);
  }

  // 6) Recent form
  const hr7 = Number(c?.form?.hr7 ?? 0);
  const barrels = Number(c?.form?.barrels7 ?? 0);
  if (hr7>0 || barrels>0){
    add(`Hot: ${hr7} HR, ${barrels} barrels (7–10d)`, 0.40 + Math.min(0.15, hr7*0.03 + barrels*0.01), true);
  }

  // 7) Model
  if (typeof baseProb==='number' && isFinite(baseProb)) add(`Model ${(baseProb*100).toFixed(1)}%`, 0.30, true);
  if (typeof calScale==='number' && calScale!==1){
    const sign = calScale>1?'+':'−';
    const pct = Math.round(Math.abs((calScale-1)*100));
    add(`Calibration ${sign}${pct}%`, 0.20, calScale>1);
  }
  if (pitcherName){
    const hand = pitcherHand ? ` (${String(pitcherHand).toUpperCase()})` : "";
    add(`vs ${pitcherName}${hand}`, 0.10, false);
  }

  if (!reasons.length) return "";
  let maxIdx = -1, maxScore = -1;
  for (let i=0;i<reasons.length;i++){
    const r = reasons[i];
    if (r.positive && r.score > maxScore){ maxScore = r.score; maxIdx = i; }
  }
  if (maxIdx === -1){
    for (let i=0;i<reasons.length;i++){
      if (reasons[i].score > maxScore){ maxScore = reasons[i].score; maxIdx = i; }
    }
  }
  const out = reasons.map((r,idx)=> idx===maxIdx ? `★ **${r.text}**` : r.text);
  return out.join(' • ');
}


const MAX_PER_GAME = 2;

function fmtET(date=new Date()){
  return new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", month:"short", day:"2-digit", year:"numeric"}).format(date);
}

async function getBvPMap(pairs){
  let out = new Map();
  const uniq = [];
  const seen = new Set();
  for(const p of pairs){
    if(!p || !p.batterId || !p.pitcherId) continue;
    const key = `${p.batterId}|${p.pitcherId}`;
    if(seen.has(key)) continue;
    seen.add(key); uniq.push(p);
  }
  for(const {batterId, pitcherId} of uniq){
    const key = `${batterId}|${pitcherId}`;
    try{
      const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=vsPlayer&opposingPlayerId=${pitcherId}`;
      const r = await fetch(url);
      if(!r.ok) { out.set(key,{ab:0,hr:0,pa:0}); continue; }
      const j = await r.json();
      const splits = j?.stats?.[0]?.splits || [];
      const stat = splits[0]?.stat || {};
      const ab = Number(stat?.atBats||0);
      const hr = Number(stat?.homeRuns||0);
      const pa = Number(stat?.plateAppearances||ab||0);
      out.set(key, {ab, hr, pa});
    }catch(e){
      out.set(key,{ab:0,hr:0,pa:0});
    }
  }
  return out;
}

function bvpModifier(p_game, ab, hr){
  const baseline_pa = 4.0;
  const base_rate = Math.max(0, Math.min(0.5, Number(p_game||0)/baseline_pa));
  if(!ab || ab < BVP_MIN_AB) return 0;
  const hr_rate = Math.max(0, Math.min(0.5, hr/ab));
  const delta = hr_rate - base_rate;
  const weight = Math.min(1, ab / 40);
  let mod = delta * weight * 100;
  if (mod > BVP_MAX_BOOST*100) mod = BVP_MAX_BOOST*100;
  if (mod < -BVP_MAX_BOOST*100) mod = -BVP_MAX_BOOST*100;
  return mod/100;
}

function protectionModifier(p_self, teamPeers){
  if(!Array.isArray(teamPeers) || teamPeers.length===0) return 0;
  const sorted = teamPeers.slice().sort((a,b)=>b-a);
  const sumTop2 = (sorted[0]||0) + (sorted[1]||0);
  let mod = 0.08 * sumTop2;
  if (mod > PROTECTION_MAX) mod = PROTECTION_MAX;
  if (mod < 0) mod = 0;
  return mod;
}
function dateISO_ET(offsetDays=0){
  const d = new Date();
  const et = new Intl.DateTimeFormat("en-CA",{ timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
  const base = new Date(et+"T00:00:00Z");
  base.setUTCDate(base.getUTCDate()+offsetDays);
  return new Intl.DateTimeFormat("en-CA",{ timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(base);
}
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }, cache:"no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [bonus, setBonus] = useState([]);

  const [rawTop, setRawTop] = useState([]);
    const [anchor, setAnchor] = useState(null);
const [meta, setMeta]   = useState({});
  const [pureEV, setPureEV] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function getCalibration(){
    try{ const j = await fetchJSON("/.netlify/functions/mlb-calibration"); return j?.global?.scale ? j : { global:{ scale:1.0 }, bins:[] }; }
    catch{ return { global:{ scale:1.0 }, bins:[] }; }
  }

  async function tryEndpoints(endpoints){
    for(const url of endpoints){
      try{
        const j = await fetchJSON(url);
        if(Array.isArray(j?.candidates) && j.candidates.length>0) return j.candidates;
        if(Array.isArray(j?.rows) && j.rows.length>0) return j.rows;
      }catch(e){ /* try next */ }
    }
    return [];
  }

  async function getSlate(){
    const endpoints = [
      "/.netlify/functions/mlb-slate-lite",
      "/.netlify/functions/mlb-slate",
      "/.netlify/functions/mlb-candidates",
      "/.netlify/functions/mlb-schedule",
    ];
    const cand = await tryEndpoints(endpoints);
    if(cand.length>0) return cand;
    throw new Error("No candidate endpoint returned players.");
  }

  async function getHotColdBulk(ids){
    try{
      const end = dateISO_ET(0);
      const d = new Date(end+"T00:00:00");
      d.setDate(d.getDate()-13);
      const beg = new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
      const url = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=stats(group=hitting,type=byDateRange,beginDate=${beg},endDate=${end})`;
      const j = await fetchJSON(url);
      let out = new Map();
      for(const p of (j.people||[])){
        const sid = p?.id;
        let hr14=0, pa14=0;
        for(const s of (p?.stats||[])){
          for(const sp of (s?.splits||[])){
            hr14 += Number(sp?.stat?.homeRuns || 0);
            pa14 += Number(sp?.stat?.plateAppearances || 0);
          }
        }
        out.set(String(sid), { hr14, pa14 });
      }
      return out;
    }catch{ return new Map(); }
  }

  
async function getOddsMap(){
    try{
      const res = await fetch("/.netlify/functions/odds-get", { cache: "no-store" });
      if(!res.ok) return new Map();
      const snap = await res.json();
      const players = snap?.players || {};
      const map = new Map();
      const normalize = (str) => String(str||"").toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[.]/g,'').replace(/[’']/g,"'").trim();
      for(const [raw, rec] of Object.entries(players)){
        if(rec && rec.median_american!=null){
          map.set(normalize(raw), { american: rec.median_american, books: rec.count_books, by_book: rec.by_book });
        }
      }
      return map;
    }catch(e){ return new Map(); }
  }

  function applyCalibration(p, scale){
    const scaled = Math.max(0.0005, Math.min(0.95, p * scale));
    return (1 - CAL_LAMBDA) * p + CAL_LAMBDA * scaled;
  }

  
  async function build(){
  // Canonical selections and maps
  let out = [];
  let perGame = new Map();

  // Canonical selections and maps
  out = [];
  perGame = new Map();

    setLoading(true); setMessage(""); setPicks([]);
    try{
      const [cals, baseCandidates] = await Promise.all([ getCalibration(), getSlate() ]);
      const ids = baseCandidates.map(x => x.batterId).filter(Boolean);
      const [hotMap, oddsMap] = await Promise.all([ getHotColdBulk(ids), getOddsMap() ]);

      
      const temp = [];
      const teamToPpre = new Map();
      const bvpPairs = [];

      // Pass 1: compute calibrated p_pre (before new modifiers), collect team pools && BvP pairs
      for(const c of baseCandidates){
        let p = Number(c.baseProb||c.prob||0);
        if(!p || p<=0) continue;
        const hc = hotMap.get(String(c.batterId)) || { hr14:0, pa14:0 };
        const hcMul = hotColdMultiplier({ hr14:hc.hr14, pa14:hc.pa14, seasonHR:Number(c.seasonHR||0), seasonPA:Number(c.seasonPA||0) }, HOTCOLD_CAP);
        p = p * hcMul;
        const calScale = Number(cals?.global?.scale || 1.0);
        p = applyCalibration(p, calScale);

        // Pitch-type edge
        try {
          const pitchMul = pitchTypeEdgeMultiplier ? pitchTypeEdgeMultiplier({
            hitter_vs_pitch: c.hitter_vs_pitch || c.hvp || [],
            pitcher: c.pitcher || { primary_pitches: c.primary_pitches || [] },
          }) : 1.00;
          if (typeof p === "number" && isFinite(p)) p *= pitchMul;
        } catch {}

        temp.push({ c, p_pre: p, hcMul, calScale });
        if (c.team){
          const arr = teamToPpre.get(c.team) || [];
          arr.push(p);
          teamToPpre.set(c.team, arr);
        }
        if (c.batterId && c.pitcherId){
          bvpPairs.push({ batterId: c.batterId, pitcherId: c.pitcherId });
        }
      }

      // Fetch BvP
      let bvpMap = new Map();
      try { bvpMap = await getBvPMap(bvpPairs); } catch(e){ bvpMap = new Map(); }

      // Pass 2: apply modifiers && build rows
      const rows = [];
      for (const t of temp){
        const c = t.c;
        let p = t.p_pre;

        // === Cold-bat suppression & season baseline cap ===
        try {
          const hr7 = Number(c?.form?.hr7 ?? 0);
          const hr15 = Number(c?.form?.hr15 ?? 0);
          const barrels7 = Number(c?.form?.barrels7 ?? 0);
          if (hr7 === 0) p *= 0.70;
          if (hr15 <= 1) p *= 0.80;
          if (barrels7 === 0) p *= 0.85;
          const seasonHR = Number(c?.seasonHR ?? c?.hr ?? 0);
          const seasonPA = Number(c?.seasonPA ?? c?.pa ?? 0);
          const seasonRate = seasonHR / Math.max(1, seasonPA);
          let cap = (hr7 >= 2 || barrels7 >= 4) ? Math.max(0.30, seasonRate * 3) : (seasonRate * 2);
          if (isFinite(cap) && cap > 0) p = Math.min(p, cap);
        } catch {}
        let bvp_mod = 0, protection_mod = 0;

        // BvP (>=10 AB)
        if (c.batterId && c.pitcherId){
          const key = `${c.batterId}|${c.pitcherId}`;
          const rec = bvpMap.get(key);
          if (rec && rec.ab >= BVP_MIN_AB){
            bvp_mod = bvpModifier(p, rec.ab, rec.hr);
            p = p * (1 + bvp_mod);
          }
        }

        // Protection
        if (c.team){
          const peers = (teamToPpre.get(c.team)||[]).filter(val => val !== t.p_pre);
          protection_mod = protectionModifier(p, peers);
          if (protection_mod > 0) p = p * (1 + protection_mod);
        }

        // Odds & EV
        const keyName = String(c.name||"").toLowerCase();
        const found = oddsMap.get(keyName);
        const modelAmerican = americanFromProb(p);
        const american = (found?.american!=null) ? found.american : modelAmerican;
        const ev = evFromProbAndOdds(p, american);

        // Rank score with odds weight suppressed
        const implied = impliedFromAmerican(american);
        const edge = (implied!=null) ? Math.max(0, p - implied) : 0;
        const rankScore = p + (RANK_ODDS_WEIGHT * edge);

        rows.push({
          name: c.name, team: c.team, game: c.gameId || c.game || c.opp || "",
          batterId: c.batterId,
          p_model: p, modelAmerican, american, ev, rankScore,
          bvp_mod, protection_mod, parkHR: (c.parkHR ?? null),
          why: explainRow({ c, spShare: (typeof c.__spShare==='number'?c.__spShare:null),
            baseProb: Number(c.baseProb ?? c.prob ?? 0),
            hotBoost: t.hcMul, calScale: t.calScale,
            oddsAmerican: american,
            pitcherName: c.pitcherName ?? null, pitcherHand: c.pitcherHand ?? null,
            parkHR: c.parkHR ?? null, weatherHR: c.weatherHR ?? null
          })
        });
      }
rows.sort((a,b)=> (b.rankScore ?? b.ev) - (a.rankScore ?? a.ev));

      // Build Pure EV table source (p_model >= 19%)
      try {
        const ev19 = rows
          .filter(r => (Number(r.p_model)||0) >= 0.19 && r.american != null && isFinite(Number(r.ev)))
          .sort((a,b)=> Number(b.ev) - Number(a.ev));
        setPureEV(ev19);
      } catch(_) { setPureEV([]); }


      // === Variance-aware selection (anchors cap, mid-range quota, repeat cap) ===
      const recent = loadRecentPicks();
      const byName = (r) => String(r.name||"");

      // Compute tags
      const rowsWithTags = rows.map(r => {
        const t = tagVariance(r);
        return { ...r, __var: t };
      });

      // Identify anchors: highest baseline probabilities
      const anchorsPool = [...rowsWithTags].sort((a,b)=> (b.p_model||0)-(a.p_model||0));
      const chosenAnchors = [];
      for(const r of anchorsPool){
        if(chosenAnchors.length >= ANCHOR_CAP) break;
        // respect per-game cap later; here just mark potential anchors
        chosenAnchors.push({ ...r, why: r.why ? (r.why + " • Anchor rule") : "Anchor rule" });
      }
      const anchorNames = new Set(chosenAnchors.map(x=>byName(x)));

      // Build mid-range pool
      const midPool = rowsWithTags.filter(r => r.__var.mid);

      // Helper to check repeat constraint
      function canUse(r){
        const cnt = consecutiveRepeatCount(recent, byName(r));
        return cnt < MAX_CONSECUTIVE_REPEATS;
      }

      // Assemble 'out' honoring per-game cap, anchor cap, mid-range minimum, and repeats
      out = [];
      perGame = new Map();
      let midCount = 0;
      let anchorsUsed = 0;

      // First pass: prioritize anchors & top EV while skipping repeats
      for(const r of rowsWithTags){
        const g = r.game || "UNK";
        const n = perGame.get(g)||0;
        if(n >= MAX_PER_GAME) continue;

        const isAnchor = anchorNames.has(byName(r));
        if(isAnchor && anchorsUsed >= ANCHOR_CAP) continue;
        if(!canUse(r)) continue;

        out.push(r);
        perGame.set(g, n+1);
        if(isAnchor) anchorsUsed++;
        if(r.__var.mid) midCount++;

        if(out.length >= MIN_PICKS) break;
      }

      // Ensure mid-range minimum by swapping in mid-range candidates not already picked
      if(midCount < MIDRANGE_MIN_REQUIRED){
        const need = MIDRANGE_MIN_REQUIRED - midCount;
        const pickedKey = new Set(out.map(x => byName(x)+"|"+(x.game||"")));
        const replaceableIdx = out
          .map((r,i)=>({r,i}))
          .filter(o => !o.r.__var.mid)  // replace non-mid
          .map(o => o.i);

        let irep = 0;
        for(const m of midPool){
          if(irep >= need) break;
          const key = byName(m)+"|"+(m.game||"");
          if(pickedKey.has(key)) continue;
          if(!canUse(m)) continue;
          // find a slot to replace that doesn't violate per-game cap
          while(irep < replaceableIdx.length){
            const idx = replaceableIdx[irep++];
            const g = m.game || "UNK";
            const countInGame = out.filter(x => (x.game||"")===g).length;
            if(countInGame >= MAX_PER_GAME) continue;
            out[idx] = m;
            midCount++;
            break;
          }
        }
      }

      // Trim to MIN_PICKS if somehow overfilled
      if(out.length > MIN_PICKS) out.length = MIN_PICKS;

      // Save today's names for repeat logic
      try { saveTodayPicks(fmtET(), out.map(x => byName(x))); try{ window.__variance_meta = { anchorsUsed, midCount, minPicks: MIN_PICKS }; }catch{} } catch {}


      out = [];
      perGame = new Map();
      for(const r of rows){
        const g = r.game || "UNK";
        const n = perGame.get(g)||0;
        if(n >= MAX_PER_GAME) continue;
        out.push(r);
        perGame.set(g, n+1);
        if(out.length>=MIN_PICKS) break;
      }

      // Build bonus picks (next best by EV not in top MIN_PICKS), respecting per-game cap
      const picked = new Set(out.map(x => `${x.name}|${x.game}`));
      const bonusOut = [];
      for (const r of rows){
        const key = `${r.name}|${r.game}`;
        if (picked.has(key)) continue;
        const n = (perGame.get(r.game||"UNK")||0);
        if (n >= MAX_PER_GAME) continue;
        bonusOut.push(r);
        perGame.set(r.game||"UNK", n+1);
        if (bonusOut.length >= BONUS_COUNT) break;
      // Anchor pick (context override): surface elite short-odds bat in big-HR park
      try {
        const already = new Set([...out.map(r=>String(r.name).toLowerCase()), ...bonusOut.map(r=>String(r.name).toLowerCase())]);
        const pcts = rows.map(r=>r.p_model).filter(x=>typeof x==='number' && x>0).sort((a,b)=>a-b);
        const q = pcts.length ? pcts[Math.floor(0.75*(pcts.length-1))] : 0.30; // top quartile or 30%
        let best = null;
        for (const r of rows){
          const key = String(r.name||'').toLowerCase();
          if (already.has(key)) continue;
          const odds = Number(r.american);
          const park = (typeof r.parkHR==='number') ? r.parkHR : 0;
          if (!Number.isFinite(odds) || odds < 120 || odds > 240) continue;   // short-to-mid
          if (!(park >= 0.15)) continue;                                      // needs big park boost (e.g., Coors ~0.25)
          if (!(typeof r.p_model==='number' && r.p_model >= Math.max(q, 0.30))) continue;
          const score = (r.p_model||0)*100 + (240-(odds||240)) + (park*100);
          if (!best || score > best.anchorScore){
            best = { ...r, anchorScore: score, anchorWhy: (r.why ? (r.why + ' • Anchor rule') : 'Anchor rule') };
          }
        }
        setAnchor(best||null);
      } catch { setAnchor(null); }

      }

      setPicks(out);
      setBonus(bonusOut);
      try{
        const raw = rows
          .filter(r=> typeof r.p_model === 'number')
          .sort((a,b)=> b.p_model - a.p_model)
          .slice(0,13)
          .map(r => ({ name: r.name, game: r.game, p_model: r.p_model, american: r.american, why: r.why }));
        setRawTop(raw);
      }catch{ setRawTop([]); }
    
      setMeta({
        date: fmtET(),
        totalCandidates: baseCandidates.length,
        usedOdds: oddsMap.size>0,
        calibrationScale: Number(cals?.global?.scale || 1.0),
      });
      if(out.length < MIN_PICKS){
        setMessage(`Small slate or limited data — picked ${out.length} best by EV (max ${MAX_PER_GAME} per game).`);
      }
    }catch(e){
      console.error(e);
      setMessage(String(e?.message||e));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{}, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">MLB HR — Calibrated + Hot/Cold + Odds-first EV</h1>
        <button onClick={build} className="px-3 py-2 bg-blue-600 text-white rounded" disabled={loading}>
          {loading ? "Working..." : "Generate"}
        </button>
      </div>
      {message && <div className="mt-3 text-red-700">{message}</div>}
      <div className="mt-2 text-sm text-gray-600">
        Date (ET): {meta.date} • Candidates: {meta.totalCandidates||0} • Using OddsAPI: {meta.usedOdds ? "yes":"no"} • Calibration scale: {meta.calibrationScale?.toFixed(2)}
      </div>
      
      {anchor && (
        <div className="mt-6">
          <div className="text-sm font-semibold mb-2">Anchor pick (context override)</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-blue-50">
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-3 py-2 text-right">Model HR%</th>
                <th className="px-3 py-2 text-right">Model Odds</th>
                <th className="px-3 py-2 text-right">Actual Odds</th>
                <th className="px-3 py-2 text-right">EV (1u)</th>
                <th className="px-3 py-2 text-left">Why</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-3 py-2">{anchor.name} <span className="ml-2 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 px-2 py-0.5">Anchor</span></td>
                <td className="px-3 py-2">{anchor.game}</td>
                <td className="px-3 py-2 text-right">{(anchor.p_model*100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right">{anchor.modelAmerican>0?`+${anchor.modelAmerican}`:anchor.modelAmerican}</td>
                <td className="px-3 py-2 text-right">{anchor.american>0?`+${anchor.american}`:anchor.american}</td>
                <td className="px-3 py-2 text-right">{anchor.ev.toFixed(3)}</td>
                <td className="px-3 py-2">{anchor.anchorWhy || anchor.why}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-3 py-2 text-right">Model HR%</th>
              <th className="px-3 py-2 text-right">Model Odds</th>
              <th className="px-3 py-2 text-right">Actual Odds</th>
              <th className="px-3 py-2 text-right">EV (1u)</th>
              <th className="px-3 py-2 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((r,i)=> (
              <tr key={i} className="border-b">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.game}</td>
                <td className="px-3 py-2 text-right">{(r.p_model*100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right">{r.modelAmerican>0?`+${r.modelAmerican}`:r.modelAmerican}</td>
                <td className="px-3 py-2 text-right">{r.american>0?`+${r.american}`:r.american}</td>
                <td className="px-3 py-2 text-right">{r.ev.toFixed(3)}</td>
                <td className="px-3 py-2">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      {bonus.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Bonus picks (near threshold)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-left">Game</th>
                  <th className="px-3 py-2 text-right">Model HR%</th>
                  <th className="px-3 py-2 text-right">Model Odds</th>
                  <th className="px-3 py-2 text-right">Actual Odds</th>
                  <th className="px-3 py-2 text-right">EV (1u)</th>
                  <th className="px-3 py-2 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {bonus.map((r,i)=> (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.game}</td>
                    <td className="px-3 py-2 text-right">{(r.p_model*100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{r.american>0?`+${r.american}`:r.american}</td>
                    <td className="px-3 py-2 text-right">{r.ev.toFixed(3)}</td>
                    <td className="px-3 py-2">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
      {/* --- Straight HR Bets (Top 13 Raw Probability) --- */}
      {Array.isArray(rawTop) && rawTop.length>0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Straight HR Bets (Top 13 Raw Probability)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-left">Game</th>
                  <th className="px-3 py-2 text-right">Model HR%</th>
                  <th className="px-3 py-2 text-right">Actual Odds</th>
                  <th className="px-3 py-2 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {rawTop.map((r,i)=>(
                  <tr key={`rawprob-${i}`} className="border-b">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.game || "—"}</td>
                    <td className="px-3 py-2 text-right">{_fmtPct(r.p_model)}</td>
                    <td className="px-3 py-2 text-right">{_fmtAmerican(r.american)}</td>
                    <td className="px-3 py-2">{r.why || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">
              This list ignores EV && shows the highest raw HR probabilities so you don’t miss marquee bats or extreme park spots even when books price them tightly.
            </p>
          </div>
        </div>
      
    )}
      {/* --- Pure EV (Model p ≥ 19%) --- */}
      {Array.isArray(pureEV) && pureEV.length>0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Pure EV (Model p ≥ 19%)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-left">Game</th>
                  <th className="px-3 py-2 text-right">Model HR%</th>
                  <th className="px-3 py-2 text-right">Actual Odds</th>
                  <th className="px-3 py-2 text-right">EV (1u)</th>
                  <th className="px-3 py-2 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {pureEV.slice(0, 25).map((r,i)=> (
                  <tr key={`pureev-${i}`} className="border-b">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.game || "—"}</td>
                    <td className="px-3 py-2 text-right">{_fmtPct(r.p_model)}</td>
                    <td className="px-3 py-2 text-right">{_fmtAmerican(r.american)}</td>
                    <td className="px-3 py-2 text-right">{Number(r.ev).toFixed(3)}</td>
                    <td className="px-3 py-2">{r.why || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">
              EV computed from model probability and current book odds; filtered by model p ≥ 19% to avoid pure longshots.
            </p>
          </div>
        </div>
  )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
