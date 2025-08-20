
import React, { useCallback, useMemo, useState } from "react";

const fmtPct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const americanToDecimal = (american) => {
  if (american == null) return null;
  const n = Number(american);
  if (Number.isNaN(n)) return null;
  if (n >= 100) return 1 + n / 100;
  if (n <= -100) return 1 + 100 / Math.abs(n);
  return null;
};
const decimalToAmerican = (dec) => {
  if (!dec || dec <= 1) return null;
  const imp = (dec - 1);
  return imp >= 1 ? `+${Math.round(imp*100)}` : `-${Math.round(100/imp)}`;
};

function hotColdMultiplier({ hr7 = 0, pa50 = 50 } = {}) {
  let m = 1;
  if (hr7 >= 2) m *= 1.06;
  else if (hr7 === 1) m *= 1.03;
  if (pa50 < 30) m *= 0.98;
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

async function tryLoadCandidates(oddsSnapshot) {
  const tryPaths = [
    "/.netlify/functions/mlb-daily-learn",
    "/.netlify/functions/mlb-candidates",
    "/data/mlb/model-candidates.json",
    "/data/mlb/candidates.json"
  ];
  for (const p of tryPaths) {
    try {
      const j = await fetchJson(p);
      const cand = j?.candidates || j?.picksToday || j?.rows || j;
      if (Array.isArray(cand) && cand.length) return cand;
    } catch { /* keep trying */ }
  }
  // last resort: synthesize from odds (implied prob) so UI isn't empty
  const out = [];
  const offers = Array.isArray(oddsSnapshot?.offers) ? oddsSnapshot.offers : [];
  for (const o of offers) {
    if (o.market === "batter_home_runs" && o.outcome === "Over" && o.point === 0.5) {
      const dec = americanToDecimal(o.american);
      const implied = dec ? 1/dec : 0.28;
      out.push({
        player: o.player,
        game: o.groupKey ? o.groupKey.split(":")[0].split("|")[0] : "",
        baseHrProb: implied,
        recent: { hr7: 0, pa50: 50 },
        pitcherPitchTypeDamage: 0,
        gameId: o.gameId,
        why: "implied from market; fallback"
      });
    }
  }
  return out;
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
      try { await fetchJson("/.netlify/functions/odds-refresh-multi"); } catch {}
      let odds = { offers: [] };
      try {
        odds = await fetchJson("/.netlify/functions/odds-get");
      } catch {}
      const usingOddsApi = Array.isArray(odds.offers) && odds.offers.length > 0;

      // load candidates from the best available source
      const modelInputs = await tryLoadCandidates(odds);

      const fanduelOver05 = new Map();
      for (const o of odds.offers || []) {
        if (o.market === "batter_home_runs" && o.outcome === "Over" && o.point === 0.5 && o.bookKey === "fanduel") {
          fanduelOver05.set(`${o.gameId}|${o.player}`, o);
        }
      }

      const out = [];
      for (const c of modelInputs) {
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
