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
  const [offers, setOffers] = useState([]);
  const [usingOddsApi, setUsingOddsApi] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const weeksAvailable = getWeeksAvailable();
      const games = getGamesForWeek(week);
      try {
        const odds = await fetchNflOdds(week);
        if (alive) {
          setOffers(odds?.offers || []);
          setUsingOddsApi(!!odds?.usingOddsApi);
        }
      } catch {
        if (alive) {
          setOffers([]);
          setUsingOddsApi(false);
        }
      }
      try {
        const { candidates: rows, diagnostics: diag } = await tdEngine(games, {
          week,
          offers,
          requireOdds: false,
        });
        if (alive) {
          setCandidates(rows || []);
          setDiagnostics({
            ...(diag || {}),
            weeksAvailable: weeksAvailable.length,
            games: games.length,
            offers: (odds?.offers?.length) || 0,
            usingOddsApi
          });
        }
      } catch (e) {
        console.warn("tdEngine shim error:", e);
        if (alive) {
          setCandidates([]);
          setDiagnostics({
            weeksAvailable: weeksAvailable.length,
            games: games.length,
            offers: 0,
            usingOddsApi
          });
        }
      }
    })();
    return () => { alive = false; };
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
          Using OddsAPI: {usingOddsApi ? "yes" : "no"} • offers: {offers.length}
          <br />
          data (last 3 yrs): ok • diagnostics — weeks:{diagnostics.weeksAvailable} games:{diagnostics.games} candidates:{candidates.length}
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
              <th className="border px-2 py-1 text-right">Odds</th>
              <th className="border px-2 py-1 text-right">EV (1u)</th>
              <th className="border px-2 py-1 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr><td className="border px-2 py-2 text-center" colSpan={9}>No candidates yet.</td></tr>
            ) : (
              candidates.map((c, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{c.player}</td>
                  <td className="border px-2 py-1">{c.team}</td>
                  <td className="border px-2 py-1">{c.game}</td>
                  <td className="border px-2 py-1 text-right">{c.modelTdPct || "-"}</td>
                  <td className="border px-2 py-1 text-right">{c.rzPath ?? "-"}</td>
                  <td className="border px-2 py-1 text-right">{c.expPath ?? "-"}</td>
                  <td className="border px-2 py-1 text-right">{c.oddsAmerican ?? "-"}</td>
                  <td className="border px-2 py-1 text-right">{typeof c.ev1u === "number" ? c.ev1u.toFixed(3) : "-"}</td>
                  <td className="border px-2 py-1">{c.why || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4"><NflTdExplainer /></div>
    </div>
  );
}
