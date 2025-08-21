// src/NFL.jsx
import React, { useEffect, useMemo, useState } from "react";
import tdEngine from "./nfl/tdEngine.js";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule";
import { fetchNflOdds } from "./nfl/oddsClient.js";

export default function NFL() {
  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(weeks[0] ?? 1);

  const [odds, setOdds] = useState({ usingOddsApi: false, offers: [], count: 0, error: null });
  const [rosterMeta, setRosterMeta] = useState({ updated_at: null, provider: null, refreshing: false, msg: "" });

  // fetch odds on week change
  useEffect(() => {
    let alive = true;
    fetchNflOdds({ week })
      .then(d => { if (alive) setOdds(d || { usingOddsApi: false, offers: [], count: 0 }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [week]);

  // read roster meta from nfl-data function
  useEffect(() => {
    let alive = true;
    fetch('/.netlify/functions/nfl-data')
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        const meta = j?.data?.["meta-rosters.json"] || {};
        setRosterMeta(m => ({ ...m, updated_at: meta.updated_at || null, provider: meta.provider || null }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [week]);

  // refresh rosters on demand (non-blocking)
  async function refreshRosters() {
    try {
      setRosterMeta(m => ({ ...m, refreshing: true, msg: "Refreshing..." }));
      const res = await fetch("/.netlify/functions/nfl-rosters-run?source=ui");
      const j = await res.json();
      if (j?.ok) {
        // re-fetch meta
        const d = await fetch('/.netlify/functions/nfl-data').then(r => r.json());
        const meta = d?.data?.["meta-rosters.json"] || {};
        setRosterMeta({ updated_at: meta.updated_at || null, provider: meta.provider || null, refreshing: false, msg: "Rosters refreshed" });
      } else {
        setRosterMeta(m => ({ ...m, refreshing: false, msg: "Refresh failed" }));
      }
    } catch {
      setRosterMeta(m => ({ ...m, refreshing: false, msg: "Refresh failed" }));
    } finally {
      setTimeout(() => setRosterMeta(m => ({ ...m, msg: "" })), 2500);
    }
  }

  const games = useMemo(() => getGamesForWeek(week), [week]);
  const candidates = useMemo(() => tdEngine(games, { offers: odds.offers || [], usingOdds: !!odds.usingOddsApi }) || [], [games, odds.offers, odds.usingOddsApi]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-70">Week:</label>
          <select className="border rounded px-2 py-1" value={week} onChange={(e) => setWeek(parseInt(e.target.value, 10))}>
            {weeks.map((w) => (<option key={w} value={w}>Week {w}</option>))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm opacity-70">
          Using OddsAPI: {odds.usingOddsApi ? "yes" : "no"} • offers: {odds.count ?? (odds.offers?.length ?? 0)}{odds.error ? ` • ${odds.error}` : ""}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs opacity-70">
            {rosterMeta.updated_at ? `Rosters updated: ${new Date(rosterMeta.updated_at).toLocaleString()} • provider: ${rosterMeta.provider || "—"}` : "Rosters updated: —"}
            {rosterMeta.msg ? ` • ${rosterMeta.msg}` : ""}
          </p>
          <button onClick={refreshRosters} className="text-xs px-2 py-1 border rounded hover:bg-gray-50" disabled={rosterMeta.refreshing}>
            {rosterMeta.refreshing ? "Refreshing…" : "Refresh rosters"}
          </button>
        </div>
      </div>

      <div className="text-sm opacity-70 mb-4">data (last 3 yrs): ok • diagnostics — weeks:{weeks.length} games:{games.length} candidates:{candidates.length}</div>

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
            {candidates.length === 0 ? (
              <tr><td colSpan={9} className="py-4 opacity-70">No candidates yet.</td></tr>
            ) : (
              candidates.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-3">{c.player}</td>
                  <td className="py-1 pr-3">{c.team}</td>
                  <td className="py-1 pr-3">{c.game}</td>
                  <td className="py-1 pr-3">{(c.model_td_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{c.odds_american ?? "—"}</td>
                  <td className="py-1 pr-3">{(c.ev_1u != null) ? (c.ev_1u >= 0 ? "+" : "") + c.ev_1u.toFixed(2) : "—"}</td>
                  <td className="py-1 pr-3">{(c.rz_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{(c.exp_path_pct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3">{c.why}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
