import React from "react";

function pct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${Math.round(Number(x) * 100)}%`;
}

export default function NFLPredictionsTable({ rows = [] }) {
  if (!rows || rows.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No predictions yet. Click “Generate New Predictions”.</div>;
  }

  return (
    <div className="p-4">
      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Matchup</th>
              <th className="px-3 py-2 font-semibold">Kickoff</th>
              <th className="px-3 py-2 font-semibold">Moneyline</th>
              <th className="px-3 py-2 font-semibold">Conf.</th>
              <th className="px-3 py-2 font-semibold">Spread</th>
              <th className="px-3 py-2 font-semibold">Conf.</th>
              <th className="px-3 py-2 font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const kickoff = r.kickoff ? new Date(r.kickoff).toLocaleString() : "—";
              const ml = r.mlPick ? `moneyline: ${r.mlPick}` : "—";
              const sp = r.spreadPick ?? "—";
              const tot = r.totalPick ?? "—";
              return (
                <tr key={r.id || r.matchup}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.matchup}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{kickoff}</td>
                  <td className="px-3 py-2">{ml}</td>
                  <td className="px-3 py-2">{pct(r.mlConfidence)}</td>
                  <td className="px-3 py-2">{sp}</td>
                  <td className="px-3 py-2">{pct(r.spreadConfidence)}</td>
                  <td className="px-3 py-2">{tot}</td>
                  <td className="px-3 py-2">{pct(r.totalConfidence)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
