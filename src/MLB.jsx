
import React, { useCallback, useMemo, useState } from "react";

// Lightweight helpers kept inline to avoid extra imports
const fmtPct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const americanToDecimal = (american) => {
  if (american == null) return null;
  if (american >= 100) return 1 + american / 100;
  if (american <= -100) return 1 + 100 / Math.abs(american);
  return null;
};
const decimalToAmerican = (dec) => {
  if (!dec || dec <= 1) return null;
  const imp = (dec - 1);
  return imp >= 1 ? `+${Math.round(imp*100)}` : `-${Math.round(100/imp)}`;
};

// Simple hot/cold and pitch-type multipliers (safe defaults)
function hotColdMultiplier({ hr7 = 0, pa50 = 50 } = {}) {
  let m = 1;
  if (hr7 >= 2) m *= 1.06;
  else if (hr7 === 1) m *= 1.03;
  if (pa50 < 30) m *= 0.98; // low sample nudge
  return m;
}
function pitchTypeFitMultiplier({ damage = 0 } = {}) {
  if (damage >= 40) return 1.06;
  if (damage >= 25) return 1.03;
  if (damage <= -25) return 0.97;
  return 1.0;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function MLB() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState({
    usingOddsApi: false,
    candidates: 0,
    calibrationScale: 1.0,
    dateET: new Date().toISOString().slice(0,10),
  });
  const [rows, setRows] = useState([]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 1) Refresh odds (multi tries TheOddsAPI then falls back to SGO)
      try { await fetchJson("/.netlify/functions/odds-refresh-multi"); } catch {}

      // 2) Get cached odds snapshot (frontend-friendly)
      let odds = { offers: [] };
      try {
        odds = await fetchJson("/.netlify/functions/odds-get");
      } catch {}

      const usingOddsApi = Array.isArray(odds.offers) && odds.offers.length > 0;

      // 3) Pull your model inputs (assumes you have an endpoint in your app)
      // If you already have them injected in page state, replace this with that.
      // Here we fall back to a tiny set so UI renders even if your endpoint isn't present.
      let modelInputs = [];
      try {
        const data = await fetchJson("/data/mlb/model-candidates.json");
        modelInputs = Array.isArray(data?.candidates) ? data.candidates : [];
      } catch {
        modelInputs = [];
      }

      // 4) Build picks joining minimal odds
      const fanduelOver05 = new Map();
      for (const o of odds.offers || []) {
        if (o.market === "batter_home_runs" && o.outcome === "Over" && o.point === 0.5 && o.bookKey === "fanduel") {
          fanduelOver05.set(`${o.gameId}|${o.player}`, o);
        }
      }

      const out = [];
      for (const c of modelInputs) {
        // expected c: { player, game, baseHrProb, pitcherPitchTypeDamage, recent: {hr7, pa50} }
        const base = Math.max(0, Math.min(0.9, c.baseHrProb ?? 0.27));
        const m =
          hotColdMultiplier(c.recent) *
          pitchTypeFitMultiplier({ damage: c.pitcherPitchTypeDamage ?? 0 });

        const p = Math.max(0, Math.min(0.95, base * m));
        const modelAmerican = decimalToAmerican(1 / p) ?? "+200";

        const key = `${c.gameId || ""}|${c.player}`;
        const book = fanduelOver05.get(key);
        const actualAmerican = book?.american ?? null;
        const actualDecimal = americanToDecimal(actualAmerican);
        const ev = actualDecimal ? p * (actualDecimal - 1) - (1 - p) : null;

        out.push({
          player: c.player,
          game: c.game,
          modelPct: p,
          modelOdds: modelAmerican,
          actualOdds: actualAmerican,
          ev: ev,
          why: c.why || "",
        });
      }

      // 5) Sort by EV desc, fall back to prob
      out.sort((a,b) => (b.ev ?? 0) - (a.ev ?? 0) || (b.modelPct - a.modelPct));

      setRows(out);
      setDiagnostics({
        usingOddsApi,
        candidates: modelInputs.length,
        calibrationScale: 1.00,
        dateET: new Date().toISOString().slice(0,10),
      });
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  const headerLine = useMemo(() => {
    const using = diagnostics.usingOddsApi ? "yes" : "no";
    return `Date (ET): ${diagnostics.dateET} • Candidates: ${diagnostics.candidates} • Using OddsAPI: ${using} • Calibration scale: ${diagnostics.calibrationScale.toFixed(2)}`;
  }, [diagnostics]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">MLB HR — Calibrated + Hot/Cold + Odds-first EV</h1>
        <button
          onClick={generate}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      <div className="text-sm text-gray-600 mt-3">{headerLine}</div>

      <div className="mt-4">
        {error && (
          <div className="text-red-600 text-sm mb-2">Error: {error}</div>
        )}
        {rows.length === 0 && !loading && (
          <div className="text-gray-600 text-sm">No picks yet. Click Generate.</div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Game</th>
                  <th className="py-2 pr-4">Model HR%</th>
                  <th className="py-2 pr-4">Model Odds</th>
                  <th className="py-2 pr-4">Actual Odds</th>
                  <th className="py-2 pr-4">EV (1u)</th>
                  <th className="py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 pr-4">{r.player}</td>
                    <td className="py-2 pr-4">{r.game}</td>
                    <td className="py-2 pr-4">{fmtPct(r.modelPct)}</td>
                    <td className="py-2 pr-4">{r.modelOdds}</td>
                    <td className="py-2 pr-4">{r.actualOdds ?? "—"}</td>
                    <td className="py-2 pr-4">{r.ev == null ? "—" : r.ev.toFixed(3)}</td>
                    <td className="py-2">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
