import React, { useEffect, useMemo, useState } from "react";

/**
 * NFL Predictions page
 * - Reads from /.netlify/functions/nfl-predictions-get
 * - Optional "Generate" button will try POST /.netlify/functions/nfl-predictions-generate
 */
export default function Predictions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ season: undefined, week: undefined, source: undefined, bundle: undefined, updated: undefined });
  const [parlay, setParlay] = useState({ legs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingOddsApi, setUsingOddsApi] = useState(undefined);

  async function fetchPredictions() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/.netlify/functions/nfl-predictions-get");
      const json = await res.json();
      // expected: { ok, season?, week?, bundle?, source?, updated, rows:[], parlay:{legs:[]} }
      if (!json || json.ok === false) {
        throw new Error(json?.error || "Prediction service returned error");
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setParlay(json.parlay || { legs: [] });
      setMeta({
        season: json.season,
        week: json.week,
        source: json.source,
        bundle: json.bundle,
        updated: json.updated,
      });
      setUsingOddsApi(json.usingOddsApi ?? undefined);
    } catch (e) {
      console.error("predictions-get failed", e);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function generateNow() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/.netlify/functions/nfl-predictions-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      });
      const j = await res.json().catch(() => ({}));
      console.log("nfl-predictions-generate ->", j);
    } catch (e) {
      console.warn("generate failed (non-fatal)", e);
      // non-fatal; we always refetch below
    } finally {
      await fetchPredictions();
    }
  }

  useEffect(() => {
    fetchPredictions();
  }, []);

  const rowsView = useMemo(() => {
    return rows.map((r) => {
      // Parse home/away from "Away @ Home"
      let away = "", home = "";
      if (typeof r.matchup === "string" && r.matchup.includes("@")) {
        const [a, h] = r.matchup.split("@").map(s => s.trim());
        away = a; home = h;
      }

      // Projected margin (home): make positive if model favors home, negative if away
      let projMarginHome = null;
      if (typeof r.spread_line === "number" && r.spread_team) {
        // convention: favorites often have negative spread_line (e.g., -3.5)
        // if favored team == home, margin for home should be +abs(spread); else negative
        const favoredIsHome = r.spread_team === home;
        let v = r.spread_line;
        if (favoredIsHome) {
          projMarginHome = Math.abs(v);
        } else {
          projMarginHome = -Math.abs(v);
        }
      }

      const homeWinPct = typeof r.ml_home_imp === "number" ? (r.ml_home_imp * 100).toFixed(1) + "%" : "—";
      const kickoff = r.kickoff ? new Date(r.kickoff).toUTCString().replace(":00 GMT", " UTC") : "—";
      const projTotal = r.total_line ?? "—";

      // Display pick compactly
      let pick = "—";
      if (r.pick?.type === "moneyline" && r.pick?.team) {
        pick = `ML: ${r.pick.team}`;
      } else if (r.pick?.type === "total" && r.total_side && r.total_line) {
        pick = `${r.total_side} ${r.total_line}`;
      }

      return (
        <tr key={r.id} className="border-b border-gray-200">
          <td className="py-2 px-3">
            <div className="font-medium">{away} @ {home}</div>
            <div className="text-xs text-gray-500">{pick}</div>
          </td>
          <td className="py-2 px-3 text-sm">{kickoff}</td>
          <td className="py-2 px-3 text-sm">{homeWinPct}</td>
          <td className={`py-2 px-3 text-sm ${projMarginHome > 0 ? "text-green-700" : projMarginHome < 0 ? "text-rose-700" : ""}`}>
            {projMarginHome === null ? "—" : (projMarginHome > 0 ? `+${projMarginHome}` : projMarginHome)}
          </td>
          <td className="py-2 px-3 text-sm">{projTotal}</td>
          <td className="py-2 px-3 text-sm">—</td>
          <td className="py-2 px-3 text-sm">—</td>
        </tr>
      );
    });
  }, [rows]);

  function ParlayCard({ title, legs }) {
    return (
      <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
        <div className="font-semibold mb-2">{title}</div>
        {legs?.length ? (
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {legs.map((l, i) => (
              <li key={i}>
                <span className="font-medium">{l.leg}</span>
                {l.matchup ? <span className="text-gray-500"> — {l.matchup}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-sm text-gray-500">No legs available yet.</div>
        )}
      </div>
    );
  }

  const legs3 = useMemo(() => (parlay?.legs || []).slice(0, 3), [parlay]);
  const legs5 = useMemo(() => (parlay?.legs || []).slice(0, 5), [parlay]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">NFL Predictions</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg border bg-black text-white text-sm hover:opacity-90"
            onClick={generateNow}
            disabled={loading}
            title="Rebuild predictions now"
          >
            {loading ? "Working…" : "Generate"}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border text-sm"
            onClick={fetchPredictions}
            disabled={loading}
            title="Refresh from server"
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600 mt-2">
        Season {meta.season ?? "—"} • Week {meta.week ?? "—"} • Source: {meta.source ?? "—"} • Bundle: {meta.bundle ?? "—"}
        {meta.updated ? <> • Updated: {new Date(meta.updated).toLocaleString()}</> : null}
        {usingOddsApi !== undefined ? <> • Using OddsAPI: {String(!!usingOddsApi)}</> : null}
      </p>

      {error ? (
        <div className="mt-4 p-3 text-sm rounded-md bg-rose-50 border border-rose-200 text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl overflow-hidden border border-gray-200 bg-white">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-sm">
            <tr>
              <th className="py-2 px-3 w-[34%]">Game</th>
              <th className="py-2 px-3 w-[18%]">Kickoff (UTC)</th>
              <th className="py-2 px-3 w-[12%]">Home Win %</th>
              <th className="py-2 px-3 w-[12%]">Proj Margin (home)</th>
              <th className="py-2 px-3 w-[10%]">Proj Total</th>
              <th className="py-2 px-3 w-[7%]">Weather</th>
              <th className="py-2 px-3 w-[7%]">Injuries</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-6 px-3 text-sm text-gray-500">Loading…</td></tr>
            ) : rowsView.length ? rowsView : (
              <tr><td colSpan={7} className="py-6 px-3 text-sm text-gray-500">No games found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Parlay Suggestions (auto-built)</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <ParlayCard title="3‑Leg" legs={legs3} />
        <ParlayCard title="5‑Leg" legs={legs5} />
      </div>
    </div>
  );
}
