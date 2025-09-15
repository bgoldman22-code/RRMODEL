// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from 'react';

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load(force=false) {
    setLoading(true);
    try {
      const res = await fetch(`/\.netlify/functions/nfl-predictions-generate${force ? '?force=1':''}`.replace('\\',''));
      const json = await res.json();
      setRows(json.rows || []);
    } catch (e) {
      console.error('load failed', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); }, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">NFL Predictions</h1>
        <button className="px-3 py-2 rounded bg-black text-white" onClick={()=>load(true)}>Generate New Predictions</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Matchup</th>
              <th className="py-2 pr-4">Kickoff</th>
              <th className="py-2 pr-4">Moneyline</th>
              <th className="py-2 pr-4">Conf</th>
              <th className="py-2 pr-4">Spread</th>
              <th className="py-2 pr-4">Conf</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Conf</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-3" colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-3" colSpan={8}>No rows yet — run training then generate.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-4">{r.matchup}</td>
                <td className="py-2 pr-4">{new Date(r.kickoff).toLocaleString()}</td>
                <td className="py-2 pr-4">{r.moneylineText ?? '–'}</td>
                <td className="py-2 pr-4">{r.moneylineConf != null ? Math.round(r.moneylineConf*100)+'%' : '–'}</td>
                <td className="py-2 pr-4">{r.spreadText ?? '–'}</td>
                <td className="py-2 pr-4">{r.spreadConf != null ? Math.round(r.spreadConf*100)+'%' : '–'}</td>
                <td className="py-2 pr-4">{r.totalText ?? '–'}</td>
                <td className="py-2 pr-4">{r.totalConf != null ? Math.round(r.totalConf*100)+'%' : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
