// src/Parlays.jsx
import React, { useEffect, useState } from "react";

function todayISO(){ return new Date().toISOString().slice(0,10); }
function yesterdayISO(){ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

export default function Parlays(){
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [parlays, setParlays] = useState([]);
  const [diag, setDiag] = useState(null);
  const [demo, setDemo] = useState(true);

  useEffect(()=>{ build(); }, [demo]);

  async function build(){
    try{
      setLoading(true); setError(null);

      // 1) Odds — get snapshot; supports array/offers and theoddsapi 'players' map shape
      let oddsRes = await fetch("/.netlify/functions/odds-get");
      let oddsJson = await oddsRes.json().catch(()=> ({}));
      if (!oddsRes.ok){
        throw new Error(oddsJson?.error || "No odds snapshot");
      }
      let legs = normalizeOddsToLegs(oddsJson);

      if (!legs.length){
        // try refresh once
        await fetch("/.netlify/functions/odds-refresh-rapid").catch(()=>{});
        await new Promise(r=>setTimeout(r, 600));
        oddsRes = await fetch("/.netlify/functions/odds-get");
        oddsJson = await oddsRes.json().catch(()=> ({}));
        if (oddsRes.ok) legs = normalizeOddsToLegs(oddsJson);
      }

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

      // 3) Merge (exact id, then player fallback)
      let directMatches = 0, playerMatches = 0;
      const mergedModel = {};
      for (const l of legs){
        if (modelMap[l.id] != null){ mergedModel[l.id]=modelMap[l.id]; directMatches++; }
        else if (l.player && modelMap[l.player] != null){ mergedModel[l.id]=modelMap[l.player]; playerMatches++; }
      }

      // 3b) DEMO: synthesize model from odds if still empty
      if (demo && Object.keys(mergedModel).length === 0 && legs.length){
        const byGroup = legs.reduce((acc,l)=>{
          const g = l.groupKey || `${l.gameId||'na'}:${l.market||'market'}`;
          (acc[g] ||= []).push(l);
          return acc;
        },{});
        const pbook = {};
        for (const g in byGroup){
          const arr = byGroup[g];
          const probs = arr.map(o => impliedProb(o.american));
          const s = probs.reduce((a,b)=>a+b,0) || 1;
          arr.forEach((o,i)=> pbook[o.id] = probs[i]/s );
        }
        for (const l of legs){
          const q = pbook[l.id] ?? impliedProb(l.american);
          // add a small edge for demo but cap to a sane range
          mergedModel[l.id] = Math.max(0.10, Math.min(0.90, q + 0.04));
        }
        directMatches = legs.length;
        playerMatches = 0;
      }

      // 4) Build parlays — demo-friendly thresholds
      const payload = { odds: legs, model: mergedModel, config: { maxLegs: 3, targetCount: 5, minEdge: 0.00, minLegProb: 0.45 } };
      const res = await fetch("/.netlify/functions/generate-parlays", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      const parlaysBuilt = (res.ok && data?.parlays) ? data.parlays : [];

      setParlays(parlaysBuilt);
      setDiag({
        legsParsed: legs.length,
        modelKeys: Object.keys(mergedModel).length,
        directMatches, playerMatches,
        predsDateTried: usedDate,
        demoMode: demo
      });
    }catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  }

  const manualRefresh = async () => {
    await fetch("/.netlify/functions/odds-refresh-rapid").catch(()=>{});
    await new Promise(r=>setTimeout(r, 800));
    build();
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Parlays (Sureshot Mode)</h1>
      <p className="text-gray-600 mb-2">Built from your live odds + model. Toggle Demo to test UI even if feeds are empty.</p>
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
          <div className="text-sm opacity-80">Try Refresh. With Demo ON, synthetic model probs are generated from odds so something should appear.</div>
        </div>
      )}

      {!loading && !error && parlays.map((p, idx) => (
        <div key={idx} className="bg-white p-4 rounded-xl shadow mb-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-lg font-semibold">Parlay #{idx+1}</h3>
            <div className="text-sm">
              <strong>Price:</strong> {p.decPrice.toFixed(2)} &nbsp;•&nbsp;
              <strong>P*</strong>: {(p.pStar*100).toFixed(1)}% &nbsp;•&nbsp;
              <strong>EV (per $100):</strong> {p.EV.toFixed(2)}
            </div>
          </div>
          <ul className="mt-2 list-disc pl-6">
            {p.legs.map((l, i) => (
              <li key={i}>
                {l.market}{l.player ? ` – ${l.player}` : ""}: {l.american > 0 ? `+${l.american}` : l.american}
                &nbsp;| Model {Math.round(l.p_true*100)}% vs book {Math.round(l.p_book*100)}% (edge {Math.round(l.edge*100)}%)
              </li>
            ))}
          </ul>
          <div className="opacity-90 text-sm mt-2">
            {p.why.map((w, i) => (<div key={i}>• {w}</div>))}
          </div>
          <div className="mt-3 text-sm">
            <strong>Units: </strong>
            Flat {p.units.flat_units}u &nbsp;|&nbsp; Kelly-lite {p.units.kelly_lite_units}u
            <div className="text-xs opacity-70">Choose one system and stick to it.</div>
          </div>
        </div>
      ))}

      {diag && (
        <div className="text-xs opacity-70 mt-3">
          <div>Diag — legs parsed: {diag.legsParsed}, model keys: {diag.modelKeys}, direct matches: {diag.directMatches}, player matches: {diag.playerMatches}, preds date: {diag.predsDateTried}, demo: {String(diag.demoMode)}</div>
        </div>
      )}
    </div>
  );
}

