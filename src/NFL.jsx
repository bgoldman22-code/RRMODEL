// src/NFL.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ENABLE_NFL_TD } from "./config/features";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule";
import NflTdExplainer from "./components/NflTdExplainer";
import tdEngine from "./nfl/tdEngine.js";
import { fetchNflOdds } from "./nfl/oddsClient.js";

export default function NFL() {
  if (!ENABLE_NFL_TD) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
        <p className="opacity-70 text-sm">This feature is currently disabled.</p>
      </div>
    );
  }

  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(weeks[0] ?? 1);

  // Keep week in range if weeks list changes
  useEffect(() => {
    if (weeks.length && !weeks.includes(week)) {
      setWeek(weeks[0]);
    }
  }, [weeks]);

  const games = useMemo(() => getGamesForWeek(week), [week]);

  const [odds, setOdds] = useState({ usingOddsApi: false, offers: [], count: 0 });
  useEffect(() => {
    let alive = true;
    fetchNflOdds({ week })
      .then(d => { if (alive) setOdds(d || { usingOddsApi: false, offers: [], count: 0 }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [week]);

  // Compute candidates; engine should not require odds to exist
  const candidates = useMemo(() => {
    try {
      const list = tdEngine(games, { offers: odds.offers || [], usingOdds: !!odds.usingOddsApi }) || [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error("tdEngine error:", e);
      return [];
    }
  }, [games, odds.offers, odds.usingOddsApi]);

  const diag = {
    weeksAvailable: weeks.length,
    selectedWeek: week,
    games: games?.length || 0,
    usingOddsApi: odds.usingOddsApi,
    offers: odds.count ?? (odds.offers?.length ?? 0),
    engineCandidates: candidates.length,
  };
  console.log("[NFL TD diagnostics]", diag);

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
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm opacity-70 mb-2">
        Using OddsAPI: {odds.usingOddsApi ? 'yes' : 'no'} • offers: {diag.offers}
        {odds.error ? ` • ${odds.error}` : ''}
      </p>
      <p className="text-xs opacity-60 mb-4">
        data (last 3 yrs): ok • diagnostics — weeks:{diag.weeksAvailable} games:{diag.games} candidates:{diag.engineCandidates}
      </p>

      {diag.games === 0 ? (
        <div className="text-sm opacity-70">No games for Week {week} in local schedule.</div>
      ) : candidates.length === 0 ? (
        <div className="text-sm opacity-70">No candidates yet (engine returned 0). Check console for diagnostics.</div>
      ) : (
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
              {candidates.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-3">{c.player}</td>
                  <td className="py-1 pr-3">{c.team}</td>
                  <td className="py-1 pr-3">{c.game}</td>
                  <td className="py-1 pr-3">{(c.model_td_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{(c.rz_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{(c.exp_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{c.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NflTdExplainer />
    </div>
  );
}
