// src/MLB_HITS2.jsx
import React, { useEffect, useMemo, useState } from "react";

/** ---- Math helpers ---- */
function probToFairAmerican(p) {
  if (!p || p <= 0) return null;
  if (p >= 1) return -100;
  const dec = 1 / p;
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}
function americanToDecimal(american) {
  if (american === null || american === undefined) return null;
  const a = Number(american);
  if (Number.isNaN(a)) return null;
  if (a > 0) return 1 + a / 100;
  return 1 + 100 / Math.abs(a);
}
function americanFmt(a) {
  if (a === null || a === undefined) return "–";
  return `${a > 0 ? "+" : ""}${a}`;
}
function calcEV(prob, american) {
  const dec = americanToDecimal(american);
  if (!prob || !dec) return null;
  return prob * (dec - 1) - (1 - prob);
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/** ---- Parlays ---- */
function parlayFromLegs(legs) {
  const decs = legs.map(l => americanToDecimal(l.american)).filter(Boolean);
  if (decs.length !== legs.length) return { dec: null, american: null, prob: null, ev: null };
  const dec = decs.reduce((a,b)=>a*b, 1);
  const prob = legs.reduce((a,l)=>a * (l.prob ?? 0), 1);
  const american = (dec >= 2) ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  const ev = prob * (dec - 1) - (1 - prob);
  return { dec, american, prob, ev };
}

export default function MLB_HITS2() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);
  const [odds, setOdds] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [status, setStatus] = useState({});
  const [copied, setCopied] = useState("");

  useEffect(() => {
    (async () => {
      setStatus(s => ({ ...s, loading: true }));
      const [modelRes, oddsRes, ctxRes] = await Promise.all([
        fetch(`/.netlify/functions/hits2-model?date=${date}`).then(r=>r.json()).catch(()=>({ ok:false })),
        fetch(`/.netlify/functions/odds-hits2?date=${date}`).then(r=>r.json()).catch(()=>({ ok:false })),
        fetch(`/.netlify/functions/mlb-game-context?date=${date}`).then(r=>r.json()).catch(()=>({ ok:false })),
      ]);
      setRows(modelRes?.players || []);
      setOdds(oddsRes || null);
      setCtx(ctxRes || null);
      setStatus({
        loading: false,
        oddsOk: !!(oddsRes && oddsRes.ok && oddsRes.count >= 0),
        usingOddsApi: !!(oddsRes && oddsRes.usingOddsApi),
        provider: oddsRes?.provider || "fallback",
        ctxOk: !!(ctxRes && ctxRes.ok),
        games: ctxRes?.count || 0,
        modelOk: !!modelRes?.ok,
        modelCount: modelRes?.count || 0,
      });
    })();
  }, [date]);

  // odds index with normalized key
  const oddsByKey = useMemo(() => {
    const m = new Map();
    const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
    if (odds?.offers) for (const o of odds.offers) m.set(o.playerKey || norm(o.player), o);
    return m;
  }, [odds]);

  // Build rows merged with odds & context
  const enriched = useMemo(() => {
    const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
    return (rows || []).map(r => {
      const k = norm(r.player);
      const o = oddsByKey.get(k);
      const modelProb = clamp(r.baseProb || 0, 0.01, 0.80);
      const modelOdds = probToFairAmerican(modelProb);
      const realOdds = o?.american ?? null;
      const ev = realOdds!==null && realOdds!==undefined ? calcEV(modelProb, realOdds) : null;

      const whyBits = [];
      if (r.modelDetail) {
        const md = r.modelDetail;
        if (typeof md.seasonAVG === "number") whyBits.push(`season AVG ${md.seasonAVG.toFixed(3)}`);
        if (typeof md.last15AVG === "number") whyBits.push(`L15 AVG ${md.last15AVG.toFixed(3)}`);
        if (md.expAB) whyBits.push(`expAB ${md.expAB}`);
        if (md.oppSP) {
          const baa = md.spBAA != null ? md.spBAA.toFixed(3) : "—";
          whyBits.push(`vs ${md.oppSP} (BAA ${baa})`);
        }
      }
      return {
        player: r.player,
        team: r.team,
        game: r.game,
        modelProb,
        modelOdds,
        realOdds,
        ev,
        why: whyBits.join(" • ")
      };
    });
  }, [rows, oddsByKey]);

  /** ---- Ranking buckets ---- */
  const byProb = useMemo(() => [...enriched].sort((a,b)=>b.modelProb-a.modelProb).slice(0,10), [enriched]);
  const byEVAll = useMemo(() => enriched.filter(r => r.ev !== null).sort((a,b)=>b.ev-a.ev), [enriched]);
  const EV_FLOOR = 0.05;
  const byEV = useMemo(() => byEVAll.filter(r => r.ev >= EV_FLOOR).slice(0,10), [byEVAll]);

  /** ---- Parlay slates ---- */
  function distinctPlayers(list) { const s=new Set(); const out=[]; for (const r of list){ if(!s.has(r.player)){ s.add(r.player); out.push(r);}} return out; }
  const parlayCandidates = useMemo(() => distinctPlayers(byEVAll.slice(0,16)), [byEVAll]);

  function buildParlaySlates(cands) {
    const slates = [];
    if (cands.length >= 2) slates.push({ title: "Parlay A (2-leg, top EV)", legs: [cands[0], cands[1]] });
    if (cands.length >= 4) slates.push({ title: "Parlay B (2-leg, balanced)", legs: [cands[0], byProb[0] || cands[2]] });
    if (cands.length >= 3) slates.push({ title: "Parlay C (3-leg, EV)", legs: [cands[0], cands[1], cands[2]] });
    if (cands.length >= 5) slates.push({ title: "Parlay D (3-leg, blended)", legs: [byProb[0] || cands[1], cands[2], cands[3]] });
    return slates.slice(0,4);
  }
  const parlaySlates = useMemo(() => buildParlaySlates(parlayCandidates), [parlayCandidates, byProb]);

  /** ---- Copy helpers ---- */
  function slipTextForSlate(slate) {
    const legs = slate.legs.map(l => ({ label: l.player, prob: l.modelProb, american: l.realOdds }));
    const agg = parlayFromLegs(legs);
    const dateStr = date;
    const legsText = slate.legs.map(l => `- ${l.player} 2+ hits (${(l.modelProb*100).toFixed(1)}% | ${americanFmt(l.realOdds)})`).join("\n");
    return [
      `MLB 2+ Hits — ${slate.title}`,
      `Date: ${dateStr}`,
      legsText,
      `Parlay: prob ${(agg.prob*100).toFixed(1)}% | ${americanFmt(agg.american)} | EV ${agg.ev!==null ? agg.ev.toFixed(3) : "–"}`
    ].join("\n");
  }
  async function copySlate(slate) {
    try {
      await navigator.clipboard.writeText(slipTextForSlate(slate));
      setCopied(slate.title);
      setTimeout(()=>setCopied(""), 2000);
    } catch {}
  }

  /** ---- UI pieces ---- */
  const StatusBar = () => (
    <div className="text-sm opacity-80">
      date: {date} • data: {status.loading ? "loading..." : "ok"} •
      {" "}odds: {status.oddsOk ? "ok" : "missing"} — provider: {status.provider} — UsingOddsApi: {String(status.usingOddsApi)} •
      {" "}model: {status.modelOk ? `ok (${status.modelCount})` : "missing"} • context games: {status.games}
    </div>
  );
  const Table = ({ rows, caption }) => (
    <div className="overflow-auto border rounded-2xl shadow-sm">
      {caption && <div className="px-3 py-2 text-sm font-semibold bg-gray-50">{caption}</div>}
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 px-3">Player</th>
            <th className="py-2 px-3">Team</th>
            <th className="py-2 px-3">Game</th>
            <th className="py-2 px-3">Model Prob</th>
            <th className="py-2 px-3">Model Odds</th>
            <th className="py-2 px-3">Real Odds</th>
            <th className="py-2 px-3">EV (1u)</th>
            <th className="py-2 px-3">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="py-2 px-3">{r.player}</td>
              <td className="py-2 px-3">{r.team}</td>
              <td className="py-2 px-3">{r.game}</td>
              <td className="py-2 px-3">{(r.modelProb*100).toFixed(1)}%</td>
              <td className="py-2 px-3">{r.modelOdds!==null ? americanFmt(r.modelOdds) : "–"}</td>
              <td className="py-2 px-3">{r.realOdds!==null && r.realOdds!==undefined ? americanFmt(r.realOdds) : "–"}</td>
              <td className="py-2 px-3">{r.ev!==null ? r.ev.toFixed(3) : "–"}</td>
              <td className="py-2 px-3">{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const ParlayTable = ({ slate }) => {
    const legs = slate.legs.map(l => ({ label: l.player, prob: l.modelProb, american: l.realOdds }));
    const agg = parlayFromLegs(legs);
    return (
      <div className="overflow-auto border rounded-2xl shadow-sm">
        <div className="px-3 py-2 text-sm font-semibold bg-gray-50 flex items-center justify-between">
          <span>{slate.title}</span>
          <button className="text-xs border rounded-lg px-2 py-1 hover:shadow" onClick={() => copySlate(slate)}>
            {copied === slate.title ? "Copied!" : "Copy slip"}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 px-3">Leg</th>
              <th className="py-2 px-3">Model Prob</th>
              <th className="py-2 px-3">Real Odds</th>
            </tr>
          </thead>
          <tbody>
            {slate.legs.map((l,i)=>(
              <tr key={i} className="border-b">
                <td className="py-2 px-3">{l.player}</td>
                <td className="py-2 px-3">{(l.modelProb*100).toFixed(1)}%</td>
                <td className="py-2 px-3">{l.realOdds!==null && l.realOdds!==undefined ? americanFmt(l.realOdds) : "–"}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 px-3 font-semibold">Parlay Total</td>
              <td className="py-2 px-3 font-semibold">{agg.prob!==null ? `${(agg.prob*100).toFixed(1)}%` : "–"}</td>
              <td className="py-2 px-3 font-semibold">{agg.american!==null ? americanFmt(agg.american) : "–"}</td>
            </tr>
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs opacity-75">
          EV (1u): {agg.ev!==null ? agg.ev.toFixed(3) : "–"} • Assumes independence between legs.
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">MLB — 2+ Hits</h1>
          <div className="text-sm opacity-80">
            date: {date} • data: {status.loading ? "loading..." : "ok"} •
            {" "}odds: {status.oddsOk ? "ok" : "missing"} — provider: {status.provider} — UsingOddsApi: {String(status.usingOddsApi)} •
            {" "}model: {status.modelOk ? `ok (${status.modelCount})` : "missing"} • context games: {status.games}
          </div>
        </div>
        <div className="text-right text-xs opacity-70">
          EV floor used for "Pure EV": +{(0.05).toFixed(2)} per unit
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {buildParlaySlates(parlayCandidates).map((s, idx) => <ParlayTable key={idx} slate={s} />)}
      </div>

      <Table rows={byProb} caption="Pure Probability — Top 10" />
      <Table rows={byEV} caption="Pure EV — Top 10 (EV ≥ +0.05)" />

      <p className="text-xs opacity-70">
        Columns: Model Prob, Model Odds (fair), Real Odds (from TheOddsAPI), EV (per 1u). “Why” summarizes season/L15, expAB, and opponent SP.
      </p>
    </div>
  );
}
