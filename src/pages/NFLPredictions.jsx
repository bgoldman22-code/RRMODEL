import React, { useEffect, useState } from "react";

// Helper: safe format price like (-120) or return "–" when null/undefined
function fmtPrice(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "–";
  const n = Number(v);
  return `(${n > 0 ? n : n})`;
}

// Helper: show percent or "–"
function fmtPct(val) {
  if (val === null || val === undefined) return "–";
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num)) return "–";
  return `${Math.round(num * 100)}%`;
}

// Helper: return 'home' | 'away' | null
function roleForTeam(row, team) {
  if (!row) return null;
  const t = (team || "").toUpperCase();
  if ((row.homeTeam || "").toUpperCase() === t) return "home";
  if ((row.awayTeam || "").toUpperCase() === t) return "away";
  return null;
}

// Compute signed spread from the book's home spread and which side we picked.
// If book spread_point is for HOME (e.g., -3.5), then AWAY is the mirror (+3.5).
function signedSpreadForTeam(odds, teamRole) {
  if (!odds || odds.spread_point === null || odds.spread_point === undefined) return null;
  const homePoint = Number(odds.spread_point);
  if (Number.isNaN(homePoint)) return null;
  const point = teamRole === "home" ? homePoint : -homePoint;
  // format with sign
  return (point > 0 ? `+${point}` : `${point}`);
}

// Get the correct vig for the selected team on spread
function spreadPriceForTeam(odds, teamRole) {
  if (!odds) return null;
  if (teamRole === "home") return odds.spread_home_line ?? null;
  if (teamRole === "away") return odds.spread_away_line ?? null;
  return null;
}

// Moneyline price for selected team
function moneylinePriceForTeam(odds, teamRole) {
  if (!odds) return null;
  if (teamRole === "home") return odds.ml_home ?? null;
  if (teamRole === "away") return odds.ml_away ?? null;
  return null;
}

// Total price for over/under
function totalPriceForPick(odds, pick) {
  if (!odds) return null;
  if (!pick) return null;
  const side = (pick.side || pick.pick || "").toString().toUpperCase(); // 'OVER' | 'UNDER'
  if (side === "OVER") return odds.over_price ?? null;
  if (side === "UNDER") return odds.under_price ?? null;
  return null;
}

// Total points number
function totalPoints(odds) {
  if (!odds || odds.total_points === null || odds.total_points === undefined) return null;
  const n = Number(odds.total_points);
  return Number.isNaN(n) ? null : n;
}

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = async (force = false) => {
    setLoading(true);
    setErr("");
    try {
      const url = force 
        ? "/.netlify/functions/nfl-predictions-generate?force=true" 
        : "/.netlify/functions/nfl-predictions-generate";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!data || !data.rows) throw new Error("No rows in response");
      setRows(data.rows);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">NFL Predictions</h1>
        <button
          onClick={() => load(true)}
          className="px-3 py-2 rounded bg-black text-white hover:opacity-90"
        >
          Generate New Predictions
        </button>
      </div>

      {err && (
        <div className="p-3 mb-4 rounded bg-red-50 text-red-700 border border-red-200">
          {err}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left border-b">Matchup</th>
              <th className="px-3 py-2 text-left border-b">Kickoff</th>
              <th className="px-3 py-2 text-left border-b">Moneyline</th>
              <th className="px-3 py-2 text-left border-b">Conf</th>
              <th className="px-3 py-2 text-left border-b">Spread</th>
              <th className="px-3 py-2 text-left border-b">Conf</th>
              <th className="px-3 py-2 text-left border-b">Total</th>
              <th className="px-3 py-2 text-left border-b">Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const kickoff = new Date(row.kickoff).toLocaleString();
              const odds = row.odds || {};

              // Moneyline
              const mlPick = row.moneyline || row.pick || null; // tolerate legacy field
              const mlTeam = mlPick?.team || mlPick?.displayPick || row.displayPick || null;
              const mlRole = roleForTeam(row, mlTeam);
              const mlPrice = moneylinePriceForTeam(odds, mlRole);
              const mlStr = mlTeam
                ? `${mlTeam} ${mlPrice === null ? "" : (mlPrice > 0 ? `(${mlPrice})` : `(${mlPrice})`)}`.trim()
                : "–";

              // Spread
              const spPick = row.spread || null;
              const spTeam = spPick?.team || null;
              const spRole = roleForTeam(row, spTeam);
              const spPoint = signedSpreadForTeam(odds, spRole);
              const spPrice = spreadPriceForTeam(odds, spRole);
              const spSide = spPoint ? `${spTeam} ${spPoint}` : (spTeam || "–");
              const spStr = spTeam ? `${spSide} ${spPrice === null ? "" : fmtPrice(spPrice)}`.trim() : "–";

              // Total
              const totPick = row.total || null;
              const sideWord = (totPick?.side || "").toUpperCase();
              const tp = totalPoints(odds);
              const totPrice = totalPriceForPick(odds, totPick);
              const totStr = sideWord
                ? `${sideWord}${tp ? ` ${tp}` : ""}${totPrice === null ? "" : ` ${fmtPrice(totPrice)}`}`.trim()
                : "–";

              return (
                <tr key={row.id} className="odd:bg-white even:bg-gray-50">
                  <td className="px-3 py-2 border-b">{row.matchup || "–"}</td>
                  <td className="px-3 py-2 border-b">{kickoff || "–"}</td>
                  <td className="px-3 py-2 border-b">{mlStr || "–"}</td>
                  <td className="px-3 py-2 border-b">{fmtPct(mlPick?.confidence)}</td>
                  <td className="px-3 py-2 border-b">{spStr || "–"}</td>
                  <td className="px-3 py-2 border-b">{fmtPct(spPick?.confidence)}</td>
                  <td className="px-3 py-2 border-b">{totStr || "–"}</td>
                  <td className="px-3 py-2 border-b">{fmtPct(totPick?.confidence)}</td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  No predictions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
