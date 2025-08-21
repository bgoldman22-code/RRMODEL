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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const weeksAvailable = getWeeksAvailable();
      const games = getGamesForWeek(week);

      // 1) fetch odds (non-blocking if fails)
      let oddsData = { offers: [], usingOddsApi: false };
      try {
        const o = await fetchNflOdds(week);
        oddsData = { offers: o?.offers || [], usingOddsApi: !!o?.usingOddsApi };
        if (alive) {
          setOffers(oddsData.offers);
          setUsingOddsApi(oddsData.usingOddsApi);
        }
      } catch (_) {
        if (alive) {
          setOffers([]);
          setUsingOddsApi(false);
        }
      }

      // helper to call engine (via shim) with optional relax flag
      const runEngine = async (relax = false) => {
        try {
          const { candidates: rows, diagnostics: diag } = await tdEngine(games, {
            week,
            offers: oddsData.offers,
            requireOdds: false,
            relax,
          });
          return { rows: rows || [], diag: diag || {} };
        } catch (e) {
          console.warn("tdEngine shim error:", e);
          return { rows: [], diag: { error: String(e) } };
        }
      };

      // 2) run engine normal
      let { rows, diag } = await runEngine(false);

      // 3) if empty, auto-retry once with relaxed display thresholds
      if (!rows.length) {
        const retry = await runEngine(true);
        rows = retry.rows;
        // keep first diag but mark retried
        diag = { ...retry.diag, retried: true };
      }

      if (alive) {
        setCandidates(rows);
        setDiagnostics({
          ...(diag || {}),
          weeksAvailable: weeksAvailable.length,
          games: games.length,
          offers: oddsData.offers.length,
          usingOddsApi: oddsData.usingOddsApi,
        });
        setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [week]);

  const formatPct = (v) => {
    if (typeof v === "number") {
      // If model provided 0-1 prob, convert to %; if already %, leave as-is
      if (v > 0 && v <= 1) return `${(v * 100).toFixed(1)}%`;
      if (v > 1 && v <= 100) return `${v.toFixed(1)}%`;
    }
    return v ?? "-";
  };

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
        {loading && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      {diagnostics && (
        <p className="mt-2 text-xs text-gray-600">
          Using OddsAPI: {usingOddsApi ? "yes" : "no"} • offers: {offers.length}
          <br />
          data (last 3 yrs): ok • diagnostics — weeks:{diagnostics.weeksAvailable} games:{diagnostics.games} candidates:{candidates.length}{diagnostics.retried ? " • retried" : ""}
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
              <tr>
                <td className="border px-2 py-2 text-center" colSpan={9}>
                  No candidates yet.
                </td>
              </tr>
            ) : (
              candidates.map((c, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{c.player}</td>
                  <td className="border px-2 py-1">{c.team}</td>
                  <td className="border px-2 py-1">{c.game}</td>
                  <td className="border px-2 py-1 text-right">{formatPct(c.modelTdPct)}</td>
                  <td className="border px-2 py-1 text-right">{formatPct(c.rzPath)}</td>
                  <td className="border px-2 py-1 text-right">{formatPct(c.expPath)}</td>
                  <td className="border px-2 py-1 text-right">{c.oddsAmerican ?? "-"}</td>
                  <td className="border px-2 py-1 text-right">
                    {typeof c.ev1u === "number" ? c.ev1u.toFixed(3) : "-"}
                  </td>
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
