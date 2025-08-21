// src/NFL.jsx
import React, { useMemo, useState, useEffect } from "react";
import { ENABLE_NFL_TD } from "./config/features";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule";
import tdEngine from "./nfl/tdEngine.js";
import { fetchNflOdds } from "./nfl/oddsClient.js";

function americanToDecimal(american) {
  if (american == null) return null;
  const a = Number(american);
  if (!isFinite(a)) return null;
  if (a > 0) return 1 + a / 100;
  return 1 + 100 / Math.abs(a);
}
function impliedFromAmerican(american){
  const a = Number(american);
  if (!isFinite(a)) return null;
  if (a > 0) return 100 / (a + 100);
  return Math.abs(a) / (Math.abs(a) + 100);
}
function evOneUnit(p, american){
  const dec = americanToDecimal(american);
  if (!dec || p == null) return null;
  return p * (dec - 1) - (1 - p);
}

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
  const games = useMemo(() => getGamesForWeek(week), [week]);

  // Odds
  const [odds, setOdds] = useState({ usingOddsApi: false, offers: [], count: 0 });
  useEffect(() => {
    let alive = true;
    fetchNflOdds({ week }).then(d => { if (alive) setOdds(d || { usingOddsApi:false, offers:[], count:0 }); });
    return () => { alive = false; };
  }, [week]);

  const candidates = useMemo(
    () => tdEngine(games, { offers: odds.offers || [] }),
    [games, odds.offers]
  );

  console.log("[NFL TD diagnostics]", { weeksAvailable: weeks.length, selectedWeek: week, games: games.length, usingOddsApi: odds.usingOddsApi, offers: odds.offers?.length ?? 0, engineCandidates: candidates.length });

  // Build a fast name->offer map (case-insensitive)
  const offerMap = useMemo(() => {
    const m = new Map();
    for (const o of odds.offers || []) {
      if (!o?.player) continue;
      m.set(o.player.toLowerCase(), o);
    }
    return m;
  }, [odds.offers]);

  function findOfferFor(name){
    if (!name) return null;
    const key = name.toLowerCase();
    if (offerMap.has(key)) return offerMap.get(key);
    // fallback: try last name
    const parts = key.split(" ");
    const last = parts[parts.length-1];
    for (const [k, v] of offerMap.entries()){
      if (k.endsWith(" " + last) || k === last) return v;
    }
    return null;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
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

      <p className="text-sm opacity-70 mb-1">Using OddsAPI: {odds.usingOddsApi ? 'yes' : 'no'} • offers: {odds.count ?? (odds.offers?.length ?? 0)}</p>
      <p className="text-xs opacity-60 mb-4">data (last 3 yrs): ok • diagnostics — weeks:{weeks.length} games:{games.length} candidates:{candidates.length}</p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Game</th>
              <th className="py-2 pr-3">Model TD%</th>
              <th className="py-2 pr-3">Odds</th>
              <th className="py-2 pr-3">EV (1u)</th>
              <th className="py-2 pr-3">RZ path</th>
              <th className="py-2 pr-3">EXP path</th>
              <th className="py-2 pr-3">Why</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && (
              <tr><td colSpan="9" className="py-4 text-center opacity-70">No candidates yet.</td></tr>
            )}
            {candidates.map((c, i) => {
              const offer = findOfferFor(c.player);
              const american = offer?.american ?? null;
              const ev = evOneUnit(c.model_td_pct, american);
              return (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-3">{c.player}</td>
                  <td className="py-1 pr-3">{c.team}</td>
                  <td className="py-1 pr-3">{c.game}</td>
                  <td className="py-1 pr-3">{(c.model_td_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{american ?? '—'}</td>
                  <td className="py-1 pr-3">{ev == null ? '—' : ev.toFixed(3)}</td>
                  <td className="py-1 pr-3">{(c.rz_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{(c.exp_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{c.why}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
