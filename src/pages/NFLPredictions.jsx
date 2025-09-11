import React, { useEffect, useMemo, useState } from "react";
import NFLPredictionsActions from "@/components/NFLPredictionsActions";

// Drop-in page that adds the "green buttons" actions bar at the top.
// If you already had a predictions table here, keep it — this component only augments.
// If nothing existed, this renders a minimal table so the page isn't blank.
export default function NFLPredictionsPage() {
  const [rows, setRows] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/.netlify/functions/nfl-predictions-get", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j?.ok) {
          setRows(Array.isArray(j.rows) ? j.rows : []);
          setUpdated(j.updated || null);
        } else {
          setError(j?.error || "Failed to load predictions");
        }
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const nice = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">NFL Predictions</h1>
        <span className="text-sm text-gray-500">Updated {nice(updated)}</span>
      </div>

      {/* Green buttons bar */}
      <NFLPredictionsActions className="mb-6" />

      {/* Existing table from your project will still render if you kept it below.
          If not, here's a tidy fallback table for confidence. */}
      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-600">No predictions available.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Kickoff</th>
                <th className="text-left p-3">Matchup</th>
                <th className="text-left p-3">Moneyline, Spread, Total Lines</th>
                <th className="text-left p-3">Moneyline Pick</th>
                <th className="text-left p-3">Spread Pick</th>
                <th className="text-left p-3">O/U Pick</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const kickoff = g.kickoff || g.commence_time;
                const mlHome = g.ml_home_best ?? g.consensus?.h2h?.home_best?.price ?? null;
                const mlAway = g.ml_away_best ?? g.consensus?.h2h?.away_best?.price ?? null;
                const spreadLine = (g.spread_line ?? g.consensus?.spreads?.line) ?? null;
                const spreadTeam = g.spread_team ?? g.consensus?.spreads?.team ?? null;
                const totalLine = (g.total_line ?? g.consensus?.totals?.line) ?? null;
                const totalSide = g.total_side ?? g.consensus?.totals?.side ?? null;

                const pickML = g.pick?.type === "moneyline" ? `${g.pick.team} (${(g.pick.confidence*100).toFixed(1)}%)` : "—";
                const pickSpread = g.pick?.type === "spread" ? `${g.pick.team} ${g.pick.line > 0 ? "+" : ""}${g.pick.line} (${(g.pick.confidence*100).toFixed(1)}%)` : "—";
                const pickTotal = g.pick?.type === "total" ? `${g.pick.side} ${g.pick.line} (${(g.pick.confidence*100).toFixed(1)}%)` : "—";

                return (
                  <tr key={g.id} className="border-t">
                    <td className="p-3 whitespace-nowrap">{nice(kickoff)}</td>
                    <td className="p-3">{g.matchup}</td>
                    <td className="p-3 text-gray-800">
                      <div className="flex flex-col gap-1">
                        <div><span className="font-semibold">ML:</span> Home {mlHome ?? "—"} / Away {mlAway ?? "—"}</div>
                        <div><span className="font-semibold">Spread:</span> {spreadTeam ?? "—"} {spreadLine ?? "—"}</div>
                        <div><span className="font-semibold">Total:</span> {totalSide ?? "—"} {totalLine ?? "—"}</div>
                      </div>
                    </td>
                    <td className="p-3">{pickML}</td>
                    <td className="p-3">{pickSpread}</td>
                    <td className="p-3">{pickTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
