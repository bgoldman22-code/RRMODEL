// src/HRR.jsx
import React, { useEffect, useMemo, useState } from "react";
function probToFairAmerican(p){ if(!p||p<=0) return null; if(p>=1) return -100; const d=1/p; return d>=2? Math.round((d-1)*100): Math.round(-100/(d-1)); }
function americanToDecimal(a){ if(a==null) return null; const n=Number(a); if(!isFinite(n)) return null; return n>0?1+n/100:1+100/Math.abs(n); }
function americanFmt(a){ if(a==null) return "–"; return `${a>0?"+":""}${a}`; }
function calcEV(p, am){ const d=americanToDecimal(am); if(!p||!d) return null; return p*(d-1)-(1-p); }

export default function HRR(){
  const [date, setDate] = useState(()=> new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);
  const [odds, setOdds] = useState(null);
  const [status, setStatus] = useState({});
  const [copied, setCopied] = useState("");

  useEffect(()=>{ (async()=>{
    setStatus(s=>({...s, loading:true}));
    const [modelRes, oddsRes] = await Promise.all([
      fetch(`/.netlify/functions/hits2-model?date=${date}`, { cache:"no-store" }).then(r=>r.json()).catch(()=>({ ok:false })),
      fetch(`/.netlify/functions/odds-hrr?date=${date}`, { cache:"no-store" }).then(r=>r.json()).catch(()=>({ ok:false }))
    ]);
    setRows(modelRes?.players || []);
    setOdds(oddsRes || null);
    setStatus({ loading:false, modelOk: !!modelRes?.ok, modelCount: modelRes?.count||0, oddsOk: !!oddsRes?.ok, provider: oddsRes?.provider||"?", usingOddsApi: !!oddsRes?.usingOddsApi });
  })(); }, [date]);

  const oddsByKey = useMemo(()=>{
    const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
    const m=new Map(); if(odds?.offers){ for(const o of odds.offers) m.set(o.playerKey || norm(o.player), o); } return m;
  }, [odds]);

  const enriched = useMemo(()=>{
    const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
    return (rows||[]).map(r=>{
      const k = norm(r.player);
      const o = oddsByKey.get(k);
      const p = Math.max(0.01, Math.min(0.80, r.baseProb || 0));
      const modelOdds = probToFairAmerican(p);
      const realOdds = o?.american ?? null;
      const ev = realOdds!=null ? calcEV(p, realOdds) : null;
      const why = (()=>{
        const md = r.modelDetail || {};
        const bits=[];
        if(typeof md.seasonAVG==="number") bits.push(`season AVG ${md.seasonAVG.toFixed(3)}`);
        if(typeof md.last15AVG==="number") bits.push(`L15 AVG ${md.last15AVG.toFixed(3)}`);
        if(md.expAB) bits.push(`expAB ${md.expAB}`);
        if(md.oppSP) bits.push(`vs ${md.oppSP}${md.spBAA!=null?` (BAA ${md.spBAA.toFixed(3)})`:""}`);
        return bits.join(" • ");
      })();
      return { player:r.player, team:r.team, game:r.game, modelProb:p, modelOdds, realOdds, ev, why };
    });
  }, [rows, oddsByKey]);

  const byProb = useMemo(()=> [...enriched].sort((a,b)=>b.modelProb-a.modelProb).slice(0,10), [enriched]);
  const byEVAll = useMemo(()=> enriched.filter(r=>r.ev!=null).sort((a,b)=>b.ev-a.ev), [enriched]);
  const EV_FLOOR = 0.05;
  const byEV = useMemo(()=> byEVAll.filter(r=>r.ev>=EV_FLOOR).slice(0,10), [byEVAll]);

  function parlayFromLegs(legs){ const decs=legs.map(l=>americanToDecimal(l.american)).filter(Boolean); if(decs.length!==legs.length) return {dec:null,american:null,prob:null,ev:null}; const dec=decs.reduce((a,b)=>a*b,1); const prob=legs.reduce((a,l)=>a*(l.prob||0),1); const am=dec>=2?Math.round((dec-1)*100):Math.round(-100/(dec-1)); const ev=prob*(dec-1)-(1-prob); return {dec,american:am,prob,ev}; }
  function copySlate(slate){ const legs=slate.legs.map(l=>({label:l.player,prob:l.modelProb,american:l.realOdds})); const agg=parlayFromLegs(legs); const lines=slate.legs.map(l=>`- ${l.player} 2+ hits (${(l.modelProb*100).toFixed(1)}% | ${americanFmt(l.realOdds)})`).join("\n"); const txt=`HRR (Hits + Runs + RBIs) — ${slate.title}\nDate: ${date}\n${lines}\nParlay: prob ${(agg.prob*100).toFixed(1)}% | ${americanFmt(agg.american)} | EV ${agg.ev!=null?agg.ev.toFixed(3):"–"}`; navigator.clipboard.writeText(txt).then(()=>{ setCopied(slate.title); setTimeout(()=>setCopied(""),2000);}); }
  const ParlayTable = ({ slate }) => { const legs=slate.legs.map(l=>({prob:l.modelProb,american:l.realOdds})); const agg=parlayFromLegs(legs); return (<div className="overflow-auto border rounded-2xl shadow-sm"><div className="px-3 py-2 text-sm font-semibold bg-gray-50 flex items-center justify-between"><span>{slate.title}</span><button className="text-xs border rounded-lg px-2 py-1 hover:shadow" onClick={()=>copySlate(slate)}>{copied===slate.title?"Copied!":"Copy slip"}</button></div><table className="min-w-full text-sm"><thead><tr className="text-left border-b"><th className="py-2 px-3">Leg</th><th className="py-2 px-3">Model Prob</th><th className="py-2 px-3">Real Odds</th></tr></thead><tbody>{slate.legs.map((l,i)=>(<tr key={i} className="border-b"><td className="py-2 px-3">{l.player}</td><td className="py-2 px-3">{(l.modelProb*100).toFixed(1)}%</td><td className="py-2 px-3">{l.realOdds!=null?americanFmt(l.realOdds):"–"}</td></tr>))}<tr><td className="py-2 px-3 font-semibold">Parlay Total</td><td className="py-2 px-3 font-semibold">{agg.prob!=null?`${(agg.prob*100).toFixed(1)}%`:"–"}</td><td className="py-2 px-3 font-semibold">{agg.american!=null?americanFmt(agg.american):"–"}</td></tr></tbody></table><div className="px-3 py-2 text-xs opacity-75">EV (1u): {agg.ev!=null?agg.ev.toFixed(3):"–"} • Assumes independence.</div></div>); };

  function distinctPlayers(list){ const s=new Set(); const out=[]; for(const r of list){ if(!s.has(r.player)){ s.add(r.player); out.push(r);} } return out; }
  const parlayCandidates = useMemo(()=> distinctPlayers(byEVAll.slice(0,16)), [byEVAll]);
  function buildParlaySlates(c){ const sl=[]; if(c.length>=2) sl.push({ title:"Parlay A (2-leg, top EV)", legs:[c[0],c[1]]}); if(c.length>=4) sl.push({ title:"Parlay B (2-leg, balanced)", legs:[c[0], byProb[0]||c[2]]}); if(c.length>=3) sl.push({ title:"Parlay C (3-leg, EV)", legs:[c[0],c[1],c[2]]}); if(c.length>=5) sl.push({ title:"Parlay D (3-leg, blended)", legs:[byProb[0]||c[1], c[2], c[3]]}); return sl.slice(0,4); }
  const parlaySlates = useMemo(()=> buildParlaySlates(parlayCandidates), [parlayCandidates, byProb]);

  const Table = ({ rows, caption }) => (<div className="overflow-auto border rounded-2xl shadow-sm">{caption && <div className="px-3 py-2 text-sm font-semibold bg-gray-50">{caption}</div>}<table className="min-w-full text-sm"><thead><tr className="text-left border-b"><th className="py-2 px-3">Player</th><th className="py-2 px-3">Team</th><th className="py-2 px-3">Game</th><th className="py-2 px-3">Model Prob</th><th className="py-2 px-3">Model Odds</th><th className="py-2 px-3">Real Odds</th><th className="py-2 px-3">EV (1u)</th><th className="py-2 px-3">Why</th></tr></thead><tbody>{rows.map((r,i)=>(<tr key={i} className="border-b"><td className="py-2 px-3">{r.player}</td><td className="py-2 px-3">{r.team}</td><td className="py-2 px-3">{r.game}</td><td className="py-2 px-3">{(r.modelProb*100).toFixed(1)}%</td><td className="py-2 px-3">{r.modelOdds!=null?americanFmt(r.modelOdds):"–"}</td><td className="py-2 px-3">{r.realOdds!=null?americanFmt(r.realOdds):"–"}</td><td className="py-2 px-3">{r.ev!=null?r.ev.toFixed(3):"–"}</td><td className="py-2 px-3">{r.why}</td></tr>))}</tbody></table></div>);

  return (<div className="p-4 space-y-5">
    <div className="flex items-end justify-between">
      <div><h1 className="text-2xl font-semibold">MLB — 2+ Hits</h1>
        <div className="text-sm opacity-80">
          date: {date} • data: {status.loading ? "loading..." : "ok"} • odds: {status.oddsOk ? "ok" : "missing"} — provider: {status.provider} — UsingOddsApi: {String(status.usingOddsApi)} • model: {status.modelOk ? `ok (${status.modelCount})` : "missing"}
        </div>
      </div>
      <div className="text-right text-xs opacity-70">EV floor used for "Pure EV": +{(0.05).toFixed(2)} per unit</div>
    </div>
    <div className="grid md:grid-cols-2 gap-4">{parlaySlates.map((s, idx) => <ParlayTable key={idx} slate={s} />)}</div>
    <Table rows={byProb} caption="Pure Probability — Top 10" />
    <Table rows={byEV} caption="Pure EV — Top 10 (EV ≥ +0.05)" />
  </div>);
}
