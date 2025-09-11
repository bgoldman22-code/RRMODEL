// src/pages/NFLPredictions.jsx
import React, { useEffect, useMemo, useState } from "react";

const fmtPct = (x) => x == null ? "—" : (x*100).toFixed(1) + "%";
const localTime = (iso) => new Date(iso).toLocaleString();

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const secret = ""; // you can leave blank; page buttons will prompt

  async function load() {
    const r = await fetch("/.netlify/functions/nfl-predictions-get").then(r=>r.json());
    setRows(r?.rows || []);
    setUpdated(r?.updated || null);
    const m = await fetch("/.netlify/functions/nfl-predictions-meta").then(r=>r.json()).catch(()=>null);
    setMeta(m?.meta || null);
  }

  useEffect(() => { load(); }, []);

  async function postAction(fn) {
    const key = secret || window.prompt("Enter TRAIN_SECRET to run:") || "";
    if (!key) return;
    setBusy(true);
    try {
      const u = `/.netlify/functions/${fn}?key=${encodeURIComponent(key)}`;
      const res = await fetch(u).then(r=>r.json());
      if (!res?.ok) throw new Error(res?.error || "failed");
      await load();
      alert(`${fn} ok`);
    } catch (e) {
      alert(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">NFL Predictions</h1>
      <p className="text-sm opacity-70">
        Updated: {updated ? localTime(updated) : "—"}
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Kickoff (Local)</th>
              <th className="p-2 text-left">Matchup</th>
              <th className="p-2 text-left">Moneyline, Spread, Total Lines</th>
              <th className="p-2 text-left">Moneyline Pick</th>
              <th className="p-2 text-left">Spread Pick</th>
              <th className="p-2 text-left">O/U Pick</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const ml = `Home ${g.ml_home_best ?? "—"} / Away ${g.ml_away_best ?? "—"}`;
              const sp = `${g.spread_team ?? "—"} ${g.spread_line ?? "—"}`;
              const tot = `${g.total_side ?? "—"} ${g.total_line ?? "—"}`;
              const pickML = g.pick?.type==="moneyline" ? `${g.pick.team} (${fmtPct(g.pick.confidence)})` : "—";
              const pickSP = g.pick?.type==="spread"    ? `${g.pick.team} ${g.pick.line ?? ""} (${fmtPct(g.pick.confidence)})` : "—";
              const pickOU = g.pick?.type==="total"     ? `${g.pick.side} ${g.pick.line} (${fmtPct(g.pick.confidence)})` : "—";
              return (
                <tr key={g.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{localTime(g.kickoff)}</td>
                  <td className="p-2">{g.matchup}</td>
                  <td className="p-2">
                    <div>ML: {ml}</div>
                    <div>Spread: {sp}</div>
                    <div>Total: {tot}</div>
                  </td>
                  <td className="p-2">{pickML}</td>
                  <td className="p-2">{pickSP}</td>
                  <td className="p-2">{pickOU}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Parlay recommendations (simple groups derived from current picks) */}
      <Parlays rows={rows} />

      {/* Actions + Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button disabled={busy} onClick={() => postAction("nfl-predictions-train")} className="bg-green-600 text-white rounded px-3 py-2 font-semibold">
          {busy ? "Working…" : "Train Now"}
        </button>
        <button disabled={busy} onClick={() => postAction("nfl-predictions-score")} className="bg-green-600 text-white rounded px-3 py-2 font-semibold">
          {busy ? "Working…" : "Score Now"}
        </button>
        <div className="border rounded p-3">
          <div className="font-semibold mb-1">Model Diagnostics</div>
          <div className="text-sm">Last Train: {meta?.train?.ts ? localTime(meta.train.ts) : "—"}</div>
          <div className="text-sm">Samples: {meta?.train?.samples ?? "—"}</div>
          <div className="text-sm">Last Score: {meta?.score?.ts ? localTime(meta.score.ts) : "—"}</div>
        </div>
      </div>
    </div>
  );
}

function Parlays({ rows }) {
  // Simple strategy: use top-confidence moneyline picks first, then O/U
  const ml = rows.filter(r => r.pick?.type === "moneyline").sort((a,b) => (b.pick.confidence||0) - (a.pick.confidence||0));
  const ou = rows.filter(r => r.pick?.type === "total").sort((a,b) => (b.pick.confidence||0) - (a.pick.confidence||0));

  const threeLegs = [...ml.slice(0,2), ...ou.slice(0,1)].slice(0,3);
  const fiveLegs  = [...ml.slice(0,3), ...ou.slice(0,2)].slice(0,5);

  const render = (legs) => (
    <ul className="list-disc ml-5">
      {legs.map(g => (
        <li key={g.id}>
          {g.matchup}: {g.pick?.type === "moneyline" ? `${g.pick.team} ML` :
            g.pick?.type === "total" ? `${g.total_side} ${g.total_line}` :
            `${g.spread_team} ${g.spread_line}`}{" "}
          ({fmtPct(g.pick?.confidence)})
        </li>
      ))}
    </ul>
  );

  return (
    <div className="border rounded p-3">
      <div className="font-semibold mb-1">Suggested Parlays</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="font-semibold">3-Leg</div>
          {render(threeLegs)}
        </div>
        <div>
          <div className="font-semibold">5-Leg</div>
          {render(fiveLegs)}
        </div>
      </div>
      <div className="text-xs opacity-70 mt-2">
        Note: these are derived from current picks; you can swap legs with alternate lines to adjust EV or confidence.
      </div>
    </div>
  );
}
