import React, { useEffect, useMemo, useState } from "react";

// ---- Config ----
const PRIMARY_ENDPOINTS = [
  "/.netlify/functions/mlb-hr-get",
  "/.netlify/functions/mlb_hr_get",
  "/.netlify/functions/hr-get",
];

const FALLBACK_ODDS_ENDPOINTS = [
  "/.netlify/functions/odds-get?sport=baseball_mlb&market=player_home_runs&region=us",
];

const number = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const pct = (v) => (v === null || v === undefined ? "—" : `${(Number(v) * 100).toFixed(1)}%`);
const money = (u) => {
  if (!u) return "—";
  const s = String(u).trim();
  if (/^[+-]?\d+$/.test(s)) return s; // American odds already
  // Decimal odds -> back-calc to American-ish for display
  const d = Number(s);
  if (!isFinite(d) || d <= 1) return s;
  return d >= 2 ? `+${Math.round((d - 1) * 100)}` : `${Math.round(-100 / (d - 1))}`;
};

function normalizeRow(row) {
  // Be lenient with legacy keys
  const player = row.player || row.name || row.Player || row.PLAYER;
  const team = row.team || row.Team || row.TEAM;
  const opp = row.opp || row.opponent || row.Opp || row.OPP;
  const book = row.book || row.bookmaker || row.Book || row.BOOK;
  const price = row.price ?? row.odds ?? row.Price ?? row.ODDS;
  const implied =
    row.implied ?? row.implied_prob ?? row.impliedProbability ?? row.implied_pct ??
    (row.price ? (Number(row.price) > 0 ? 100 / (Number(row.price) + 100) : (-Number(row.price)) / ((-Number(row.price)) + 100)) : null);
  const model =
    row.model ?? row.model_prob ?? row.proj ?? row.proj_hr ?? row.model_pct ?? row.Model ?? row.PROJ ?? null;
  const edge =
    row.edge ?? row.value ?? row.ev ?? row.edge_pct ?? (model != null && implied != null ? Number(model) - Number(implied) : null);
  const kelly = row.kelly ?? row.kelly_frac ?? row.kelly_pct ?? null;
  const stake = row.stake ?? row.unit ?? row.units ?? null;
  const game = row.game || row.matchup || row.Game;
  const kickoff = row.kickoff || row.start || row.start_time || row.Kick || row.KICK;
  const updated = row.updated || row.ts || row.lastUpdated;

  return {
    id: row.id || `${player}-${book}-${price}-${kickoff}`,
    player,
    team,
    opp,
    book,
    price,
    implied: implied != null ? Number(implied) : null,
    model: model != null ? Number(model) : null,
    edge: edge != null ? Number(edge) : null,
    kelly: kelly != null ? Number(kelly) : null,
    stake: stake != null ? Number(stake) : null,
    game,
    kickoff,
    updated,
    raw: row,
  };
}

async function fetchFirst(urls) {
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      return { url: u, json };
    } catch (e) {
      // continue to next
    }
  }
  return null;
}

export default function MLBHR() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ ok: false, source: "", updated: "" });
  const [books, setBooks] = useState([]);
  const [activeBooks, setActiveBooks] = useState(new Set());
  const [minEdge, setMinEdge] = useState(0.02);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      // 1) Primary model endpoint (preferred – rounds in your model + picks)
      const primary = await fetchFirst(PRIMARY_ENDPOINTS);
      let rows = [];
      let source = "";
      let updated = "";
      if (primary?.json) {
        const j = primary.json;
        const arr = j.rows || j.picks || j.data || j;
        rows = Array.isArray(arr) ? arr : [];
        source = j.source || primary.url || "mlb-hr-get";
        updated = j.updated || j.lastUpdated || "";
      } else {
        // 2) Try a generic odds endpoint as a bare minimum (shape differs)
        const alt = await fetchFirst(FALLBACK_ODDS_ENDPOINTS);
        if (alt?.json?.games) {
          // Flatten players market if present in odds response (very rough; better to keep your old function)
          rows = [];
          source = alt.url || "odds-get";
          updated = alt.json?.updated || "";
        }
      }
      const normalized = rows.map(normalizeRow).filter(r => r.player && r.book);
      setData(normalized);
      setMeta({ ok: normalized.length > 0, source, updated });
      const uniqBooks = Array.from(new Set(normalized.map(r => r.book).filter(Boolean))).sort();
      setBooks(uniqBooks);
      setActiveBooks(new Set(uniqBooks)); // start with all on
    })();
  }, []);

  const filtered = useMemo(() => {
    return data
      .filter(r => (r.edge == null ? true : r.edge >= minEdge))
      .filter(r => (activeBooks.size ? activeBooks.has(r.book) : true))
      .filter(r => {
        if (!q) return true;
        const s = `${r.player || ""} ${r.team || ""} ${r.opp || ""} ${r.book || ""} ${r.game || ""}`.toLowerCase();
        return s.includes(q.toLowerCase());
      })
      .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  }, [data, minEdge, activeBooks, q]);

  const toggleBook = (b) => {
    const next = new Set(activeBooks);
    if (next.has(b)) next.delete(b); else next.add(b);
    setActiveBooks(next);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">MLB HR Round Robin</h1>
        <div className="text-sm text-gray-500">
          {meta.ok ? (
            <>
              <span className="mr-2">source: {meta.source}</span>
              {meta.updated ? <span>updated: {new Date(meta.updated).toLocaleString()}</span> : null}
            </>
          ) : (
            <span className="text-red-600">No data yet</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">Min edge</label>
          <input
            type="range"
            min="0"
            max="0.15"
            step="0.005"
            value={minEdge}
            onChange={(e) => setMinEdge(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-sm tabular-nums w-16 text-right">{(minEdge * 100).toFixed(1)}%</span>
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <input
            placeholder="Search player, team, book…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border rounded-md px-3 py-2 w-full md:w-1/2"
          />
          <div className="flex flex-wrap gap-2">
            {books.map((b) => (
              <button
                key={b}
                onClick={() => toggleBook(b)}
                className={`text-sm px-2 py-1 rounded border ${activeBooks.has(b) ? "bg-sky-100 border-sky-300" : "bg-white border-gray-300 text-gray-500"}`}
                title="Toggle bookmaker"
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-auto border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Opp</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Book</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Odds</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Implied</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Model</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Edge</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Kelly</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Stake</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 whitespace-nowrap">{r.player || "—"}</td>
                <td className="px-3 py-2">{r.team || "—"}</td>
                <td className="px-3 py-2">{r.opp || "—"}</td>
                <td className="px-3 py-2">{r.book || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(r.implied)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(r.model)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.edge != null && r.edge >= 0.05 ? "text-green-700" : ""}`}>{pct(r.edge)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.kelly != null ? (Number(r.kelly) * 100).toFixed(1) + "%" : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.stake != null ? Number(r.stake).toFixed(2) + "u" : "—"}</td>
                <td className="px-3 py-2">{r.game || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.kickoff ? new Date(r.kickoff).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!meta.ok && (
        <div className="mt-6 p-3 rounded bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
          Heads up: I couldn’t find your old MLB HR function. The page will auto-populate as soon as
          <code className="px-1"> /.netlify/functions/mlb-hr-get </code>
          (or one of the fallbacks) starts returning data.
        </div>
      )}
    </div>
  );
}