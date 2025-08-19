// src/Parlays.jsx
import React, { useEffect, useState } from "react";

function todayISO(){ return new Date().toISOString().slice(0,10); }
function yesterdayISO(){ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

const SPORT_OPTIONS = ["MLB","NFL","NBA","NHL","MLS","NCAAF","NCAAB"];
const MARKET_OPTIONS = ["moneyline","spread","total","over","under","player","hr","td","shots","rebounds","assists"];

export default function Parlays(){
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [parlays, setParlays] = useState([]);
  const [diag, setDiag] = useState(null);
  const [sports, setSports] = useState(["MLB","NFL","NBA"]);
  const [markets, setMarkets] = useState(["moneyline","spread","total","player"]);

  const toggle = (arr, setArr, v)=> setArr(a => a.includes(v) ? a.filter(x=>x!==v) : a.concat([v]));

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

      // Build (pass sport/market filters)
      let payload = { 
        odds: legs, 
        model: mergedModel, 
        config: { 
          maxLegs:3, targetCount:5, minEdge:0.02, minLegProb:0.60,
          sportIn: sports, marketIn: markets
        } 
      };
      let res = await fetch("/.netlify/functions/generate-parlays", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      let data = await res.json();
      let parlaysBuilt = (res.ok && data?.parlays) ? data.parlays : [];

      if (!parlaysBuilt.length){
        payload.config.minEdge = 0.00;
        payload.config.minLegProb = 0.50;
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
    }catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  };

  useEffect(()=>{ build(); }, []);
  useEffect(()=>{ build(); }, [sports.join(','), markets.join(',')]);

  const manualRefresh = async () => {
    await fetch("/.netlify/functions/odds-refresh-rapid").catch(()=>{});
    await new Promise(r=>setTimeout(r, 800));
    build();
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Parlays (Sureshot Mode)</h1>
      <p className="text-gray-600 mb-2">Multi-sport: pick your sports & markets below. Built from your live odds + model.</p>
      <div className="text-xs opacity-70 mb-4">*P* = joint hit probability.</div>

      <div className="flex flex-wrap gap-2 mb-3">
        {SPORT_OPTIONS.map(s => (
          <button key={s} onClick={()=>toggle(sports,setSports,s)} className={"px-2 py-1 rounded text-sm " + (sports.includes(s) ? "bg-black text-white" : "border")}>{s}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {MARKET_OPTIONS.map(m => (
          <button key={m} onClick={()=>toggle(markets,setMarkets,m)} className={"px-2 py-1 rounded text-sm " + (markets.includes(m) ? "bg-black text-white" : "border")}>{m}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={manualRefresh} className="px-3 py-1 rounded bg-black text-white">Refresh odds & retry</button>
      </div>

      {loading && <div className="bg-white p-4 rounded-xl shadow">Building today’s picks…</div>}
      {error && <div className="bg-white p-4 rounded-xl shadow text-red-600">{String(error)}</div>}

      {!loading && !error && parlays.length===0 && (
        <div className="bg-white p-4 rounded-xl shadow mb-4">
          <div className="font-semibold mb-1">No parlays built yet.</div>
          <div className="text-sm opacity-80">Try selecting more sports/markets or hit Refresh. If still empty, odds snapshot or preds may be missing.</div>
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
          <div className="text-xs opacity-80 mb-1">{(p.sportMix||[]).join(" • ")}</div>
          <ul className="mt-2 list-disc pl-6">
            {p.legs.map((l, i) => (
              <li key={i}>
                {l.sport ? `${l.sport} • ` : ""}{l.market}{l.player ? ` – ${l.player}` : ""}: {l.american > 0 ? `+${l.american}` : l.american}
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
      market: o.market || o.label || o.marketKey || "market",
      player: o.player || o.name || o.runner || o.selection || null,
      sgpOk: o.sgpOk ?? true,
      groupKey: `${o.game_id || o.gameId || o.eventId || 'na'}:${o.market || o.marketKey || 'market'}`,
      sport: o.sport || o.league || (inferSportFromMarket(o.market || o.marketKey || "")) || null
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
function inferSportFromMarket(m){
  const s = String(m).toLowerCase();
  if (s.includes("home run") || s.includes("hr")) return "MLB";
  if (s.includes("touchdown") || s.includes("td")) return "NFL";
  if (s.includes("rebounds") || s.includes("assists") || s.includes("threes")) return "NBA";
  if (s.includes("shots on goal")) return "NHL";
  if (s.includes("goalscorer") || s.includes("ags")) return "MLS";
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
