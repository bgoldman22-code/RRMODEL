import React, { useEffect, useState } from "react";
import { americanFromProb, impliedFromAmerican, evFromProbAndOdds } from "./utils/ev.js";
import { hotColdMultiplier } from "./utils/hotcold.js";
import { normName, buildWhy } from "./utils/why.js";
import { pitchTypeEdgeMultiplier } from "./utils/model_scalers.js";


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
function explainRow({ baseProb=0, hotBoost=1, calScale=1, oddsAmerican=null, pitcherName=null, pitcherHand=null, parkHR=null, weatherHR=null }){
  const pts = [];
  if (typeof baseProb==='number') pts.push(`model ${(baseProb*100).toFixed(1)}%`);
  if (typeof hotBoost==='number' && hotBoost!==1){ const sign=hotBoost>1?'+':'−'; pts.push(`hot/cold ${sign}${Math.abs((hotBoost-1)*100).toFixed(0)}%`); }
  if (typeof calScale==='number' && calScale!==1){ const sign=calScale>1?'+':'−'; pts.push(`calibration ${sign}${Math.abs((calScale-1)*100).toFixed(0)}%`); }
  if (pitcherName){ pts.push(`vs ${pitcherName}${pitcherHand?` (${String(pitcherHand).toUpperCase()})`:''}`); }
  if (typeof parkHR==='number' && parkHR!==1){ const sign=parkHR>1?'+':'−'; pts.push(`park HR ${sign}${Math.abs((parkHR-1)*100).toFixed(0)}%`); }
  if (typeof weatherHR==='number' && weatherHR!==1){ const sign=weatherHR>1?'+':'−'; pts.push(`weather HR ${sign}${Math.abs((weatherHR-1)*100).toFixed(0)}%`); }
  if (oddsAmerican!=null){ pts.push(`odds ${oddsAmerican>=0?'+':''}${Math.round(oddsAmerican)}`); }
  return pts.join(' • ');
}
const MAX_PER_GAME = 2;

function fmtET(date=new Date()){
  return new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", month:"short", day:"2-digit", year:"numeric"}).format(date);
}

