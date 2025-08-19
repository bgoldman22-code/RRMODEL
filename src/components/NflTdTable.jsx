import React from "react";

export default function NflTdTable({ data }) {
  if (!data || !data.props || data.props.length === 0) {
    return <div>No props available yet.</div>;
  }

  return (
    <table className="min-w-full border">
      <thead>
        <tr className="bg-gray-200">
          <th className="px-2 py-1 border">Player</th>
          <th className="px-2 py-1 border">Game</th>
          <th className="px-2 py-1 border">Model TD%</th>
          <th className="px-2 py-1 border">Model Odds</th>
          <th className="px-2 py-1 border">Actual Odds</th>
          <th className="px-2 py-1 border">EV</th>
          <th className="px-2 py-1 border">Why</th>
        </tr>
      </thead>
      <tbody>
        {data.props.map((row, idx) => (
          <tr key={idx} className="border-t">
            <td className="px-2 py-1 border">{row.player}</td>
            <td className="px-2 py-1 border">{row.game}</td>
            <td className="px-2 py-1 border">{row.modelProb ? (row.modelProb*100).toFixed(1)+"%" : ""}</td>
            <td className="px-2 py-1 border">{row.modelOdds}</td>
            <td className="px-2 py-1 border">{row.actualOdds}</td>
            <td className="px-2 py-1 border">{row.ev}</td>
            <td className="px-2 py-1 border">{row.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
