// src/pages/NFLPredictions.jsx
import React, { useEffect, useState } from "react";

function pct(n){ if(!n && n!==0) return "—"; return (n*100).toFixed(1) + "%"; }
function cls(...a){ return a.filter(Boolean).join(" "); }

export default function NFLPredictions(){
  const [rows, setRows] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function load(){
    const r = await fetch("/.netlify/functions/nfl-predictions-get");
    const j = await r.json();
    setRows(j.rows || []);
    setUpdated(j.updated || null);
  }

  async function generate(){
    setLoading(true); setMsg("Generating…");
    try{
      const r = await fetch("/.netlify/functions/nfl-predictions-generate?open=1");
      const j = await r.json().catch(()=>({ok:false}));
      if(j?.ok){ setMsg("Generated. Refreshing…"); await load(); }
      else { setMsg("Failed to generate — check logs"); }
    } catch(e){ setMsg("Error: " + String(e)); }
    setLoading(false);
  }

  useEffect(()=>{ load(); },[]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">NFL Predictions</h1>
        <div className="flex gap-2">
          <button onClick={generate} disabled={loading} className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            {loading ? "Working…" : "▶ Generate"}
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">Latest model picks with moneyline, spread and total lines. {updated ? `Updated: ${new Date(updated).toLocaleString()}` : ""}</p>
      {msg && <div className="mb-3 text-sm">{msg}</div>}
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="p-2 text-left">Kickoff (Local)</th>
              <th className="p-2 text-left">Matchup</th>
              <th className="p-2 text-left">Lines</th>
              <th className="p-2 text-left">ML Pick</th>
              <th className="p-2 text-left">Spread Pick</th>
              <th className="p-2 text-left">O/U Pick</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-gray-500">No predictions found. Click <b>Generate</b>.</td></tr>
            )}
            {rows.map((r)=>{
              const dt = r.kickoff ? new Date(r.kickoff) : null;
              const k = dt ? dt.toLocaleString() : "—";
              const lines = (
                <div className="space-y-1">
                  <div className="font-medium">ML: <span className="text-gray-800">home {r.ml_home_best ?? "—"} / away {r.ml_away_best ?? "—"}</span></div>
                  <div>Spread: <span className="text-gray-800">{r.spread_team ?? "—"} {r.spread_line ?? ""}</span></div>
                  <div>Total: <span className="text-gray-800">{r.total_side ?? "—"} {r.total_line ?? ""}</span></div>
                </div>
              );
              const ml = r.pick?.type === "moneyline" ? r.pick : null;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{k}</td>
                  <td className="p-2">{r.matchup}</td>
                  <td className="p-2">{lines}</td>
                  <td className="p-2">{ml ? (<span className="inline-flex items-center gap-2">{ml.team}<span className="inline-block w-24 h-2 bg-gray-200 rounded"><span className="block h-2 bg-green-500 rounded" style={{width: `${Math.round((ml.confidence||0)*100)}%`}}></span></span><span className="text-gray-600">{pct(ml.confidence)}</span></span>) : "—"}</td>
                  <td className="p-2">{r.spread_team ? `${r.spread_team} ${r.spread_line ?? ""}` : "—"}</td>
                  <td className="p-2">{r.total_side ? `${r.total_side} ${r.total_line ?? ""}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
