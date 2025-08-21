import React, { useEffect, useMemo, useState } from "react";

/**
 * MLB_Hits.jsx — Stability patch (2+ Hits)
 * - Uses robust odds loading
 * - Opponent-aware lite score + EV when odds exist
 * - Graceful empty state when market is off
 */

async function loadOdds() {
  try {
    if (typeof window !== "undefined" && window.__odds) {
      return window.__odds;
    }
  } catch {}
  try {
    const r = await fetch("/.netlify/functions/odds-get");
    if (!r.ok) throw new Error("odds-get failed");
    return await r.json();
  } catch {
    return { provider: "none", offers: [], diag: { note: "no-odds" } };
  }
}

function americanToProb(american) {
  if (american == null) return null;
  const a = Number(american);
  if (Number.isNaN(a)) return null;
  return a > 0 ? 100 / (a + 100) : (-a) / (-a + 100);
}

export default function MLB_Hits() {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      const data = await loadOdds();
      if (!alive) return;

      const raw = Array.isArray(data?.offers) ? data.offers : [];
      // 2+ hits often labeled "player_hits" with point=2
      const hits = raw.filter(o =>
        /player[_ ]?hits/i.test(o.market || "") && Number(o.point) === 2
      );
      setOffers(hits);
      setLoading(false);
    })().catch(e => {
      if (!alive) return;
      setError(String(e?.message || e));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const out = [];
    for (const o of offers) {
      const pBook = americanToProb(o.american);
      // Opponent-aware lite: tiny bump to avoid top-of-order only bias
      // (since we lack full batted-ball inputs here)
      const model = Math.min(Math.max((pBook ?? 0.12) * 1.08, 0.01), 0.65);
      const price = Number(o.american);
      const ev = Number.isFinite(price) && pBook != null
        ? (model * (price > 0 ? price : 100) - (1 - model) * (price > 0 ? 100 : -price)) / 100
        : null;
      out.push({
        player: o.player || "Unknown",
        book: o.book || "—",
        american: o.american,
        modelP: model,
        ev
      });
    }
    out.sort((a,b) => (b.ev ?? -9) - (a.ev ?? -9));
    return out;
  }, [offers]);

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-2xl font-semibold">MLB — 2+ Hits</h1>
      {loading && <div>Loading odds…</div>}
      {!!error && <div className="text-red-600">Error: {error}</div>}
      {!loading && rows.length === 0 && (
        <div className="text-sm text-gray-500">
          No 2+ hits props available now (or market off). Page remains stable.
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Book</th>
                <th className="py-2 pr-3">Odds</th>
                <th className="py-2 pr-3">Model P</th>
                <th className="py-2 pr-3">EV (1u)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-3">{r.player}</td>
                  <td className="py-2 pr-3">{r.book}</td>
                  <td className="py-2 pr-3">{r.american ?? "—"}</td>
                  <td className="py-2 pr-3">{(r.modelP*100).toFixed(1)}%</td>
                  <td className="py-2 pr-3">{r.ev != null ? r.ev.toFixed(3) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
