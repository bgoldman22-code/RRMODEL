// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from 'react';

const endpoint = '/.netlify/functions/nfl-predictions-generate';

function fmtPrice(p){
  if (p === null || p === undefined) return '-';
  return p > 0 ? `(${p})` : `(${p})`;
}
function fmtConf(c){
  if (c === null || c === undefined) return '-';
  return `${Math.round(c*100)}%`;
}

export default function NFLPredictionsPage(){
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async(force=false)=>{
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${endpoint}${force ? '?force=true':''}`);
      const json = await res.json();
      setRows(json.rows || []);
    } catch (e){
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ load(false); },[]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">NFL Predictions</h1>
        <button onClick={()=>load(true)} className="px-3 py-2 rounded-lg bg-black text-white">Generate New Predictions</button>
      </div>
      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full border divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matchup</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kickoff</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Moneyline</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conf</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spread</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conf</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conf</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.map((r)=>{
                const ml = r.moneyline || {};
                const sp = r.spread || {};
                const tt = r.total || {};
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{r.matchup || `${r.awayTeam} @ ${r.homeTeam}`}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.kickoff).toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ml.pick ? `${ml.pick} ${fmtPrice(ml.price)}` : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtConf(ml.confidence)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{sp.pick ? `${sp.pick} ${fmtPrice(sp.price)}` : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtConf(sp.confidence)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tt.pick ? `${tt.pick}` : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtConf(tt.confidence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
