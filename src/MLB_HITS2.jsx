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

/** ---- Context multipliers (kept bounded) ---- */
function applyContextMultipliers(baseProb, ctx = {}) {
  let p = baseProb;
  const { platoonBoost = 1, spBAABoost = 1, bullpenBoost = 1 } = ctx;
  p = p * platoonBoost * spBAABoost * bullpenBoost;
  return clamp(p, 0.01, 0.80);
}

/** ---- Simple combinator for parlays treating legs independent ---- */
function parlayFromLegs(legs) {
  // legs: [{prob, american}]
  const decs = legs.map(l => americanToDecimal(l.american)).filter(Boolean);
  if (decs.length !== legs.length) return { dec: null, american: null, prob: null, ev: null };
  const dec = decs.reduce((a,b)=>a*b, 1);
  // Combine probability (independence assumption)
  const prob = legs.reduce((a,l)=>a * (l.prob ?? 0), 1);
  const american = (() => {
    if (dec >= 2) return Math.round((dec - 1) * 100);
    return Math.round(-100 / (dec - 1));
  })();
  const ev = prob * (dec - 1) - (1 - prob);
  return { dec, american, prob, ev };
}

/** ---- Demo model fetch (replace with your real model call) ---- */
async function fetchModel(date) {
  // Placeholder for development. Replace with your prod data source.
  return [
    { player: "Luis Arraez", team: "MIA", game: "MIA@ATL", baseProb: 0.28, hand:"L" },
    { player: "Jose Altuve", team: "HOU", game: "PHI@HOU", baseProb: 0.26, hand:"R" },
    { player: "Freddie Freeman", team: "LAD", game: "CIN@LAD", baseProb: 0.24, hand:"L" },
    { player: "Steven Kwan", team: "CLE", game: "TB@CLE", baseProb: 0.22, hand:"L" },
    { player: "Bo Bichette", team: "TOR", game: "MIN@TOR", baseProb: 0.21, hand:"R" },
    { player: "Trea Turner", team: "PHI", game: "PHI@NYM", baseProb: 0.205, hand:"R" },
    { player: "Xavier Edwards", team: "MIA", game: "ATL@MIA", baseProb: 0.20, hand:"S" },
    { player: "Aaron Judge", team: "NYY", game: "WSH@NYY", baseProb: 0.195, hand:"R" },
    { player: "Corbin Carroll", team: "AZ", game: "AZ@MIL", baseProb: 0.19, hand:"L" },
    { player: "Francisco Lindor", team: "NYM", game: "PHI@NYM", baseProb: 0.188, hand:"S" },
    { player: "Randy Arozarena", team: "TB", game: "TB@CLE", baseProb: 0.187, hand:"R" },
    { player: "Adley Rutschman", team: "BAL", game: "BAL@BOS", baseProb: 0.184, hand:"S" },
  ];
}

