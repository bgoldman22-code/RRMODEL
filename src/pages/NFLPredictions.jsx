import React, { useEffect, useState } from 'react';

/**
 * NFL Predictions Page
 * Reads the function response and displays Moneyline / Spread / Total with confidences.
 * Compatible with both new shape (moneylineText, spreadText, totalText) and
 * older/alternate keys to avoid blanks.
 */

const fmt = (v) => (v === null || v === undefined || v === '' ? '–' : v);
const fmtPct = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : (typeof p === 'string' ? p : '–'));

async function fetchPredictions(force = false) {
  const url = `/ .netlify/functions/nfl-predictions-generate${force ? '?force=true' : ''}`.replace(' ', '');
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (force=false) => {
    setLoading(true); setError(null);
    try {
      const data = await fetchPredictions(force);
      setRows(Array.isArray(data.rows) ? data.rows : []);
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
        <h1 className="text-2xl font-semibold">NFL Predictions</h1>
        <button
          className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
          onClick={() => load(true)}
        >
          Generate New Predictions
        </button>
      </div>

      {error && (
        <div className="mb-4 text-red-600">Error: {error}</div>
      )}

      <div className="overflow-auto rounded-2xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Matchup</th>
              <th className="px-4 py-3 text-left font-medium">Kickoff</th>
              <th className="px-4 py-3 text-left font-medium">Moneyline</th>
              <th className="px-4 py-3 text-left font-medium">Conf</th>
              <th className="px-4 py-3 text-left font-medium">Spread</th>
              <th className="px-4 py-3 text-left font-medium">Conf</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Conf</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-neutral-500" colSpan={8}>No predictions.</td></tr>
            ) : (
              rows.map((r) => {
                const moneyline = r.moneylineText || r.displayPick || r.pick?.pickLabel || '–';
                const mlConf = r.moneylineConf ?? r.pick?.confidence ?? null;

                const spread = r.spreadText || r.spreadPick || '–';
                const spConf = r.spreadConf ?? null;

                const total = r.totalText || r.totalPick || '–';
                const totConf = r.totalConf ?? null;

                const kickoff = r.kickoff ? new Date(r.kickoff).toLocaleString() : '–';

                return (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3">{fmt(r.matchup)}</td>
                    <td className="px-4 py-3">{fmt(kickoff)}</td>
                    <td className="px-4 py-3">{fmt(moneyline)}</td>
                    <td className="px-4 py-3">{fmtPct(mlConf)}</td>
                    <td className="px-4 py-3">{fmt(spread)}</td>
                    <td className="px-4 py-3">{fmtPct(spConf)}</td>
                    <td className="px-4 py-3">{fmt(total)}</td>
                    <td className="px-4 py-3">{fmtPct(totConf)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}