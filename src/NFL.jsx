import React, { useEffect, useState } from "react";

function pct(n){ return `${n.toFixed(1)}%`; }

export default function NFL() {
  const [boot, setBoot] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(()=>{
    (async ()=>{
      try {
        // 1) bootstrap pulls current week schedule + depth charts and caches them
        const bootRes = await fetch('/.netlify/functions/nfl-bootstrap');
        const bootJ = await bootRes.json();
        if (!bootJ.ok) throw new Error(bootJ.error || 'bootstrap failed');
        setBoot(bootJ);

        // 2) now build candidates from cached data
        const candRes = await fetch('/.netlify/functions/nfl-td-candidates');
        const candJ = await candRes.json();
        if (!candJ.ok) throw new Error(candJ.error || 'candidates failed');
        setRows(candJ);
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
          Error: {err}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      {boot && (
        <div className="text-sm text-gray-600 mb-4">
          season:{boot.season} • week:{boot.week} • games:{boot.games}
        </div>
      )}

      {!rows && <div>Loading… (bootstrapping week data)</div>}

      {rows && (
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
              {rows.candidates.map((r, i)=>(
                <tr key={i} className="border-b">
                  <td className="py-1 pr-4">{r.player}</td>
                  <td className="py-1 pr-4">{r.team}</td>
                  <td className="py-1 pr-4">{r.pos}</td>
                  <td className="py-1 pr-4">{pct(r.modelTdPct)}</td>
                  <td className="py-1 pr-4">{pct(r.rzPath)}</td>
                  <td className="py-1 pr-4">{pct(r.expPath)}</td>
                  <td className="py-1 pr-4">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