/* Helpers */
function impliedProb(american){
  const a = Number(american);
  const dec = a > 0 ? 1 + (a/100) : 1 + (100/Math.abs(a));
  return 1/dec;
}

function normalizeOddsToLegs(snapshot){
  // Supports:
  // 1) { offers: [...] } or [] with objects containing american/market/player/game_id/...
  // 2) TheOddsAPI aggregate by player: { market, players: { [player]: { median_american, by_book:{...} } }, date, regions }
  const out = [];
  // Case 1:
  const arrays = [];
  if (Array.isArray(snapshot)) arrays.push(snapshot);
  if (Array.isArray(snapshot?.offers)) arrays.push(snapshot.offers);
  if (Array.isArray(snapshot?.data)) arrays.push(snapshot.data);
  if (Array.isArray(snapshot?.bets)) arrays.push(snapshot.bets);
  const offers = arrays.find(a => a && a.length) || [];
  for (const o of offers){
    const american = pickAmerican(o);
    if (american == null) continue;
    const id = o.id || [o.player, o.market, o.game_id || o.gameId || o.eventId, o.book].filter(Boolean).join("|");
    out.push({
      id,
      american: Number(american),
      gameId: o.game_id || o.gameId || o.eventId || o.game || null,
      market: o.market || o.label || o.marketKey || "market",
      player: o.player || o.name || o.runner || o.selection || null,
      sgpOk: o.sgpOk ?? true,
      groupKey: `${o.game_id || o.gameId || o.eventId || 'na'}:${o.market || o.marketKey || 'market'}`
    });
  }
  if (out.length) return out;

  // Case 2: TheOddsAPI 'players' map
  if (snapshot && snapshot.players && typeof snapshot.players === 'object'){
    const marketLabel = normalizeMarketLabel(snapshot.market || "batter_home_runs");
    const date = snapshot.date || todayISO();
    for (const [player, info] of Object.entries(snapshot.players)){
      if (!info) continue;
      const american = pickAmerican(info) ?? info.median_american ?? info.medianAmerican ?? null;
      if (american == null) continue;
      const id = `${player}|${marketLabel}|${date}|AGG`;
      out.push({
        id,
        american: Number(american),
        gameId: date,
        market: marketLabel,
        player,
        sgpOk: true,
        groupKey: `${date}:${marketLabel}`
      });
    }
  }

  return out;
}

function normalizeMarketLabel(m){
  const s = String(m || "").toLowerCase();
  if (s.includes("batter_home_runs")) return "MLB HR 0.5+";
  if (s.includes("rbis")) return "MLB RBI";
  return m || "market";
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
    const id = r.id || [r.player, market, r.game_id || r.gameId || r.eventId, r.book].filter(Boolean).join("|");
    const p = r.p_true ?? r.prob ?? r.p ?? r.hr_prob ?? r.td_prob ?? r.goal_prob;
    if (id && typeof p === "number") map[id] = p;
    if (r.player && typeof p === "number") map[r.player] = p;
  }
  return map;
}
