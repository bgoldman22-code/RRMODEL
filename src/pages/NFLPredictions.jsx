// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from 'react';

function fmtMoneyline(v) {
  if (v == null) return '';
  return (v > 0 ? `+${v}` : `${v}`);
}
function pct(x) {
  if (x == null) return '';
  return (x * 100).toFixed(1) + '%';
}

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/.netlify/functions/nfl-predictions-get');
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Failed to load');
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setUpdated(j.updated || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NFL Predictions</h1>
      <p className="text-sm text-gray-500 mb-6">
        Latest model picks with moneyline, spread and total lines.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <a className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm" href="/.netlify/functions/nfl-predictions-train?open=1" target="_blank" rel="noreferrer">
          🔧 Train (URL)
        </a>
        <a className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm" href="/.netlify/functions/nfl-predictions-score?open=1" target="_blank" rel="noreferrer">
          ♻️ Rescore (URL)
        </a>
        {updated && <span className="text-xs text-gray-500">Updated: {new Date(updated).toLocaleString()}</span>}
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && rows.length === 0 && (
        <div className="text-gray-600">
          No predictions found. Click <code>Train (URL)</code>, wait 2–3 seconds, then refresh this page.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Kickoff</th>
                <th className="text-left p-2">Matchup</th>
                <th className="text-left p-2">Moneyline</th>
                <th className="text-left p-2">Spread</th>
                <th className="text-left p-2">Total</th>
                <th className="text-left p-2">Pick</th>
                <th className="text-left p-2">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.kickoff).toLocaleString()}</td>
                  <td className="p-2">{r.matchup}</td>
                  <td className="p-2">
                    H {fmtMoneyline(r.ml_home_best)} / A {fmtMoneyline(r.ml_away_best)}<br/>
                    H {pct(r.ml_home_imp)} / A {pct(r.ml_away_imp)}
                  </td>
                  <td className="p-2">{r.spread_team} {r.spread_line}</td>
                  <td className="p-2">{r.total_side} {r.total_line}</td>
                  <td className="p-2">
                    {r.pick?.type === 'moneyline' && `${r.pick.team} ML`}
                    {r.pick?.type === 'spread'    && `${r.pick.team} ${r.spread_line}`}
                    {r.pick?.type === 'total'     && `${r.total_side} ${r.total_line}`}
                  </td>
                  <td className="p-2">{r.pick?.confidence != null ? pct(r.pick.confidence) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
