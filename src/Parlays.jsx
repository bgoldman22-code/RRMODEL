// src/Parlays.jsx
import React, { useEffect, useState } from "react";

function todayISO(){ return new Date().toISOString().slice(0,10); }
function yesterdayISO(){ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
const CLAMP = (x)=>Math.max(0,Math.min(1,x));

export default function Parlays(){
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [parlays, setParlays] = useState([]);
  const [diag, setDiag] = useState(null);
  const [demo, setDemo] = useState(false); // default OFF

  useEffect(()=>{ build(); }, [demo]);

  async function build(){
    try{
      setLoading(true); setError(null);

      // 1) Odds snapshot
      const oddsRes = await fetch("/.netlify/functions/odds-get");
      const oddsJson = await oddsRes.json().catch(()=> ({}));
      if (!oddsRes.ok) throw new Error(oddsJson?.error || "No odds snapshot");
      const legs = normalizeOddsToLegs(oddsJson).filter(l => !/alt|alternate/i.test(l.market||""));

      // 2) Predictions — today then yesterday
      let usedDate = todayISO();
      let predsRes = await fetch(`/.netlify/functions/mlb-preds-get?date=${usedDate}`);
      if (!predsRes.ok){
        usedDate = yesterdayISO();
        predsRes = await fetch(`/.netlify/functions/mlb-preds-get?date=${usedDate}`);
      }
      let modelMap = {};
      if (predsRes.ok){
        const predsJson = await predsRes.json();
        modelMap = normalizePredsToMap(predsJson?.data ?? predsJson);
      }

      // 3) Merge model: id → p_true, fallback de-vig if empty
      let directMatches = 0, playerMatches = 0;
      const mergedModel = {};
      for (const l of legs){
        if (modelMap[l.id] != null){ mergedModel[l.id]=modelMap[l.id]; directMatches++; }
        else if ((l.player || l.team) && modelMap[l.player || l.team] != null){ mergedModel[l.id]=modelMap[l.player || l.team]; playerMatches++; }
      }
      let usedFallback = false;
      if (Object.keys(mergedModel).length === 0 && legs.length){
        const pbook = devigByGroup(legs);
        for (const l of legs){
          const q = pbook[l.id] ?? impliedProb(l.american);
          mergedModel[l.id] = CLAMP(q + (demo ? 0.05 : 0.02));
        }
        directMatches = legs.length;
        usedFallback = true;
      }

      // 4) Server builder
      const payload = { odds: legs, model: mergedModel, config: { maxLegs: 3, targetCount: 5, minEdge: 0.00, minLegProb: 0.40, allowCrossSport: true } };
      let res = await fetch("/.netlify/functions/generate-parlays", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      let data = await res.json().catch(()=>({}));
      let parlaysBuilt = (res.ok && data?.parlays) ? data.parlays : [];

      // 5) Client fallback if server empty
      if (!parlaysBuilt.length){
        parlaysBuilt = localBuildParlaysWithConflicts(legs, mergedModel, 5);
      }

      setParlays(parlaysBuilt);
      setDiag({
        legsParsed: legs.length,
        modelKeys: Object.keys(mergedModel).length,
        directMatches, playerMatches,
        predsDateTried: usedDate,
        demoMode: demo,
        serverReturned: (data?.parlays?.length || 0),
        usedFallback
      });
    }catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  }

  const manualRefresh = async () => {
    await fetch("/.netlify/functions/odds-refresh-multi").catch(()=>{});
    await new Promise(r=>setTimeout(r, 600));
    build();
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Parlays (Sureshot Mode)</h1>
      <p className="text-gray-600 mb-2">Best combos across sports & bet types. Toggle Demo only for layout testing.</p>
      <div className="text-xs opacity-70 mb-4">*P* is the model’s joint hit probability (correlation-adjusted heuristic).</div>

      <div className="flex gap-2 mb-3">
        <button onClick={manualRefresh} className="px-3 py-1 rounded bg-black text-white">Refresh odds & retry</button>
        <button onClick={()=>setDemo(d=>!d)} className={"px-3 py-1 rounded " + (demo ? "bg-amber-600 text-white" : "border")}>
          {demo ? "Demo ON" : "Demo OFF"}
        </button>
      </div>

      {loading && <div className="bg-white p-4 rounded-xl shadow">Building today’s picks…</div>}
      {error && <div className="bg-white p-4 rounded-xl shadow text-red-600">{String(error)}</div>}

      {!loading && !error && parlays.length===0 && (
        <div className="bg-white p-4 rounded-xl shadow mb-4">
          <div className="font-semibold mb-1">No parlays built yet.</div>
          <div className="text-sm opacity-80">Try Refresh. With Demo OFF we use your model; if missing, we de‑vig odds locally.</div>
        </div>
      )}

      {!loading && !error && parlays.map((p, idx) => (
        <div key={idx} className="bg-white p-4 rounded-xl shadow mb-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-lg font-semibold">Parlay #{idx+1}</h3>
            <div className="text-sm">
              <strong>Price:</strong> {formatAmerican(p.amPrice)} <span className="opacity-70">(dec {p.decPrice.toFixed(2)})</span>
              &nbsp;•&nbsp;<strong>P*</strong>: {(p.pStar*100).toFixed(1)}% &nbsp;•&nbsp;<strong>EV</strong>: {p.EV.toFixed(2)}
            </div>
          </div>
          <div className="text-xs opacity-80">{(p.sportMix||[]).join(" • ")}</div>
          <ul className="mt-2 list-disc pl-6">
            {p.legs.map((l, i) => (
              <li key={i}>
                {prettySport(l.sport)} • {prettyMarket(l.market)}{l.outcome ? ` ${l.outcome}` : ""}{l.player ? ` – ${l.player}` : (l.team ? ` – ${l.team}` : "")}: {formatAmerican(l.american)} <span className="opacity-70">({l.book||"—"})</span>
                &nbsp;| Model {Math.round(l.p_true*100)}% vs book {Math.round(l.p_book*100)}% (edge {edgePct(l)})
              </li>
            ))}
          </ul>
          <div className="opacity-90 text-sm mt-2">
            {(p.why||[]).map((w, i) => (<div key={i}>• {w}</div>))}
          </div>
          <div className="mt-3 text-sm">
            <strong>Units: </strong>
            Flat {p.units?.flat_units ?? 0.75}u &nbsp;|&nbsp; Kelly-lite {p.units?.kelly_lite_units ?? 0.25}u
            <div className="text-xs opacity-70">Choose one system and stick to it.</div>
          </div>
        </div>
      ))}

      {diag && (
        <div className="text-xs opacity-70 mt-3">
          <div>Diag — legs parsed: {diag.legsParsed}, model keys: {diag.modelKeys}, direct matches: {diag.directMatches}, player matches: {diag.playerMatches}, preds date: {diag.predsDateTried}, demo: {String(diag.demoMode)}, server_parlays: {diag.serverReturned}, usedFallback: {String(diag.usedFallback)}</div>
        </div>
      )}
    </div>
  );
}

/* ===== Helpers ===== */
function edgePct(l){ const e = Math.round((l.p_true - l.p_book)*100); return `${e>=0?"+":""}${e}%`; }
function formatAmerican(a){ return a>0?`+${a}`:`${a}`; }
function impliedProb(a){ const dec = a > 0 ? 1 + (a/100) : 1 + (100/Math.abs(a)); return 1/dec; }
function devigByGroup(legs){
  const groups = {}; const map = {};
  for (const l of legs){
    const g = l.groupKey || `${l.gameId||'na'}:${l.market||'market'}`;
    (groups[g] ||= []).push(l);
  }
  for (const g in groups){
    const arr = groups[g];
    const probs = arr.map(o => impliedProb(o.american));
    const s = probs.reduce((a,b)=>a+b,0) || 1;
    arr.forEach((o,i)=> map[o.id] = probs[i]/s );
  }
  return map;
}

function localBuildParlaysWithConflicts(legs, model, takeN = 5){
  const candidates = legs
    .map(l => ({
      ...l,
      p_true: CLAMP(Number(model[l.id])),
      p_book: impliedProb(l.american),
      dec: l.american > 0 ? 1 + (l.american/100) : 1 + (100/Math.abs(l.american))
    }))
    .filter(x => x.p_true >= 0.40);

  const seen = new Set();
  const uniq = candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

  const out = [];
  const pool = shuffle(uniq).slice(0, 120);
  const combos = kCombos(pool, 3).concat(kCombos(pool, 2));
  for (const combo of combos){
    if (!passesConflictRules(combo)) continue;
    const pInd = combo.reduce((a,b)=> a*b.p_true, 1);
    const corr = avgCorr(combo);
    const pStar = CLAMP(pInd * (1 - 0.5 * corr));
    const decPrice = combo.reduce((a,b)=> a*b.dec, 1);
    const amPrice = decToAmerican(decPrice);
    const EV = pStar * (100*(decPrice-1)) - (1 - pStar) * 100;
    out.push({
      sportMix: Array.from(new Set(combo.map(l=>prettySport(l.sport)).filter(Boolean))),
      legs: combo.map(l => ({ ...l, edge: (l.p_true-l.p_book) })),
      decPrice, amPrice, pStar, EV, avgR: corr,
      units: { flat_units: 0.75, kelly_lite_units: 0.25 },
      why: combo.map(l => reasonLine(l))
    });
  }
  out.sort((a,b)=>(b.EV*b.pStar) - (a.EV*a.pStar));
  return out.slice(0, takeN);
}

function kCombos(arr, k){ const res=[]; const n=arr.length; function rec(s, p){ if (p.length===k){ res.push(p); return; } for (let i=s;i<n;i++) rec(i+1, p.concat(arr[i])); } rec(0,[]); return res.slice(0, 2000); }
function shuffle(a){ const b=[...a]; for(let i=b.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [b[i],b[j]]=[b[j],b[i]];} return b; }
function avgCorr(legs){ if (legs.length<2) return 0.10; let s=0,c=0; for (let i=0;i<legs.length;i++){ for (let j=i+1;j<legs.length;j++){ s += pairCorr(legs[i], legs[j]); c++; } } return c? s/c : 0.10; }
function pairCorr(a,b){ if (a.gameId && b.gameId && a.gameId===b.gameId) return 0.25; if (a.player && b.player && a.player===b.player) return 0.9; if (a.sport && b.sport && a.sport !== b.sport) return 0.05; return 0.10; }
function passesConflictRules(legs){
  const seen = {}; const players = new Set();
  for (const l of legs){
    if (l.player){ if (players.has(l.player)) return false; players.add(l.player); }
    const key = `${l.gameId||'na'}:${(l.market||'').toLowerCase()}`;
    const side = String(l.outcome || l.team || "").toLowerCase();
    if (!seen[key]) { seen[key] = new Set(); }
    if (key.endsWith(":totals")){
      if (seen[key].has("over") && side.includes("under")) return false;
      if (seen[key].has("under") && side.includes("over")) return false;
      seen[key].add(side.includes("over") ? "over" : (side.includes("under") ? "under" : side));
      continue;
    }
    if (key.endsWith(":h2h")){
      if (seen[key].size && !seen[key].has(side)) return false;
      seen[key].add(side);
      continue;
    }
    if (key.endsWith(":spreads")){
      if (seen[key].size && !seen[key].has(side)) return false;
      seen[key].add(side);
      continue;
    }
  }
  return true;
}

function normalizeOddsToLegs(snapshot){
  const out = [];
  const arrays = [];
  if (Array.isArray(snapshot)) arrays.push(snapshot);
  if (Array.isArray(snapshot?.offers)) arrays.push(snapshot.offers);
  if (Array.isArray(snapshot?.data)) arrays.push(snapshot.data);
  if (Array.isArray(snapshot?.bets)) arrays.push(snapshot.bets);
  const offers = arrays.find(a => a && a.length) || [];
  for (const o of offers){
    const american = pickAmerican(o);
    if (american == null) continue;
    const id = o.id || [o.player || o.team || o.outcome, o.market, o.gameId || o.game_id || o.eventId, o.bookKey || o.book].filter(Boolean).join("|");
    out.push({
      id,
      american: Number(american),
      gameId: o.gameId || o.game_id || o.eventId || o.game || null,
      market: o.market || o.label || o.marketKey || "market",
      outcome: o.outcome || o.name || o.description || o.selection || null,
      player: o.player || null,
      team: o.team || null,
      book: o.book || null,
      bookKey: o.bookKey || null,
      sport: o.sport || o.league || null,
      sgpOk: o.sgpOk ?? true,
      groupKey: o.groupKey || `${o.gameId || o.game_id || o.eventId || 'na'}:${o.market || o.marketKey || 'market'}`
    });
  }
  // HR players-map fallback (unlikely now)
  if (!out.length && snapshot && snapshot.players && typeof snapshot.players === 'object'){
    const date = snapshot.date || todayISO();
    for (const [player, info] of Object.entries(snapshot.players)){
      const american = pickAmerican(info) ?? info.median_american ?? info.medianAmerican ?? null;
      if (american == null) continue;
      const id = `${player}|player_home_runs|${date}|AGG`;
      out.push({ id, american: Number(american), gameId: date, market: "player_home_runs", player, sport: "MLB", sgpOk: true, groupKey: `${date}:player_home_runs` });
    }
  }
  return out;
}

function pickAmerican(o){
  if (o == null) return null;
  if (typeof o.american === "number") return o.american;
  if (typeof o.american === "string") return Number(o.american);
  if (o.price?.american != null) return Number(o.price.american);
  if (typeof o.odds === "number") return o.odds;
  if (typeof o.odds_american === "string") return Number(o.odds_american);
  if (typeof o.oddsAmerican === "string") return Number(o.oddsAmerican);
  if (typeof o.americanOdds === "string") return Number(o.americanOdds);
  if (typeof o.median_american === "number") return o.median_american;
  if (typeof o.medianAmerican === "number") return o.medianAmerican;
  return null;
}
function normalizePredsToMap(predsFile){
  const map = {};
  const arr = predsFile?.predictions || predsFile?.rows || predsFile?.data || predsFile || [];
  for (const r of (Array.isArray(arr) ? arr : [])) {
    const market = r.market || r.type || "market";
    const id = r.id || [r.player || r.team, market, r.game_id || r.gameId || r.eventId, r.book].filter(Boolean).join("|");
    const p = r.p_true ?? r.prob ?? r.p ?? r.hr_prob ?? r.td_prob ?? r.goal_prob;
    if (id && typeof p === "number") map[id] = p;
    if ((r.player || r.team) && typeof p === "number") map[r.player || r.team] = p;
  }
  return map;
}

function prettyMarket(m){
  const s = String(m || "").toLowerCase();
  if (s === "h2h") return "Moneyline";
  if (s === "spreads") return "Spread";
  if (s === "totals") return "Total";
  if (s.includes("player_home_runs")) return "HR 0.5+";
  if (s.includes("player_points")) return "Player Points";
  if (s.includes("player_rebounds")) return "Rebounds";
  if (s.includes("player_assists")) return "Assists";
  if (s.includes("player_threes")) return "3PT Made";
  if (s.includes("player_shots_on_goal")) return "Shots on Goal";
  if (s.includes("player_total_bases")) return "Total Bases";
  if (s.includes("pitcher_strikeouts")) return "Pitcher Ks";
  if (s.includes("player_rbis")) return "RBIs";
  if (s.includes("player_hits")) return "Hits";
  if (s.includes("player_runs")) return "Runs";
  if (s.includes("player_anytime_td")) return "Anytime TD";
  if (s.includes("player_pass_tds")) return "Pass TDs";
  if (s.includes("player_pass_yds")) return "Pass Yds";
  if (s.includes("player_rush_yds")) return "Rush Yds";
  if (s.includes("player_rec_yds")) return "Rec Yds";
  return m || "market";
}

function prettySport(code){
  const c = String(code||"").toLowerCase();
  if (c.includes("baseball_mlb")) return "MLB";
  if (c.includes("basketball_nba")) return "NBA";
  if (c.includes("americanfootball_nfl")) return "NFL";
  if (c.includes("icehockey_nhl")) return "NHL";
  return code || "";
}
