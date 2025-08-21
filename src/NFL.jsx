// src/NFL.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ENABLE_NFL_TD } from "./config/features.js";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule.js";
import NflTdExplainer from "./components/NflTdExplainer.jsx";
import tdEngine from "./nfl/tdEngine.js"; // ensure correct casing + extension

export default function NFL() {
  if (!ENABLE_NFL_TD) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
        <p className="opacity-70 text-sm">This feature is currently disabled.</p>
      </div>
    );
  }

  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(weeks[0] ?? 1);

  const games = useMemo(() => getGamesForWeek(week), [week]);
  const candidates = useMemo(() => tdEngine(games), [games]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-70">Week:</label>
          <select
            className="border rounded px-2 py-1"
            value={week}
            onChange={(e) => setWeek(parseInt(e.target.value, 10))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm opacity-70 mb-4">Using OddsAPI: no • data (last 3 yrs): ok</p>

      {/* Top candidates table (placeholder if engine returns empty) */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Game</th>
              <th className="py-2 pr-3">Model TD%</th>
              <th className="py-2 pr-3">RZ path</th>
              <th className="py-2 pr-3">EXP path</th>
              <th className="py-2 pr-3">Why</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr><td className="py-2 pr-3" colSpan="7">No candidates yet.</td></tr>
            ) : (
              candidates.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-3">{c.player}</td>
                  <td className="py-1 pr-3">{c.team}</td>
                  <td className="py-1 pr-3">{c.game}</td>
                  <td className="py-1 pr-3">{(c.model_td_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{(c.rz_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{(c.exp_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{c.why}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NflTdExplainer />
    </div>
  );
}