export default function MLB_HITS2() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);
  const [odds, setOdds] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [status, setStatus] = useState({});

  useEffect(() => {
    (async () => {
      setStatus(s => ({ ...s, loading: true }));
      const [model, oddsRes, ctxRes] = await Promise.all([
        fetchModel(date),
        fetch(`/.netlify/functions/odds-hits2?date=${date}`).then(r=>r.json()).catch(()=>({ ok:false })),
        fetch(`/.netlify/functions/mlb-game-context?date=${date}`).then(r=>r.json()).catch(()=>({ ok:false })),
      ]);
      setRows(model || []);
      setOdds(oddsRes || null);
      setCtx(ctxRes || null);
      setStatus({
        loading: false,
        oddsOk: !!(oddsRes && oddsRes.ok && oddsRes.count >= 0),
        usingOddsApi: !!(oddsRes && oddsRes.usingOddsApi),
        provider: oddsRes?.provider || "fallback",
        ctxOk: !!(ctxRes && ctxRes.ok),
        games: ctxRes?.count || 0,
      });
    })();
  }, [date]);

  const oddsByPlayer = useMemo(() => {
    const m = new Map();
    if (odds?.offers) for (const o of odds.offers) m.set(o.player, o);
    return m;
  }, [odds]);

  // TODO: map gameId -> context when your prod model provides IDs. For now, use benign defaults.
  const enriched = useMemo(() => {
    return (rows || []).map(r => {
      // Context multipliers (placeholder logic for demo)
      const spHand = "R";
      const platoonBoost = r.hand && spHand ? (r.hand !== spHand ? 1.04 : 0.98) : 1;
      const spBAA = 0.250;
      const spBAABoost = clamp(1 + (spBAA - 0.240), 0.95, 1.05);
      const bullpenIP = 11;
      const bullpenBoost = clamp(1 + 0.01 * Math.max(0, bullpenIP - 9), 0.92, 1.10);

      const modelProb = applyContextMultipliers(r.baseProb, { platoonBoost, spBAABoost, bullpenBoost });
      const modelOdds = probToFairAmerican(modelProb);

      const o = oddsByPlayer.get(r.player);
      const realOdds = o?.american ?? null;
      const ev = realOdds!==null && realOdds!==undefined ? calcEV(modelProb, realOdds) : null;

      const why = [
        `L15 form: stable`,
        `platoon vs SP: ${r.hand}/${spHand} (x${platoonBoost.toFixed(2)})`,
        `SP BAA: ${spBAA.toFixed(3)} (x${spBAABoost.toFixed(2)})`,
        `Opp BP last3d: ${bullpenIP.toFixed(1)} IP (x${bullpenBoost.toFixed(2)})`,
      ].join(" • ");

      return {
        ...r,
        modelProb,
        modelOdds,
        realOdds,
        ev,
        why
      };
    });
  }, [rows, oddsByPlayer]);

  /** ---- Ranking buckets ---- */
  const byProb = useMemo(() => [...enriched].sort((a,b)=>b.modelProb-a.modelProb).slice(0,10), [enriched]);
  const EV_FLOOR = 0.05; // Recommended floor for 2+ hits
  const byEVAll = useMemo(() => enriched.filter(r => r.ev !== null).sort((a,b)=>b.ev-a.ev), [enriched]);
  const byEV = useMemo(() => byEVAll.filter(r => r.ev >= EV_FLOOR).slice(0,10), [byEVAll]);

  /** ---- Parlay slate builder (3-4 slates) ---- */
  function distinctPlayers(list) {
    const seen = new Set(); const out = [];
    for (const r of list) { if (!seen.has(r.player)) { seen.add(r.player); out.push(r); } }
    return out;
  }
  const parlayCandidates = useMemo(() => distinctPlayers(byEVAll.slice(0,16)), [byEVAll]);

  function buildParlaySlates(cands) {
    const slates = [];
    // Slate A: 2-leg top EV
    if (cands.length >= 2) slates.push({ title: "Parlay A (2-leg, top EV)", legs: [cands[0], cands[1]] });
    // Slate B: 2-leg balanced (prob + ev)
    if (cands.length >= 4) slates.push({ title: "Parlay B (2-leg, balanced)", legs: [cands[0], byProb[0] || cands[2]] });
    // Slate C: 3-leg EV
    if (cands.length >= 3) slates.push({ title: "Parlay C (3-leg, EV)", legs: [cands[0], cands[1], cands[2]] });
    // Slate D: 3-leg blended
    if (cands.length >= 5) slates.push({ title: "Parlay D (3-leg, blended)", legs: [byProb[0] || cands[1], cands[2], cands[3]] });
    return slates.slice(0,4);
  }
  const parlaySlates = useMemo(() => buildParlaySlates(parlayCandidates), [parlayCandidates, byProb]);

  /** ---- UI helpers ---- */
  const StatusBar = () => (
    <div className="text-sm opacity-80">
      date: {date} • data: {status.loading ? "loading..." : "ok"} •
      {" "}odds: {status.oddsOk ? "ok" : "missing"} — provider: {status.provider} — UsingOddsApi: {String(status.usingOddsApi)} •
      {" "}context games: {status.games}
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
        <div className="px-3 py-2 text-sm font-semibold bg-gray-50">{slate.title}</div>
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
            {" "}context games: {status.games}
          </div>
        </div>
        <div className="text-right text-xs opacity-70">
          EV floor used for "Pure EV": +{(0.05).toFixed(2)} per unit
        </div>
      </div>

      {/* Parlays */}
      <div className="grid md:grid-cols-2 gap-4">
        {parlaySlates.map((s, idx) => <ParlayTable key={idx} slate={s} />)}
      </div>

      {/* Pure Probability (Top 10) */}
      <Table rows={byProb} caption="Pure Probability — Top 10" />

      {/* Pure EV (Top 10 over floor) */}
      <Table rows={byEV} caption="Pure EV — Top 10 (EV ≥ +0.05)" />

      <p className="text-xs opacity-70">
        Columns: Model Prob (our probability for 2+ hits), Model Odds (fair price), Real Odds (from odds API), EV (per 1u).
        “Why” summarizes platoon, SP quality, and opponent bullpen fatigue. Replace the demo model fetch with your production feed.
      </p>
    </div>
  );
}
