// src/MLB_HITS2.jsx
import React, { useEffect, useMemo, useState } from "react";

// Utility: convert prob -> fair American odds
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

function calcEV(prob, american) {
  const dec = americanToDecimal(american);
  if (!prob || !dec) return null;
  // EV per 1 unit: p*(dec-1) - (1-p)
  return prob * (dec - 1) - (1 - prob);
}

// Bounded multipliers for context
function applyContextMultipliers(baseProb, ctx = {}) {
  let p = baseProb;
  const { platoonBoost = 1, spBAABoost = 1, bullpenBoost = 1 } = ctx;
  p = p * platoonBoost * spBAABoost * bullpenBoost;
  // keep sane bounds 0.01–0.80 for 2+ hits props
  p = Math.max(0.01, Math.min(0.80, p));
  return p;
}

export default function MLB_HITS2() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);           // model base rows
  const [odds, setOdds] = useState(null);         // odds API payload
  const [ctx, setCtx] = useState(null);           // SP + bullpen context
  const [status, setStatus] = useState({});
  const [filters, setFilters] = useState({ minEV: 0, onlyPositiveEV: false });

  // TODO: Replace the below with your real model fetch for base 2+ hits probabilities
  async function fetchModel(date) {
    // Placeholder: you likely have this already; we fabricate a small sample
    return [
      { player: "Luis Arraez", team: "MIA", gameId: "fake1", baseProb: 0.28, hand:"L" },
      { player: "Jose Altuve", team: "HOU", gameId: "fake2", baseProb: 0.26, hand:"R" },
      { player: "Freddie Freeman", team: "LAD", gameId: "fake3", baseProb: 0.24, hand:"L" },
      { player: "Steven Kwan", team: "CLE", gameId: "fake4", baseProb: 0.22, hand:"L" },
    ];
  }

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
    if (odds?.offers) {
      for (const o of odds.offers) m.set(o.player, o);
    }
    return m;
  }, [odds]);

  const contextByGame = useMemo(() => {
    const m = new Map();
    if (ctx?.context) {
      for (const g of ctx.context) m.set(g.gamePk, g);
    }
    return m;
  }, [ctx]);

  const enriched = useMemo(() => {
    return (rows || []).map(r => {
      const o = oddsByPlayer.get(r.player);
      // crude context demo: if L batter vs R starter, boost; lower if vs L starter
      let platoonBoost = 1, spBAABoost = 1, bullpenBoost = 1;
      // We don't have real gamePk mapping in this demo; production should map r.gameId to contextByGame.get(r.gameId)
      const spHand = "R"; // placeholder
      if (r.hand && spHand) {
        if (r.hand !== spHand) platoonBoost = 1.04; else platoonBoost = 0.98;
      }
      const spBAA = 0.250; // placeholder
      if (spBAA) {
        spBAABoost = Math.max(0.95, Math.min(1.05, 1 + (spBAA - 0.240))); // around league avg .240
      }
      const bullpenIP = 11; // placeholder
      if (bullpenIP) {
        const over = Math.max(0, bullpenIP - 9);
        bullpenBoost = Math.max(0.92, Math.min(1.10, 1 + 0.01 * over));
      }

      const modelProb = applyContextMultipliers(r.baseProb, { platoonBoost, spBAABoost, bullpenBoost });
      const modelFair = probToFairAmerican(modelProb);
      const bestOdds = o?.american ?? null;
      const ev = (bestOdds !== null && bestOdds !== undefined) ? calcEV(modelProb, bestOdds) : null;

      const whyBits = [
        `season contact: solid`,
        `L15 form: stable`,
        `platoon vs SP: ${r.hand}/${spHand} (boost ${platoonBoost.toFixed(2)}x)`,
        `SP BAA: ${spBAA.toFixed(3)} (boost ${spBAABoost.toFixed(2)}x)`,
        `Opp BP last3d: ${bullpenIP.toFixed(1)} IP (boost ${bullpenBoost.toFixed(2)}x)`,
      ];

      return {
        ...r,
        modelProb,
        modelFair,
        bestOdds,
        provider: odds?.provider || "fallback",
        usingOddsApi: !!odds?.usingOddsApi,
        ev,
        why: whyBits.join(" • ")
      };
    });
  }, [rows, oddsByPlayer, contextByGame, odds]);

  const filtered = useMemo(() => {
    return enriched.filter(row => {
      if (filters.onlyPositiveEV && !(row.ev !== null && row.ev > 0)) return false;
      if (filters.minEV && !(row.ev !== null && row.ev >= filters.minEV)) return false;
      return true;
    });
  }, [enriched, filters]);

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-2xl font-semibold">MLB — 2+ Hits Model</h1>
      <div className="text-sm opacity-80">
        date: {date} • data: {status.loading ? "loading..." : "ok"} •
        {" "}odds: {status.oddsOk ? "ok" : "missing"} — provider: {status.provider} — UsingOddsApi: {String(status.usingOddsApi)} •
        {" "}context games: {status.games}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <label>Min EV (1u):
          <input
            type="number"
            step="0.01"
            className="border px-2 py-1 ml-2 w-24"
            value={filters.minEV}
            onChange={e=>setFilters(f=>({ ...f, minEV: parseFloat(e.target.value||"0") }))}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.onlyPositiveEV}
            onChange={e=>setFilters(f=>({ ...f, onlyPositiveEV: e.target.checked }))}
          />
          Only positive EV
        </label>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">Team</th>
              <th className="py-2 pr-4">Model Prob</th>
              <th className="py-2 pr-4">Model Fair</th>
              <th className="py-2 pr-4">Best Odds</th>
              <th className="py-2 pr-4">EV (1u)</th>
              <th className="py-2 pr-4">Provider</th>
              <th className="py-2 pr-4">UsingOddsApi</th>
              <th className="py-2 pr-4">Why</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="py-1 pr-4">{r.player}</td>
                <td className="py-1 pr-4">{r.team}</td>
                <td className="py-1 pr-4">{(r.modelProb*100).toFixed(1)}%</td>
                <td className="py-1 pr-4">{r.modelFair !== null ? `${r.modelFair > 0 ? "+" : ""}${r.modelFair}` : "-"}</td>
                <td className="py-1 pr-4">{r.bestOdds !== null && r.bestOdds !== undefined ? `${r.bestOdds > 0 ? "+" : ""}${r.bestOdds}` : "-"}</td>
                <td className="py-1 pr-4">{r.ev !== null ? r.ev.toFixed(3) : "-"}</td>
                <td className="py-1 pr-4">{r.provider}</td>
                <td className="py-1 pr-4">{String(r.usingOddsApi)}</td>
                <td className="py-1 pr-4">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-70">
        EV is computed as p*(decimal-1) - (1-p) using the model probability and the best American odds fetched. “Model Fair” is the fair price from the model (prob→odds).
      </p>
    </div>
  );
}
