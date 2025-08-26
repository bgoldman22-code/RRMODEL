// src/HRR.jsx
import React, { useEffect, useState } from "react";

export default function HRR() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ data:"...", odds:"...", provider:"", usingOddsApi:false });
  const [topProb, setTopProb] = useState([]);
  const [topEv, setTopEv] = useState([]);
  const [parlays, setParlays] = useState({});

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`/.netlify/functions/hrr-slate?date=${date}`);
      const j = await res.json();
      setRows(j.players || []);
      setMeta(j.meta || {});
      setTopProb(j.topProb || []);
      setTopEv(j.topEv || []);
      setParlays(j.parlays || {});
    };
    run();
  }, [date]);

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-1">MLB — HRR (Hits + Runs + RBIs)</h1>
      <div className="text-gray-600 mb-6">
        date: {date} • data: {meta.data} • odds: {meta.odds} — provider: {meta.provider} — UsingOddsApi: {String(meta.usingOddsApi)}
      </div>

      <ParlayTable title="Parlay — 2-leg (EV-first)" parlay={parlays.twoLeg} />
      <ParlayTable title="Parlay — 3-leg (EV-first)" parlay={parlays.threeLeg} />

      <Table title="Pure Probability — Top 10" rows={topProb} />
      <Table title="Pure EV — Top 10 (EV ≥ +0.05)" rows={topEv} />
    </div>
  );
}

function Table({ title, rows }) {
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
            {(rows||[]).map((r,i)=> (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.player}</td>
                <td className="px-3 py-2">{r.team||""}</td>
                <td className="px-3 py-2">{r.game||""}</td>
                <td className="px-3 py-2">{(r.modelProb*100).toFixed(1)}%</td>
                <td className="px-3 py-2">{r.modelOdds}</td>
                <td className="px-3 py-2">{r.realOdds}</td>
                <td className="px-3 py-2">{r.ev1u!=null ? r.ev1u.toFixed(3) : "—"}</td>
                <td className="px-3 py-2">{r.why}</td>
              </tr>
            ))}
            {(!rows || rows.length===0) && (
              <tr><td className="px-3 py-4 text-gray-400" colSpan={8}>No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParlayTable({ title, parlay }) {
  if (!parlay) return null;
  return (
    <div className="mb-8">
      <div className="text-xl font-semibold mb-2">{title}</div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Leg</th>
              <th className="px-3 py-2 text-left">Model Prob</th>
              <th className="px-3 py-2 text-left">Real Odds</th>
            </tr>
          </thead>
          <tbody>
            {(parlay.legs||[]).map((r,i)=> (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.player}</td>
                <td className="px-3 py-2">{(r.modelProb*100).toFixed(1)}%</td>
                <td className="px-3 py-2">{r.realOdds}</td>
              </tr>
            ))}
            <tr className="border-t bg-gray-50">
              <td className="px-3 py-2 font-medium">Parlay Total</td>
              <td className="px-3 py-2">{parlay.prob}%</td>
              <td className="px-3 py-2">{parlay.odds}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-gray-600 mt-2">EV (1u): {parlay.ev}</div>
    </div>
  );
}