async function getBvPMap(pairs){
  const out = new Map();
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


// ----- Model adjustment helpers (no-ops if metadata missing) -----
function platoonMultiplier(bats, pitcherHand) {
  if (!bats || !pitcherHand) return 1;
  const b = (''+bats).toUpperCase()[0]; // 'L'|'R'|'S'
  const p = (''+pitcherHand).toUpperCase()[0];
  if (b === 'S') return p === 'R' ? 1.05 : 0.97;
  if (b === 'L' && p === 'R') return 1.06;
  if (b === 'L' && p === 'L') return 0.94;
  if (b === 'R' && p === 'L') return 1.04;
  if (b === 'R' && p === 'R') return 0.96;
  return 1;
}
function hotColdMultiplier(recentHRs7d, paLast50) {
  let m = 1;
  if (typeof recentHRs7d === 'number' && recentHRs7d > 0) m *= 1.04;
  if (typeof paLast50 === 'number' && paLast50 >= 50 && recentHRs7d === 0) m *= 0.98;
  return m;
}
function pitchMixMultiplier(playerWeakness, pitcherMix) {
  // playerWeakness: { sliderBad?:boolean, fastballBad?:boolean, sliderGood?:boolean, fastballGood?:boolean }
  // pitcherMix: { ff?: number, fa?:number, fourseam?:number, sl?:number, slider?:number }
  if (!pitcherMix) return 1;
  const ff = pitcherMix.ff ?? pitcherMix.fa ?? pitcherMix.fourseam;
  const sl = pitcherMix.sl ?? pitcherMix.slider;
  let adj = 0;
  if (sl && playerWeakness?.sliderBad) adj += Math.min(sl * 0.15, 0.05); // up to +5%
  if (sl && playerWeakness?.sliderGood) adj -= Math.min(sl * 0.15, 0.05);
  if (ff && playerWeakness?.fastballBad) adj += Math.min(ff * 0.10, 0.04);
  if (ff && playerWeakness?.fastballGood) adj -= Math.min(ff * 0.10, 0.04);
  return Math.max(0.90, Math.min(1.10, 1 + adj));
}
function envMultiplier(parkHrFactor, weather={}){
  // parkHrFactor: +0.20 => Coors; -0.10 => DET; or already as decimal delta
  let m = 1;
  if (typeof parkHrFactor === 'number') {
    m *= (1 + Math.max(-0.20, Math.min(0.20, parkHrFactor))); // clamp ±20%
  }
  const { windOut, tempF } = weather;
  if (typeof windOut === 'number' && windOut >= 10) m *= 1.05;
  if (typeof tempF === 'number' && tempF >= 85) m *= 1.02;
  return m;
}
function clampProb(p){
  return Math.max(0.01, Math.min(0.95, p));
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [bonus, setBonus] = useState([]);

  const [rawTop, setRawTop] = useState([]);
  const [pureEV, setPureEV] = useState([]);
    const [anchor, setAnchor] = useState(null);
const [meta, setMeta]   = useState({});
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
      const out = new Map();
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
    setLoading(true); setMessage(""); setPicks([]);
    try{
      const [cals, baseCandidates] = await Promise.all([ getCalibration(), getSlate() ]);
      const ids = baseCandidates.map(x => x.batterId).filter(Boolean);
      const [hotMap, oddsMap] = await Promise.all([ getHotColdBulk(ids), getOddsMap() ]);

      
      const temp = [];
      const teamToPpre = new Map();
      const bvpPairs = [];

      // Pass 1: compute calibrated p_pre (before new modifiers), collect team pools and BvP pairs
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

      // Pass 2: apply modifiers and build rows
      const rows = [];
      for (const t of temp){
        const c = t.c;
        let p = t.p_pre;
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
          why: explainRow({
            baseProb: Number(c.baseProb ?? c.prob ?? 0),
            hotBoost: t.hcMul, calScale: t.calScale,
            oddsAmerican: american,
            pitcherName: c.pitcherName ?? null, pitcherHand: c.pitcherHand ?? null,
            parkHR: c.parkHR ?? null, weatherHR: c.weatherHR ?? null
          })
        });
      }
rows.sort((a,b)=> (b.rankScore ?? b.ev) - (a.rankScore ?? a.ev));

      // Build Pure EV list with probability floor
      const EV_FLOOR = Number(import.meta.env.VITE_PURE_EV_FLOOR || process.env.PURE_EV_FLOOR || 0.22);
      const pureEvAll = rows
        .filter(r => typeof r.p_model === 'number' && r.p_model >= EV_FLOOR && typeof r.ev === 'number')
        .slice()  // copy
        .sort((a,b)=> (b.ev - a.ev));
      setPureEV(pureEvAll.slice(0, 13));


      const out = [];
      const perGame = new Map();
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
                    <td className="px-3 py-2 text-right">{r.modelAmerican>0?`+${r.modelAmerican}`:r.modelAmerican}</td>
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
              This list ignores EV and shows the highest raw HR probabilities so you don’t miss marquee bats or extreme park spots even when books price them tightly.
            </p>
        </div>

        {/* --- Pure EV (with probability floor) --- */}
        {Array.isArray(pureEV) && pureEV.length>0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">
              Best EV (floor ≥ {(Number(import.meta.env.VITE_PURE_EV_FLOOR || process.env.PURE_EV_FLOOR || 0.22)*100).toFixed(0)}% model HR)
            </h2>
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
                  {pureEV.map((r,i)=>(
                    <tr key={`pureev-${i}`} className="border-b">
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
              <p className="text-xs text-gray-500 mt-2">
                EV(1u) = p·(decimal−1) − (1−p). Uses book odds when available, else model odds.
              </p>
            </div>
          </div>
        )}

          </div>
        </div>
      )}

          </div>
        </div>
      )}

      </div>
    </div>
  );

      // Adjust probabilities with easy-win factors when metadata available
      rows.forEach(r => {
        const base = typeof r.p_model === 'number' ? r.p_model : (typeof r.p === 'number' ? r.p : null);
        if (base == null) return;
        const bats = r.bats || r.batterHand || r.side;
        const pHand = r.pitcherHand || r.p_hand || r.hand;
        const parkF = r.parkHR ?? r.parkHr ?? r.parkHrFactor;
        const weather = r.weather || { windOut: r.windOut, tempF: r.tempF };
        const pitcherMix = r.pitchMix || r.pitcherMix;
        const weakness = r.weakness || r.playerWeakness;
        let pAdj = base;
        pAdj *= platoonMultiplier(bats, pHand);
        pAdj *= hotColdMultiplier(r.recentHRs7d, r.paLast50);
        pAdj *= pitchMixMultiplier(weakness, pitcherMix);
        pAdj *= envMultiplier(parkF, weather);
        r.p_model = clampProb(pAdj);
        // Recompute model odds & EV (keep existing american if present)
        const dec = 1 + (r.american ? (r.american > 0 ? 100/r.american : -r.american/100) : (r.modelAmerican ? (r.modelAmerican>0?100/r.modelAmerican:-r.modelAmerican/100) : (r.p_model>0?1/r.p_model:0)));
        const useAmerican = r.american ?? r.modelAmerican ?? Math.round(r.p_model>0 ? (r.p_model>=0.5 ? -(r.p_model/(1-r.p_model))*100 : (100*(1-r.p_model)/r.p_model)) : 0);
        r.modelAmerican = r.modelAmerican ?? useAmerican;
        // EV: use actual odds if available, else model odds
        const decActual = r.american ? (r.american>0?1 + 100/r.american : 1 + (-r.american/100)) : (r.modelAmerican>0?1 + 100/r.modelAmerican : 1 + (-r.modelAmerican/100));
        r.ev = r.p_model*(decActual-1) - (1 - r.p_model);
      });
}