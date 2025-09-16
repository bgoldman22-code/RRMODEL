import React, { useEffect, useState } from 'react';

/**
 * NFL Predictions Page
 * Updated to work with the actual API response structure
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '–' : v);
const fmtPct = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : (typeof p === 'string' ? p : '–'));
const fmtOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

async function fetchPredictions(force = false) {
  const url = `/.netlify/functions/nfl-predictions-generate${force ? '?force=1' : ''}`;
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (force=false) => {
    setLoading(true); setError(null);
    try {
      const data = await fetchPredictions(force);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setMeta(data.meta || null);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">NFL Predictions</h1>
          {meta && (
            <p className="text-sm text-gray-600">
              Week {meta.week}, {meta.season} • {meta.games} games • Model: {meta.model}
            </p>
          )}
        </div>
        <button
          className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
          onClick={() => load(true)}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Generate New Predictions'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">Error: {error}</div>
      )}

      <div className="overflow-auto rounded-2xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Matchup</th>
              <th className="px-4 py-3 text-left font-medium">Kickoff</th>
              <th className="px-4 py-3 text-left font-medium">Pick</th>
              <th className="px-4 py-3 text-left font-medium">Prob</th>
              <th className="px-4 py-3 text-left font-medium">Market Odds</th>
              <th className="px-4 py-3 text-left font-medium">Edge</th>
              <th className="px-4 py-3 text-left font-medium">Confidence</th>
              <th className="px-4 py-3 text-left font-medium">Factors</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={8}>No predictions available.</td></tr>
            ) : (
              rows.map((r, idx) => {
                const kickoff = r.start ? new Date(r.start).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : '–';
                
                const marketOdds = r.pick === r.matchup?.split(' @ ')[1] ? r.ml_home : r.ml_away;
                const edge = r.modelEdge;
                const edgeColor = edge > 0 ? 'text-green-600' : edge < -0.05 ? 'text-red-600' : '';

                return (
                  <tr key={r.gameId || idx} className="border-t border-neutral-200 hover:bg-neutral-25">
                    <td className="px-4 py-3 font-medium">{fmt(r.matchup)}</td>
                    <td className="px-4 py-3">{kickoff}</td>
                    <td className="px-4 py-3 font-medium">{fmt(r.pick)}</td>
                    <td className="px-4 py-3">{fmtPct(r.modelPickProb)}</td>
                    <td className="px-4 py-3">{marketOdds ? fmtOdds(marketOdds) : '–'}</td>
                    <td className={`px-4 py-3 ${edgeColor}`}>
                      {edge !== null ? `${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}%` : '–'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        (r.confidence || 0) >= 7 ? 'bg-green-100 text-green-800' :
                        (r.confidence || 0) >= 4 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {r.confidence || '–'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(r.factors || []).length > 0 ? r.factors.join(', ') : '–'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {rows.length > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          <p><strong>Edge:</strong> Model probability vs market probability. Positive = model favor, negative = market favor.</p>
          <p><strong>Confidence:</strong> Based on edge magnitude. Higher = stronger conviction.</p>
          <p><strong>Factors:</strong> hot/cold form, home field advantage indicators.</p>
        </div>
      )}
    </div>
  );
}
