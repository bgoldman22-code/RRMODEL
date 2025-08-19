// src/components/MissingOddsTable.jsx
import React from "react";

export default function MissingOddsTable({ missing }) {
  const rows = Array.isArray(missing) ? missing : [];
  if (!rows.length) return null;
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold">Top model picks with missing odds</h3>
      <p className="text-sm text-gray-500 mb-2">
        These players ranked highly in the model but no "batter_home_runs" market was found.
        Name normalization or provider coverage may be the cause.
      </p>
      <div className="overflow-x-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-3 py-2 text-right">Model HR%</th>
              <th className="px-3 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.Player || r.player || "-"}</td>
                <td className="px-3 py-2">{r.Game || r.game || "-"}</td>
                <td className="px-3 py-2 text-right">
                  {typeof r.modelProb === "number" ? `${(r.modelProb*100).toFixed(1)}%` : "-"}
                </td>
                <td className="px-3 py-2 text-gray-600">{r.reason || "no odds found"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}