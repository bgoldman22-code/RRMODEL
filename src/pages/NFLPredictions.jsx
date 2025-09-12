import React, { useEffect, useMemo, useState } from "react";
import NFLPredictionsActions from "../components/NFLPredictionsActions.jsx";

function pct(x) {
  if (x == null || isNaN(x)) return "—";
  return (x * 100).toFixed(1) + "%";
}
function barWidth(x) {
  if (x == null || isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x)) * 100;
}
function parseMatchup(s) {
  // "Away @ Home"
  if (!s || typeof s !== "string") return { away: "—", home: "—" };
  const parts = s.split(" @ ");
  if (parts.length !== 2) return { away: s, home: "—" };
  return { away: parts[0], home: parts[1] };
}
function localTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { hour: "2-digit", minute: "2-digit", weekday: "short", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function NFLPredictions() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/.netlify/functions/nfl-predictions-get", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const rows = data?.rows || [];

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => (b?.pick?.confidence || 0) - (a?.pick?.confidence || 0));
  }, [rows]);

  // quick-and-clean parlay builder: top-N by confidence, skip same game duplicates
  function buildParlays(n, count) {
    const out = [];
    const used = new Set();
    for (const r of sortedRows) {
      if (out.length >= n) break;
      if (used.has(r.id)) continue;
      out.push(r);
      used.add(r.id);
    }
    return Array.from({ length: count }, (_, i) => ({
      title: `${n}-Leg Parlay #${i+1}`,
      legs: out.map(r => r.pick?.type === "total"
        ? `${r.matchup}: ${r.total_side} ${r.total_line}`
        : `${r.matchup}: ${r.pick?.team || r.spread_team || "—"} ${r.pick?.type === "moneyline" ? "ML" : (r.spread_line != null ? (r.spread_line > 0 ? "+" : "") + r.spread_line : "")}`
      ),
      approx_conf: out.reduce((acc, r) => acc * (r.pick?.confidence || 0.5), 1),
    }));
  }
  const parlays3 = buildParlays(3, 3);
  const parlays5 = buildParlays(5, 3);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">NFL Predictions</h1>
          <div className="text-sm text-gray-600">
            Updated: {data?.updated ? new Date(data.updated).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <NFLPredictionsActions />
      </div>

      {loading && <div className="mt-6 text-gray-600">Loading…</div>}
      {err && <div className="mt-6 text-red-600">Error: {err}</div>}

      {!loading && !err && (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border rounded-xl overflow-hidden bg-white">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm">
                <th className="p-3 border-b">Kickoff (Local)</th>
                <th className="p-3 border-b">Matchup</th>
                <th className="p-3 border-b">Moneyline, Spread, Total Lines</th>
                <th className="p-3 border-b">Moneyline Pick</th>
                <th className="p-3 border-b">Spread Pick</th>
                <th className="p-3 border-b">O/U Pick</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { away, home } = parseMatchup(r.matchup);
                const mlHome = r.ml_home_best;
                const mlAway = r.ml_away_best;
                const spreadLabel = r.spread_team && r.spread_line != null
                  ? `${r.spread_team} ${r.spread_line > 0 ? "+" : ""}${r.spread_line}`
                  : "—";
                const totalLabel = r.total_line != null
                  ? `${r.total_side || "—"} ${r.total_line}`
                  : "—";

                // derive ML pick if the API didn't include one explicitly
                const mlPickTeam = (r.pick?.type === "moneyline" && r.pick?.team)
                  ? r.pick.team
                  : (r.ml_home_imp >= r.ml_away_imp ? home : away);
                const mlConf = r.pick?.type === "moneyline" ? r.pick?.confidence : Math.max(r.ml_home_imp || 0, r.ml_away_imp || 0);

                // spread pick fallback
                const spreadPickTeam = (r.pick?.type === "spread" && r.pick?.team)
                  ? r.pick.team
                  : (r.spread_team || "—");
                const spreadConf = r.pick?.type === "spread" ? r.pick?.confidence : (r.ml_home_imp && r.ml_away_imp ? Math.abs(r.ml_home_imp - r.ml_away_imp) + 0.5 : 0.5);

                // OU pick fallback
                const ouPick = (r.pick?.type === "total" && r.total_side)
                  ? `${r.total_side} ${r.total_line}`
                  : totalLabel;
                const ouConf = r.pick?.type === "total" ? r.pick?.confidence : 0.55;

                return (
                  <tr key={r.id} className="text-sm hover:bg-gray-50/70">
                    <td className="p-3 border-b align-top">{localTime(r.kickoff)}</td>
                    <td className="p-3 border-b align-top">
                      <div className="font-medium">{r.matchup}</div>
                      <div className="text-xs text-gray-500">ID: {r.id.slice(0,8)}…</div>
                    </td>
                    <td className="p-3 border-b align-top">
                      <div>ML: <span className="font-mono">{home} {mlHome > 0 ? "+" : ""}{mlHome}</span>{" "}
                        <span className="text-gray-400">|</span>{" "}
                        <span className="font-mono">{away} {mlAway > 0 ? "+" : ""}{mlAway}</span>
                      </div>
                      <div>Spread: <span className="font-mono">{spreadLabel}</span></div>
                      <div>Total: <span className="font-mono">{totalLabel}</span></div>
                    </td>

                    <td className="p-3 border-b align-top">
                      <div className="font-medium">{mlPickTeam}</div>
                      <div className="h-2 rounded bg-emerald-100 overflow-hidden mt-1">
                        <div className="h-2 bg-emerald-500" style={{ width: barWidth(mlConf) + "%" }} />
                      </div>
                      <div className="text-xs text-gray-500">{pct(mlConf)} conf.</div>
                    </td>

                    <td className="p-3 border-b align-top">
                      <div className="font-medium">{spreadPickTeam}</div>
                      <div className="h-2 rounded bg-indigo-100 overflow-hidden mt-1">
                        <div className="h-2 bg-indigo-500" style={{ width: barWidth(spreadConf) + "%" }} />
                      </div>
                      <div className="text-xs text-gray-500">{pct(spreadConf)} conf.</div>
                    </td>

                    <td className="p-3 border-b align-top">
                      <div className="font-medium">{ouPick}</div>
                      <div className="h-2 rounded bg-amber-100 overflow-hidden mt-1">
                        <div className="h-2 bg-amber-500" style={{ width: barWidth(ouConf) + "%" }} />
                      </div>
                      <div className="text-xs text-gray-500">{pct(ouConf)} conf.</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !err && (
        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold mb-2">3-Leg Parlays</h2>
            {parlays3.map((p, i) => (
              <div key={i} className="mb-3 p-3 rounded-lg bg-gray-50 border">
                <div className="text-sm font-medium">{p.title}</div>
                <ul className="list-disc ml-5 text-sm mt-1">
                  {p.legs.map((l, idx) => <li key={idx}>{l}</li>)}
                </ul>
                <div className="text-xs text-gray-500 mt-1">Approx. combined confidence: {pct(p.approx_conf)}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold mb-2">5-Leg Parlays</h2>
            {parlays5.map((p, i) => (
              <div key={i} className="mb-3 p-3 rounded-lg bg-gray-50 border">
                <div className="text-sm font-medium">{p.title}</div>
                <ul className="list-disc ml-5 text-sm mt-1">
                  {p.legs.map((l, idx) => <li key={idx}>{l}</li>)}
                </ul>
                <div className="text-xs text-gray-500 mt-1">Approx. combined confidence: {pct(p.approx_conf)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}