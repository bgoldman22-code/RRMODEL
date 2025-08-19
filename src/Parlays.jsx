// src/Parlays.jsx
import React, { useEffect, useState } from "react";

function todayISO(){ return new Date().toISOString().slice(0,10); }
function yesterdayISO(){ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

export default function Parlays(){
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [parlays, setParlays] = useState([]);
  const [diag, setDiag] = useState(null);

  const build = async () => {
    try{
      setLoading(true); setError(null);

      // Odds snapshot (try refresh if empty)
      let oddsRes = await fetch("/.netlify/functions/odds-get");
      let oddsJson = await oddsRes.json().catch(()=> ({}));
      if (!oddsRes.ok || !hasOffers(oddsJson)){
        await fetch("/.netlify/functions/odds-refresh-rapid").catch(()=>{});
        await new Promise(r=>setTimeout(r, 600));
        oddsRes = await fetch("/.netlify/functions/odds-get");
        oddsJson = await oddsRes.json().catch(()=> ({}));
      }
      const legs = hasOffers(oddsJson) ? normalizeOddsToLegs(oddsJson) : [];

      // Predictions (today, then yesterday)
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

      // Merge
      const mergedModel = {};
      let directMatches = 0, playerMatches = 0;
      for (const l of legs){
        if (modelMap[l.id] != null){ mergedModel[l.id]=modelMap[l.id]; directMatches++; }
        else if (l.player && modelMap[l.player] != null){ mergedModel[l.id]=modelMap[l.player]; playerMatches++; }
      }

      // Build
      let payload = { odds: legs, model: mergedModel, config: { maxLegs:3, targetCount:5, minEdge:0.02, minLegProb:0.60 } };
      let res = await fetch("/.netlify/functions/generate-parlays", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      let data = await res.json();
      let parlaysBuilt = (res.ok && data?.parlays) ? data.parlays : [];

      if (!parlaysBuilt.length){
        payload = { odds: legs, model: mergedModel, config: { maxLegs:3, targetCount:5, minEdge:0.00, minLegProb:0.50 } };
        const res2 = await fetch("/.netlify/functions/generate-parlays", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
        const data2 = await res2.json();
        if (res2.ok && data2?.parlays) parlaysBuilt = data2.parlays;
      }

      setParlays(parlaysBuilt);
      setDiag({
        legsParsed: legs.length,
        modelKeys: Object.keys(modelMap).length,
        directMatches, playerMatches,
        predsDateTried: usedDate,
      });
    } catch(e){
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ build(); }, []);

  const manualRefresh = async () => {
    await fetch("/.netlify/functions/odds-refresh-rapid").catch(()=>{});
    await new Promise(r=>setTimeout(r, 800));
    build();
  };

  const checkStores = async () => {
    const today = todayISO();
    const [o,p] = await Promise.all([
      fetch("/.netlify/functions/odds-diag").then(r=>r.json()).catch(()=>({})),
      fetch(`/.netlify/functions/preds-diag?date=${today}`).then(r=>r.json()).catch(()=>({}))
    ]);
    alert("Odds store: " + JSON.stringify(o) + "\n\nPreds store: " + JSON.stringify(p));
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Parlays (Sureshot Mode)</h1>
      <p className="text-gray-600 mb-2">3–5 low-variance parlays from your live odds + model.</p>
      <div className="text-xs opacity-70 mb-4">*P* is the model’s joint hit probability (correlation-adjusted heuristic).</div>

      <div className="flex gap-2 mb-3">
        <button onClick={manualRefresh} className="px-3 py-1 rounded bg-black text-white">Refresh odds & retry</button>
        <button onClick={checkStores} className="px-3 py-1 rounded border">Diag stores</button>
      </div>

      {loading && <div className="bg-white p-4 rounded-xl shadow">Building today’s picks…</div>}
      {error && <div className="bg-white p-4 rounded-xl shadow text-red-600">{String(error)}</div>}

      {!loading && !error && parlays.length===0 && (
        <div className="bg-white p-4 rounded-xl shadow mb-4">
          <div className="font-semibold mb-1">No parlays built yet.</div>
          <div className="text-sm opacity-80">Hit “Refresh odds & retry”. If still empty, use “Diag stores” to see if blobs exist.</div>
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
          <div>Diag — legs parsed: {diag.legsParsed}, model keys: {diag.modelKeys}, direct matches: {diag.directMatches}, player matches: {diag.playerMatches}, preds date: {diag.predsDateTried}</div>
        </div>
      )}
    </div>
  );
}

function hasOffers(s){
  if (!s) return false;
  if (Array.isArray(s) && s.length) return true;
  if (Array.isArray(s?.offers) && s.offers.length) return true;
  if (Array.isArray(s?.data) && s.data.length) return true;
  if (Array.isArray(s?.bets) && s.bets.length) return true;
  return false;
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
    const id = o.id || [o.player, o.market, o.game_id || o.gameId || o.eventId, o.book].filter(Boolean).join("|");
    out.push({
      id,
      american: Number(american),
      gameId: o.game_id || o.gameId || o.eventId || o.game || null,
      market: o.market || o.label || o.marketKey || "MLB HR 0.5+",
      player: o.player || o.name || o.runner || o.selection || null,
      sgpOk: o.sgpOk ?? true,
      groupKey: `${o.game_id || o.gameId || o.eventId || 'na'}:${o.market || o.marketKey || 'MLB HR'}`
    });
  }
  return out;
}
function pickAmerican(o){
  if (o.american != null) return Number(o.american);
  if (o.price?.american != null) return Number(o.price.american);
  if (typeof o.odds === "number") return o.odds;
  if (typeof o.odds_american === "string") return Number(o.odds_american);
  if (typeof o.oddsAmerican === "string") return Number(o.oddsAmerican);
  if (typeof o.americanOdds === "string") return Number(o.americanOdds);
  return null;
}
function normalizePredsToMap(predsFile){
  const map = {};
  const arr = predsFile?.predictions || predsFile?.rows || predsFile?.data || predsFile || [];
  for (const r of (Array.isArray(arr) ? arr : [])) {
    const market = r.market || r.type || "MLB HR 0.5+";
    const id = r.id || [r.player, market, r.game_id || r.gameId || r.eventId, r.book].filter(Boolean).join("|");
    const p = r.p_true ?? r.prob ?? r.p ?? r.hr_prob;
    if (id && typeof p === "number") map[id] = p;
    if (r.player && typeof r.hr_prob === "number") map[r.player] = r.hr_prob;
  }
  return map;
}
