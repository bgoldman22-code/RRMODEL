// src/HRR.jsx
import React, { useEffect, useState } from "react";
import DiagDots from "./components/DiagDots.jsx";

export default function HRR() {
  const [date] = useState(() => new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ data: "...", odds: "...", provider: "", usingOddsApi: false });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/.netlify/functions/hrr-slate?date=${date}`);
        const j = await res.json();
        setRows(j.players || []);
        setMeta(j.meta || {
          data: j.ok ? "ok" : "...",
          odds: (j.ok && (j.offers||0) > 0) ? "ok" : "...",
          provider: j.provider || (j.meta && j.meta.provider) || "",
          usingOddsApi: j.usingOddsApi || (j.meta && j.meta.usingOddsApi) || false
        });
      } catch(e) {
        setMeta((m)=>({...m, data: "error"}));
      }
    })();
  }, [date]);

  const primary = [
    { key: "stats",  label: "MLB StatsAPI (schedule)", url: "/.netlify/functions/mlb-game-context?date="+date },
    { key: "odds",   label: "OddsAPI MLB props",       url: "/.netlify/functions/odds-hrr?date="+date },
    { key: "oddsd",  label: "OddsAPI diagnostics",     url: "/.netlify/functions/odds-diag" },
    { key: "hrrd",   label: "HRR diagnostics",         url: "/.netlify/functions/hrr-diag" },
  ];

  const secondary = [
    { key: "learn",  label: "MLB Daily Learn fn",      url: "/.netlify/functions/mlb-hr-learn?date="+date },
    { key: "props",  label: "Learning status (props)", url: "/.netlify/functions/props-diagnostics?model=mlb_hr&date="+date },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-1">MLB — HRR (Hits + Runs + RBIs)</h1>
      <div className="text-gray-600 mb-6">
        date: {date} • data: {meta.data} • odds: {meta.odds} — provider: {meta.provider||"—"} — UsingOddsApi: {String(meta.usingOddsApi)}
      </div>

      <Section title="Pure Probability — Top 10" rows={rows && rows.topProb} />
      <Section title="Pure EV — Top 10" rows={rows && rows.topEv} />

      <DiagDots primary={primary} secondary={secondary} />
    </div>
  );
}

function Section({ title, rows }) {
  const list = rows || [];
  return (
    <div className="mb-8">
      <div className="text-xl font-semibold mb-2">{title}</div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-3 py-2 text-left">Model Prob</th>
              <th className="px-3 py-2 text-left">Model Odds</th>
              <th className="px-3 py-2 text-left">Real Odds</th>
              <th className="px-3 py-2 text-left">EV (1u)</th>
              <th className="px-3 py-2 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r,i)=> (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.player}</td>
                <td className="px-3 py-2">{r.team||""}</td>
                <td className="px-3 py-2">{r.game||""}</td>
                <td className="px-3 py-2">{r.modelProb!=null ? (r.modelProb*100).toFixed(1)+'%' : '—'}</td>
                <td className="px-3 py-2">{r.modelOdds ?? '—'}</td>
                <td className="px-3 py-2">{r.realOdds ?? '—'}</td>
                <td className="px-3 py-2">{r.ev1u!=null ? r.ev1u.toFixed(3) : '—'}</td>
                <td className="px-3 py-2">{r.why || ''}</td>
              </tr>
            ))}
            {list.length===0 && <tr><td colSpan={8} className="px-3 py-4 text-gray-400">No rows</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
