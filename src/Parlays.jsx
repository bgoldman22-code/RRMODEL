// src/Parlays.jsx
import React, { useEffect, useState } from "react";

function todayISO(){ return new Date().toISOString().slice(0,10); }

export default function Parlays(){
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [parlays, setParlays] = useState([]);

  useEffect(()=>{
    (async function run(){
      try{
        setLoading(true); setError(null);
        // 1) Get actual odds from your Netlify blob via odds-get
        const oddsRes = await fetch("/.netlify/functions/odds-get");
        const oddsJson = await oddsRes.json();
        if(!oddsRes.ok) throw new Error(oddsJson?.error || "Failed to fetch odds");
        const legs = normalizeOddsToLegs(oddsJson);

        // 2) Get today's predictions
        const predsRes = await fetch(`/.netlify/functions/mlb-preds-get?date=${todayISO()}`);
        let modelMap = {};
        if (predsRes.ok){
          const predsJson = await predsRes.json();
          modelMap = normalizePredsToMap(predsJson?.data ?? predsJson);
        }

        // 3) Build parlays
        const payload = {
          odds: legs,
          model: modelMap,
          config: { maxLegs: 3, targetCount: 5, minEdge: 0.02, minLegProb: 0.60 }
        };
        const res = await fetch("/.netlify/functions/generate-parlays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to build parlays");
        setParlays(data.parlays || []);
      }catch(e){ setError(e.message); }
      finally{ setLoading(false); }
    })();
  },[]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Parlays (Sureshot Mode)</h1>
      <p className="text-gray-600 mb-4">3–5 low-variance parlays from your live odds + model.</p>

      {loading && <div className="bg-white p-4 rounded-xl shadow">Building today’s picks…</div>}
      {error && <div className="bg-white p-4 rounded-xl shadow text-red-600">{String(error)}</div>}

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

      <div className="text-xs opacity-70 mt-2">
        *P* is the model’s joint hit probability (correlation-adjusted heuristic).
      </div>
    </div>
  );
}

function normalizeOddsToLegs(snapshot){
  const out = [];
  const offers = snapshot?.offers || snapshot?.data || snapshot?.bets || snapshot || [];
  for (const o of (Array.isArray(offers) ? offers : [])) {
    const american = pickAmerican(o);
    if (american == null) continue;
    const id = o.id || [o.player, o.market, o.game_id || o.gameId, o.book].filter(Boolean).join("|");
    out.push({
      id,
      american,
      gameId: o.game_id || o.gameId || o.game || null,
      market: o.market || o.label || "MLB HR 0.5+",
      player: o.player || o.name || o.runner || null,
      sgpOk: o.sgpOk ?? true,
      groupKey: `${o.game_id || o.gameId || 'na'}:${o.market || 'MLB HR'}`
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
  return null;
}
function normalizePredsToMap(predsFile){
  const map = {};
  const arr = predsFile?.predictions || predsFile?.rows || predsFile?.data || predsFile || [];
  for (const r of (Array.isArray(arr) ? arr : [])) {
    const market = r.market || r.type || "MLB HR 0.5+";
    const id = r.id || [r.player, market, r.game_id || r.gameId, r.book].filter(Boolean).join("|");
    const p = r.p_true ?? r.prob ?? r.p ?? r.hr_prob;
    if (id && typeof p === "number") {
      map[id] = p;
    } else if (r.player && typeof r.hr_prob === "number") {
      map[r.player] = r.hr_prob;
    }
  }
  return map;
}
