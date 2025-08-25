// src/NFL.jsx
import React, { useEffect, useState } from "react";

function pct(n){ return `${Number(n).toFixed(1)}%`; }

export default function NFL() {
  const [stage, setStage] = useState("bootstrapping");
  const [diag, setDiag] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(()=>{
    (async ()=>{
      try {
        // 1) Bootstrap (detect week, fetch schedule + depth, cache)
        setStage("bootstrapping");
        const b = await (await fetch("/.netlify/functions/nfl-bootstrap?refresh=1")).json();
        setDiag(b);
        if (!b.ok) throw new Error(b.error || "bootstrap failed");

        // 2) Build candidates from cache
        setStage("building");
        const c = await (await fetch(`/.netlify/functions/nfl-td-candidates?season=${b.season}&week=${b.week}`)).json();
        if (!c.ok) throw new Error(c.error || "candidates failed");
        setData(c);
        setStage("done");
      } catch (e) {
        setErr(String(e));
        setStage("error");
      }
    })();
  }, []);

  if (stage !== "done") {
    return (
      <div className="p-4 max-w-6xl mx-auto space-y-3">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <div className="text-sm text-gray-600">status: {stage}</div>
        {err && (
          <div className="rounded border p-3 text-sm bg-red-50">
            Error: {err}
            {diag && <pre className="mt-2 text-xs overflow-auto max-h-[40vh] border p-2 bg-white">{JSON.stringify(diag, null, 2)}</pre>}
          </div>
        )}
        {!err && diag && (
          <pre className="text-xs overflow-auto max-h-[40vh] border p-2 bg-gray-50">{JSON.stringify(diag, null, 2)}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      <div className="text-sm text-gray-600 mb-4">
        season:{data.season} • week:{data.week} • games:{data.games} • candidates:{data.candidates.length}
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">TeamId</th>
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
