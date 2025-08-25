// src/NFL.jsx
import React, { useEffect, useState } from "react";

function pct(x){ return `${Number(x).toFixed(1)}%`; }

export default function NFL() {
  const [stage, setStage] = useState("bootstrapping");
  const [error, setError] = useState("");
  const [diag, setDiag] = useState(null);
  const [data, setData] = useState(null);

  useEffect(()=>{
    (async ()=>{
      try {
        setStage("bootstrapping");
        // light-touch bootstrap to ensure schedule present; we don't depend on its side effects
        const b = await (await fetch("/.netlify/functions/nfl-bootstrap?season=2025&week=1")).json().catch(()=>null);
        setDiag({ bootstrap: b });
        // now build candidates (it will self-heal if cache missing)
        const c = await (await fetch("/.netlify/functions/nfl-td-candidates?debug=1")).json();
        if (!c.ok) throw new Error(c.error || "candidates failed");
        setData(c);
        setStage("done");
      } catch (e) {
        setError(String(e));
        setStage("error");
      }
    })();
  }, []);

  if (stage !== "done") {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <div className="text-sm text-gray-600">status: {stage}</div>
        {error && <div className="mt-2 p-3 border bg-red-50 text-sm">Error: {error}</div>}
        {diag && <pre className="mt-3 text-xs max-h-[50vh] overflow-auto bg-gray-50 border p-2">{JSON.stringify(diag, null, 2)}</pre>}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      <div className="text-sm text-gray-600 mb-3">
        season:{data.season} • week:{data.week} • games:{data.games} • candidates:{data.candidates.length}
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="py-2 pr-4">Player</th>
            <th className="py-2 pr-4">Team</th>
            <th className="py-2 pr-4">Pos</th>
            <th className="py-2 pr-4">Model TD%</th>
            <th className="py-2 pr-4">RZ path</th>
            <th className="py-2 pr-4">EXP path</th>
            <th className="py-2 pr-4">Why</th>
          </tr></thead>
          <tbody>
            {data.candidates.map((r, i)=> (
              <tr key={i} className="border-b">
                <td className="py-1 pr-4">{r.player}</td>
                <td className="py-1 pr-4">{r.teamId}</td>
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
    </div>
  );
}
