// site/src/pages/NFL_Predictions.jsx
import React, { useEffect, useState } from "react";

function fmtOdd(x) { return x==null ? "—" : (x>0?`+${x}`:`${x}`); }
function pct(x) { return x==null ? "—" : (x*100).toFixed(1) + "%"; }
function when(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

export default function NFL_Predictions() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/.netlify/functions/nfl-predictions-get");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      setData(json);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">NFL Predictions & Odds</h1>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
          {loading ? "Generating…" : "Generate Latest"}
        </button>
      </div>

      {err && <div className="p-3 bg-red-100 text-red-800 rounded mb-4">{err}</div>}
      {data && <p className="text-sm text-gray-600 mb-2">Updated: {when(data.updated)}</p>}

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Kickoff</th>
              <th className="p-2 text-left">Matchup</th>
              <th className="p-2 text-right">Home ML</th>
              <th className="p-2 text-right">Away ML</th>
              <th className="p-2 text-right">Home Imp.</th>
              <th className="p-2 text-right">Away Imp.</th>
              <th className="p-2 text-right">Spread</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-left">Our Pick</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{when(r.kickoff)}</td>
                <td className="p-2">{r.matchup}</td>
                <td className="p-2 text-right">{fmtOdd(r.ml_home_best)}</td>
                <td className="p-2 text-right">{fmtOdd(r.ml_away_best)}</td>
                <td className="p-2 text-right">{pct(r.ml_home_imp)}</td>
                <td className="p-2 text-right">{pct(r.ml_away_imp)}</td>
                <td className="p-2 text-right">
                  {r.spread_team ? `${r.spread_team} ${r.spread_line>0?'+':''}${r.spread_line}` : "—"}
                </td>
                <td className="p-2 text-right">
                  {r.total_side ? `${r.total_side} ${r.total_line}` : "—"}
                </td>
                <td className="p-2">
                  {r.pick ? (
                    r.pick.type === "moneyline" ? `${r.pick.team} ML (${pct(r.pick.confidence)})` :
                    r.pick.type === "spread" ? `${r.pick.team} ${r.pick.line>0?'+':''}${r.pick.line} (${pct(r.pick.confidence)})` :
                    `${r.pick.side} ${r.pick.line} (${pct(r.pick.confidence)})`
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.parlay?.legs?.length ? (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Suggested Parlay (3–5 legs)</h2>
          <ul className="space-y-2">
            {data.parlay.legs.map((l, i) => (
              <li key={i} className="p-3 rounded border">
                <div className="font-medium">{l.leg}</div>
                <div className="text-xs text-gray-600">{l.matchup}</div>
                <div className="text-xs text-gray-600">Confidence: {pct(l.confidence)}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
