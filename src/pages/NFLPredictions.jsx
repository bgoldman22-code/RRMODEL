import React, { useEffect, useState } from "react";
import NFLPredictionsActions from "@/components/NFLPredictionsActions";

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/.netlify/functions/nfl-predictions-get")
      .then(r => r.json())
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">NFL Predictions</h1>
      <NFLPredictionsActions />
      <table className="min-w-full border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-2 py-1 border">Kickoff</th>
            <th className="px-2 py-1 border">Matchup</th>
            <th className="px-2 py-1 border">Moneyline</th>
            <th className="px-2 py-1 border">Spread</th>
            <th className="px-2 py-1 border">Total</th>
            <th className="px-2 py-1 border">Pick</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="text-center">
              <td className="border px-2 py-1">{r.kickoff || "-"}</td>
              <td className="border px-2 py-1">{r.matchup || "-"}</td>
              <td className="border px-2 py-1">{r.ml_home_best}/{r.ml_away_best}</td>
              <td className="border px-2 py-1">{r.spread_team} {r.spread_line}</td>
              <td className="border px-2 py-1">{r.total_side} {r.total_line}</td>
              <td className="border px-2 py-1">
                {r.pick?.type} {r.pick?.team || r.pick?.side || ""} ({(r.pick?.confidence*100).toFixed(1)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
