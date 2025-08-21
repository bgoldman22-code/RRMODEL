// src/NFL.jsx
import React, { useEffect, useMemo, useState } from "react";
import tdEngine from "./nfl/tdEngine-default-shim.js";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule";
import NflTdExplainer from "./components/NflTdExplainer";

function fmtPct(v) {
  if (typeof v === "number") {
    if (v > 0 && v <= 1) return (v * 100).toFixed(1) + "%";
    if (v > 1 && v <= 100) return v.toFixed(1) + "%";
  }
  if (typeof v === "string") return v;
  return "-";
}

async function fetchDepthCharts() {
  try {
    const res = await fetch("/.netlify/functions/nfl-rosters-get");
    const j = await res.json();
    if (j?.ok && j.depthCharts) return j.depthCharts;
  } catch {}
  return null;
}

export default function NFL() {
  const weeksAvailable = getWeeksAvailable();
  const [week, setWeek] = useState(1);
  const [candidates, setCandidates] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);

  const games = useMemo(() => getGamesForWeek(week), [week]);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      let rows = [];
      let diag = {};

      // Load depth charts from Blobs
      const depthCharts = await fetchDepthCharts();
      if (!depthCharts) {
        diag = { ...diag, rosters:"missing" };
      } else {
        diag = { ...diag, rosters:"ok" };
      }

      // Try engine (model-only)
      try {
        const res = await tdEngine(games, { week, requireOdds:false, depthCharts });
        rows = Array.isArray(res?.candidates) ? res.candidates : Array.isArray(res) ? res : [];
        diag = { ...diag, ...(res?.diagnostics || {}) };
      } catch (e) {
        diag = { ...diag, error: String(e) };
      }

      // Relaxed pass
      if (!rows.length) {
        try {
          const res2 = await tdEngine(games, { week, requireOdds:false, relax:true, depthCharts });
          const rows2 = Array.isArray(res2?.candidates) ? res2.candidates : Array.isArray(res2) ? res2 : [];
          if (rows2.length) {
            rows = rows2;
            diag = { ...diag, retried:true };
          }
        } catch {}
      }

      if (alive) {
        setCandidates(rows);
        setDiagnostics({
          weeksAvailable: weeksAvailable.length,
          games: games.length,
          candidates: rows.length,
          ...(diag || {}),
        });
        setLoading(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [week, games, weeksAvailable.length]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">NFL — Anytime TD</h1>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="week" className="text-sm">Week:</label>
        <select
          id="week"
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          className="border p-1 text-sm"
        >
          {weeksAvailable.map((w) => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
        {loading && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      {diagnostics && (
        <p className="mt-2 text-xs text-gray-600">
          data (last 3 yrs): ok • diagnostics — weeks:{diagnostics.weeksAvailable} games:{diagnostics.games} candidates:{diagnostics.candidates}
          {diagnostics.rosters ? ` • rosters:${diagnostics.rosters}` : ""}
          {diagnostics.retried ? " • retried" : ""}
          {diagnostics.error ? ` • error:${diagnostics.error}` : ""}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="table-auto border-collapse border border-gray-400 text-xs min-w-full">
          <thead>
            <tr>
              <th className="border px-2 py-1 text-left">Player</th>
              <th className="border px-2 py-1 text-left">Team</th>
              <th className="border px-2 py-1 text-left">Game</th>
              <th className="border px-2 py-1 text-right">Model TD%</th>
              <th className="border px-2 py-1 text-right">RZ path</th>
              <th className="border px-2 py-1 text-right">EXP path</th>
              <th className="border px-2 py-1 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td className="border px-2 py-2 text-center" colSpan={7}>
                  No candidates yet.
                </td>
              </tr>
            ) : (
              candidates.map((c, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{c.player || c.name || "-"}</td>
                  <td className="border px-2 py-1">{c.team || "-"}</td>
                  <td className="border px-2 py-1">{c.game || c.matchup || "-"}</td>
                  <td className="border px-2 py-1 text-right">{fmtPct(c.modelTdPct ?? c.modelTd ?? c.p)}</td>
                  <td className="border px-2 py-1 text-right">{fmtPct(c.rzPath)}</td>
                  <td className="border px-2 py-1 text-right">{fmtPct(c.expPath)}</td>
                  <td className="border px-2 py-1">{c.why || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <NflTdExplainer />
      </div>
    </div>
  );
}
