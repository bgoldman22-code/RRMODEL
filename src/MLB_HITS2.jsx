// src/MLB_HITS2.jsx
import React, { useEffect, useState } from "react";
import DiagDots from "./components/DiagDots.jsx";

export default function MLB_HITS2() {
  const [date] = useState(() => new Date().toISOString().slice(0,10));
  const [slate, setSlate] = useState({ players: [], meta: {} });

  useEffect(() => {
    (async () => {
      const res = await fetch(`/.netlify/functions/hits2-slate?date=${date}`);
      const j = await res.json();
      setSlate(j);
    })();
  }, [date]);

  const m = slate.meta || {};
  const header = `date: ${date} • data: ${m.data || (slate.ok?'ok':'...')} • odds: ${m.odds || ((slate.offers||0)>0?'ok':'...')} — provider: ${m.provider || slate.provider || 'theoddsapi'} — UsingOddsApi: ${String(m.usingOddsApi ?? slate.usingOddsApi ?? false)}${m.model? ' • model: '+m.model : ''}`;

  const primary = [
    { key: "stats",  label: "MLB StatsAPI (schedule)", url: "/.netlify/functions/mlb-game-context?date="+date },
    { key: "odds",   label: "OddsAPI MLB props",       url: "/.netlify/functions/odds-hits2?date="+date },
    { key: "oddsd",  label: "OddsAPI diagnostics",     url: "/.netlify/functions/odds-diag" },
    { key: "h2d",    label: "2+ Hits diagnostics",     url: "/.netlify/functions/hits2-diag" },
  ];

  const secondary = [
    { key: "learn",  label: "MLB Daily Learn fn",      url: "/.netlify/functions/mlb-hr-learn?date="+date },
    { key: "props",  label: "Learning status (props)", url: "/.netlify/functions/props-diagnostics?model=mlb_hits2&date="+date },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-1">MLB — 2+ Hits</h1>
      <div className="text-gray-600 mb-6">{header}</div>

      <Section title="Pure Probability — Top 10" rows={(slate.players && slate.players.topProb) || []} />
      <Section title="Pure EV — Top 10" rows={(slate.players && slate.players.topEv) || []} />

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
