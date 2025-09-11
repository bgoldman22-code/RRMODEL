import React, { useEffect, useMemo, useState } from "react";

/**
 * NFL Predictions
 * - Reads aggregated weekly predictions from your Netlify function:
 *     /.netlify/functions/nfl-predictions-get
 * - Expects the payload shape you showed:
 *   { ok: true, updated: ISO, rows: [...], parlay: { legs: [...] } }
 *
 * UI goals:
 *  - Simple, confidence-inspiring table
 *  - Sort by kickoff (default), Moneyline edge, or confidence
 *  - 3–5 leg suggested parlay (from the API) in a tidy card
 */
export default function NFLPredictions() {
  const [data, setData] = useState({ ok: false, updated: null, rows: [], parlay: null });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [sortKey, setSortKey] = useState("kickoff"); // kickoff | confidence | edge
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/.netlify/functions/nfl-predictions-get");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const list = Array.isArray(data?.rows) ? data.rows : [];
    const filtered = list.filter(r => {
      if (!query) return true;
      const q = query.toLowerCase();
      return String(r.matchup || "").toLowerCase().includes(q);
    });
    const withEdge = filtered.map(r => {
      // implied favorite based on best ML
      const homeEdge = (r.ml_home_imp || 0) - (r.ml_away_imp || 0);
      const edge = Math.abs(homeEdge);
      return { ...r, _edge: edge };
    });
    const by = {
      kickoff: (a,b) => (new Date(a.kickoff) - new Date(b.kickoff)),
      confidence: (a,b) => (b?.pick?.confidence ?? 0) - (a?.pick?.confidence ?? 0),
      edge: (a,b) => (b?._edge ?? 0) - (a?._edge ?? 0),
    }[sortKey] || ((a,b)=>0);
    return withEdge.sort(by);
  }, [data, sortKey, query]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">NFL Predictions</h1>
        <p className="text-sm text-gray-500">
          Updated {data?.updated ? new Date(data.updated).toLocaleString() : "—"}
        </p>
      </header>

      <Controls
        sortKey={sortKey}
        setSortKey={setSortKey}
        query={query}
        setQuery={setQuery}
        loading={loading}
      />

      {err && <div className="p-3 rounded bg-red-100 text-red-700 text-sm mb-4">Error: {err}</div>}
      {!err && loading && <div className="p-3 rounded bg-gray-100 text-gray-600 text-sm mb-4">Loading predictions…</div>}

      {!loading && rows.length === 0 && (
        <div className="p-3 rounded bg-amber-100 text-amber-800 text-sm mb-4">No predictions available.</div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <Th>Kickoff (local)</Th>
                <Th>Matchup</Th>
                <Th>Best ML</Th>
                <Th>Spread</Th>
                <Th>Total</Th>
                <Th>Pick</Th>
                <Th>Confidence</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <Td title={r.kickoff}>{new Date(r.kickoff).toLocaleString()}</Td>
                  <Td className="font-medium">{r.matchup}</Td>
                  <Td>
                    <div className="flex gap-3">
                      <span title="Away implied">
                        Away: <b>{fmtImp(r.ml_away_imp)}</b> <span className="text-gray-500">({fmtPrice(r.ml_away_best)})</span>
                      </span>
                      <span title="Home implied">
                        Home: <b>{fmtImp(r.ml_home_imp)}</b> <span className="text-gray-500">({fmtPrice(r.ml_home_best)})</span>
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {r.spread_team ? (
                      <span>{r.spread_team} {r.spread_line > 0 ? `+${r.spread_line}` : r.spread_line}</span>
                    ) : "—"}
                  </Td>
                  <Td>
                    {r.total_side ? (<span>{r.total_side} {r.total_line}</span>) : "—"}
                  </Td>
                  <Td>
                    {r.pick?.type === "moneyline" && (
                      <span>ML — <b>{r.pick.team}</b></span>
                    )}
                    {r.pick?.type === "total" && (
                      <span>Total — <b>{r.pick.side} {r.pick.line}</b></span>
                    )}
                    {!r.pick && "—"}
                  </Td>
                  <Td>
                    <ConfidenceBar value={r.pick?.confidence ?? 0} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.parlay?.legs?.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Suggested 5-Leg Parlay</h2>
          <div className="border rounded-lg p-4 space-y-2">
            {data.parlay.legs.map((leg) => (
              <div key={leg.gameId} className="flex items-center justify-between">
                <div className="text-sm">{leg.matchup}</div>
                <div className="text-sm font-medium">{leg.leg}</div>
                <div className="w-40"><ConfidenceBar value={leg.confidence ?? 0} /></div>
              </div>
            ))}
            <p className="text-xs text-gray-500 pt-1">
              Parlays are illustrative, built from highest-confidence moneyline edges.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Controls({ sortKey, setSortKey, query, setQuery, loading }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
      <div className="inline-flex items-center gap-2">
        <label className="text-sm text-gray-600">Sort by</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          disabled={loading}
        >
          <option value="kickoff">Kickoff</option>
          <option value="confidence">Confidence</option>
          <option value="edge">Moneyline edge</option>
        </select>
      </div>
      <input
        type="search"
        placeholder="Filter by matchup…"
        className="border rounded px-3 py-1 text-sm md:ml-auto w-full md:w-80"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading}
      />
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{children}</th>;
}
function Td({ children, className = "", title }) {
  return <td className={`px-3 py-2 align-top ${className}`} title={title}>{children}</td>;
}

function ConfidenceBar({ value = 0 }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  const display = (pct * 100).toFixed(1) + "%";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 bg-gray-200 rounded w-28 overflow-hidden">
        <div className="h-2 bg-green-500" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="text-xs text-gray-600 w-12 tabular-nums">{display}</div>
    </div>
  );
}

function fmtPrice(v) {
  if (v === null || v === undefined) return "—";
  return v > 0 ? `+${v}` : String(v);
}
function fmtImp(v) {
  if (!v && v !== 0) return "—";
  return (v * 100).toFixed(1) + "%";
}
