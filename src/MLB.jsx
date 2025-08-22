// src/MLB.jsx
import React, { useEffect, useState } from "react";

// --- tiny inline helpers so we don't import anything external ---
function americanToDecimal(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}
function evFromProb(prob, american) {
  const dec = americanToDecimal(american);
  if (!dec) return null;
  return prob * (dec - 1) - (1 - prob); // per 1u stake
}
function fmtPct(p) {
  const x = Number(p);
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toFixed(1) + "%";
}
function fmtOdds(o) {
  const n = Number(o);
  if (!Number.isFinite(n)) return "—";
  return n >= 0 ? `+${n}` : `${n}`;
}
function fmtEV(x) {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = Number(x);
  return (v >= 0 ? "+" : "") + v.toFixed(3);
}
function keyFor(row, i) {
  return `${row.player || row.Player || "p"}-${i}`;
}
// ----------------------------------------------------------------

export default function MLBPage() {
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState([]);   // unified picks array
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      // GET so it recalculates each time; your function supports CORS for GET
      const res = await fetch("/.netlify/functions/mlb-hr-generate-exp2?fresh=1", {
        method: "GET",
        headers: { "cache-control": "no-cache" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Prefer adjusted_v2 preview, then v1, then control
      const pickPreview =
        data?.preview?.adjusted_v2 ||
        data?.preview?.adjusted_v1 ||
        data?.preview?.control ||
        data?.picks ||
        [];

      // Normalize fields so tables are stable
      const norm = pickPreview.map((p) => {
        const player = p.player || p.Player || "";
        const team = p.team || p.team_abbr || p.Team || "";
        const game = p.game || p.Game || "";
        const baseProb =
          (typeof p.model_hrp_final === "number" && p.model_hrp_final) ||
          (typeof p.model_hrp === "number" && p.model_hrp) ||
          (typeof p.modelProb === "number" && p.modelProb) ||
          0;

        // Odds may be under different keys; keep the first good one
        const american =
          (Number.isFinite(Number(p.odds)) && Number(p.odds)) ||
          (Number.isFinite(Number(p.actual_odds)) && Number(p.actual_odds)) ||
          (Number.isFinite(Number(p.American)) && Number(p.American)) ||
          null;

        const ev =
          (typeof p.ev === "number" && p.ev) ||
          (typeof p.EV === "number" && p.EV) ||
          evFromProb(baseProb, american);

        return { player, team, game, prob: baseProb, american, ev };
      });

      setPicks(norm);
      // Stamp a human readable time
      const now = new Date();
      setUpdatedAt(
        now.toLocaleString("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          month: "short",
          day: "2-digit"
        }) + " ET"
      );
    } catch (e) {
      setError(e.message || "Failed to load picks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generate(); // auto-run on mount
  }, []);

  // Top 13 by raw probability
  const topProb = [...picks]
    .filter((p) => p.prob > 0)
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 13);

  // Top 13 EV with 19% HR floor
  const topEV = [...picks]
    .filter((p) => p.prob >= 0.19)
    .sort((a, b) => (b.ev ?? -Infinity) - (a.ev ?? -Infinity))
    .slice(0, 13);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">MLB Home Run Model</h1>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-sm text-gray-600">Updated: {updatedAt}</span>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            {loading ? "Refreshing…" : "Generate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-50 text-red-700 rounded">{error}</div>
      )}

      {/* Straight HR Bets (Top 13 Raw Probability) */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">
          Straight HR Bets (Top 13 Raw Probability)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Game</th>
                <th className="py-2 pr-4">HR Prob</th>
                <th className="py-2 pr-4">Odds</th>
              </tr>
            </thead>
            <tbody>
              {topProb.map((r, i) => (
                <tr key={keyFor(r, i)} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.player}</td>
                  <td className="py-2 pr-4">{r.team || "—"}</td>
                  <td className="py-2 pr-4">{r.game || "—"}</td>
                  <td className="py-2 pr-4">{fmtPct(r.prob)}</td>
                  <td className="py-2 pr-4">{fmtOdds(r.american)}</td>
                </tr>
              ))}
              {topProb.length === 0 && (
                <tr><td className="py-2" colSpan={5}>No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Straight EV Bets (Top 13 EV Picks, 19%+ HR floor) */}
      <section>
        <h2 className="text-xl font-semibold mb-2">
          Straight EV Bets (Top 13 EV Picks)
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          Filter: HR probability ≥ 19%
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Game</th>
                <th className="py-2 pr-4">HR Prob</th>
                <th className="py-2 pr-4">Odds</th>
                <th className="py-2 pr-4">EV (1u)</th>
              </tr>
            </thead>
            <tbody>
              {topEV.map((r, i) => (
                <tr key={keyFor(r, i)} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.player}</td>
                  <td className="py-2 pr-4">{r.team || "—"}</td>
                  <td className="py-2 pr-4">{r.game || "—"}</td>
                  <td className="py-2 pr-4">{fmtPct(r.prob)}</td>
                  <td className="py-2 pr-4">{fmtOdds(r.american)}</td>
                  <td className="py-2 pr-4">{fmtEV(r.ev)}</td>
                </tr>
              ))}
              {topEV.length === 0 && (
                <tr><td className="py-2" colSpan={6}>No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
