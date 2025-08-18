import React, { useEffect, useState } from "react";

/**
 * TopHRLeaders
 * Auto-loads Top 50 HR leaders from /.netlify/functions/hr-leaders
 * and renders a compact table matching your existing style.
 *
 * Props:
 *  - season?: number (defaults to current year)
 *  - onLoaded?: (names: string[]) => void // optional callback; we also return array of names you can pass to MissingOddsTable
 */
export default function TopHRLeaders({ season, onLoaded }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const s = season || new Date().getFullYear();
    const u = `/.netlify/functions/hr-leaders?season=${s}`;
    fetch(u)
      .then(r => r.json())
      .then(j => {
        if (!j?.ok) throw new Error(j?.error || "leaders fetch failed");
        const names = (j.leaders || []).map(x => x.name).filter(Boolean);
        setRows(j.leaders || []);
        if (typeof onLoaded === "function") onLoaded(names);
      })
      .catch(e => setErr(e.message || String(e)));
  }, [season]);

  if (err) {
    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">Top 50 HR Leaders</h3>
        <div className="text-sm text-red-600">Error: {err}</div>
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-2">Top 50 HR Leaders</h3>
      <div className="overflow-x-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Rank</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-right">HR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.id || r.name}-${idx}`} className={idx % 2 ? "bg-white" : "bg-gray-50/40"}>
                <td className="px-3 py-2">{r.rank || idx + 1}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.team}</td>
                <td className="px-3 py-2 text-right">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
