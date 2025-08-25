import React, { useEffect, useState } from "react";

function pct(n){ return `${n.toFixed(1)}%`; }

export default function NFL() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(()=>{
    (async ()=>{
      try {
        const res = await fetch('/.netlify/functions/nfl-td-candidates?week=1');
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || 'failed');
        setData(j);
      } catch(e){
        setErr(String(e));
      }
    })();
  },[]);

  if (err) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
        <div className="rounded border p-3 text-sm">
          Error: {err}. Make sure <code>data/nfl-td/depth-charts.json</code> and <code>data/nfl-td/schedule-week1-2025.json</code> exist in the repo.
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      <div className="text-sm text-gray-600 mb-4">
        week:{data.week} • games:{data.games} • candidates:{data.candidates.length}
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">Team</th>
              <th className="py-2 pr-4">Pos</th>
              <th className="py-2 pr-4">Model TD%</th>
              <th className="py-2 pr-4">RZ path</th>
              <th className="py-2 pr-4">EXP path</th>
              <th className="py-2 pr-4">Why</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((r, i)=>(
              <tr key={i} className="border-b">
                <td className="py-1 pr-4">{r.player}</td>
                <td className="py-1 pr-4">{r.team}</td>
                <td className="py-1 pr-4">{r.position}</td>
                <td className="py-1 pr-4">{pct(r.modelTdPct)}</td>
                <td className="py-1 pr-4">{pct(r.rzPath)}</td>
                <td className="py-1 pr-4">{pct(r.expPath)}</td>
                <td className="py-1 pr-4">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
