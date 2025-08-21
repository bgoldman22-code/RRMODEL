// src/NFL.jsx
import React, { useEffect, useState } from "react";
import tdEngine from "./nfl/tdEngine-default-shim.js";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule";
import { fetchNflOdds } from "./nfl/oddsClient.js";
import NflTdExplainer from "./components/NflTdExplainer";

export default function NFL() {
  const [week, setWeek] = useState(1);
  const [diagnostics, setDiagnostics] = useState(null);
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    async function run() {
      const weeksAvailable = getWeeksAvailable();
      const games = getGamesForWeek(week);

      const engineResult = tdEngine(games, { week });
      const { candidates: rows = [], diagnostics: diag = {} } = Array.isArray(engineResult)
        ? { candidates: engineResult, diagnostics: {} }
        : (engineResult || {});

      const odds = await fetchNflOdds(week);

      setCandidates(rows);
      setDiagnostics({
        ...diag,
        weeksAvailable: weeksAvailable.length,
        games: games.length,
        offers: odds?.offers?.length || 0,
        usingOddsApi: !!odds?.usingOddsApi,
      });
    }
    run();
  }, [week]);

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
          {getWeeksAvailable().map((w) => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
      </div>

      {diagnostics && (
        <p className="mt-2 text-xs text-gray-600">
          Using OddsAPI: {diagnostics.usingOddsApi ? "yes" : "no"} • offers: {diagnostics.offers}
          <br />
          data (last 3 yrs): ok • diagnostics — weeks:{diagnostics.weeksAvailable} games:{diagnostics.games} candidates:{candidates.length}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="table-auto border-collapse border border-gray-400 text-xs min-w-full">
          <thead>
            <tr>
              <th className="border border-gray-400 px-2 py-1">Player</th>
              <th className="border border-gray-400 px-2 py-1">Team</th>
              <th className="border border-gray-400 px-2 py-1">Game</th>
              <th className="border border-gray-400 px-2 py-1">Model TD%</th>
              <th className="border border-gray-400 px-2 py-1">RZ path</th>
              <th className="border border-gray-400 px-2 py-1">EXP path</th>
              <th className="border border-gray-400 px-2 py-1">Odds</th>
              <th className="border border-gray-400 px-2 py-1">EV (1u)</th>
              <th className="border border-gray-400 px-2 py-1">Why</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td className="border border-gray-400 px-2 py-2 text-center" colSpan={9}>
                  No candidates yet.
                </td>
              </tr>
            ) : (
              candidates.map((c, i) => (
                <tr key={i}>
                  <td className="border border-gray-400 px-2 py-1">{c.player}</td>
                  <td className="border border-gray-400 px-2 py-1">{c.team}</td>
                  <td className="border border-gray-400 px-2 py-1">{c.game}</td>
                  <td className="border border-gray-400 px-2 py-1">{c.modelTdPct}%</td>
                  <td className="border border-gray-400 px-2 py-1">{c.rzPath}%</td>
                  <td className="border border-gray-400 px-2 py-1">{c.expPath}%</td>
                  <td className="border border-gray-400 px-2 py-1">{c.oddsAmerican || "-"}</td>
                  <td className="border border-gray-400 px-2 py-1">{typeof c.ev1u === "number" ? c.ev1u.toFixed(3) : "-"}</td>
                  <td className="border border-gray-400 px-2 py-1">{c.why}</td>
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
