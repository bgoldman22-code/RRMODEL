import React from "react";

/**
 * NFLPredictionsTable
 * Renders predictions in three markets per matchup:
 *  - Moneyline
 *  - Spread (score line)
 *  - Total (Over/Under)
 *
 * Accepts `data` in a flexible shape. It will try these, in order:
 *  1) { picks: [ { matchup, home, away, kickoff, markets: { moneyline:{pick, price, line, confidence}, spread:{...}, total:{...} } } ] }
 *  2) { rows:  [ { home, away, commence_time, ml_home, ml_away, spread_point, spread_home_line, spread_away_line, total_points, over_price, under_price, conf_ml, conf_spread, conf_total, pick_ml, pick_spread, pick_total } ] }
 * Any missing market will be skipped gracefully.
 */

function pct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${Math.round(Number(x) * 100)}%`;
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  } catch {
    return iso || "—";
  }
}

function normalize(input) {
  const list = input?.picks || input?.rows || [];
  const out = [];

  for (const r of list) {
    const home = r.home || r.homeTeam || r.matchup?.split(" @ ")?.[1] || r.matchup?.split(" vs ")?.[1] || "";
    const away = r.away || r.awayTeam || r.matchup?.split(" @ ")?.[0] || r.matchup?.split(" vs ")?.[0] || "";
    const kickoff = r.kickoff || r.commence_time || r.commenceTime || r.start || r.time || "";
    const matchup = r.matchup || (away && home ? `${away} @ ${home}` : "");

    const markets = r.markets || {};

    // Moneyline
    const ml = markets.moneyline || (r.pick_ml || r.conf_ml != null
      ? {
          pick: r.pick_ml || null,
          price: (r.pick_ml && r.pick_ml === home) ? r.ml_home : (r.pick_ml && r.pick_ml === away) ? r.ml_away : (r.ml_home ?? r.ml_away ?? null),
          confidence: r.conf_ml ?? null,
          line: null
        }
      : null);

    // Spread
    const sp = markets.spread || (r.pick_spread || r.conf_spread != null || r.spread_point != null
      ? {
          pick: r.pick_spread || (r.spread_point != null ? (r.spread_point < 0 ? home : away) : null),
          price: (r.spread_home_line ?? r.spread_away_line ?? null),
          line: r.spread_point ?? null,
          confidence: r.conf_spread ?? null
        }
      : null);

    // Total
    const tot = markets.total || (r.pick_total || r.conf_total != null || r.total_points != null
      ? {
          pick: r.pick_total || (r.total_points != null ? "Over" : null),
          price: (r.over_price ?? r.under_price ?? null),
          line: r.total_points ?? null,
          confidence: r.conf_total ?? null
        }
      : null);

    out.push({
      id: r.id || `${home}-${away}-${kickoff}`,
      matchup: matchup || `${away} @ ${home}`,
      kickoff,
      markets: {
        ...(ml ? { moneyline: ml } : {}),
        ...(sp ? { spread: sp } : {}),
        ...(tot ? { total: tot } : {}),
      }
    });
  }
  return out;
}

function MarketCell({ label, mkt }) {
  if (!mkt) return null;
  const hasLine = mkt.line !== null && mkt.line !== undefined;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs uppercase opacity-70">{label}</div>
      <div className="text-sm font-medium">
        {mkt.pick ?? "—"}{hasLine ? (label === "Spread" ? ` ${mkt.line > 0 ? `+${mkt.line}` : mkt.line}` : label === "Total" ? ` ${mkt.line}` : "") : ""}
      </div>
      <div className="text-xs opacity-70">
        {mkt.price != null ? `Odds ${mkt.price}` : "Odds —"} • Conf {pct(mkt.confidence)}
      </div>
    </div>
  );
}

export default function NFLPredictionsTable({ data, isLoading, error }) {
  const rows = normalize(data);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        <div className="font-semibold mb-1">Failed to load predictions</div>
        <div className="text-sm">{String(error)}</div>
      </div>
    );
  }
  if (isLoading) {
    return <div className="animate-pulse text-sm opacity-80">Loading NFL predictions…</div>;
  }
  if (!rows.length) {
    return <div className="text-sm opacity-80">No predictions available.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2">Matchup</th>
            <th className="px-3 py-2">Kickoff</th>
            <th className="px-3 py-2">Moneyline</th>
            <th className="px-3 py-2">Spread</th>
            <th className="px-3 py-2">Over / Under</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="bg-white/70 backdrop-blur rounded-xl shadow-sm">
              <td className="px-3 py-3 align-top">
                <div className="font-medium">{r.matchup}</div>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">{fmtTime(r.kickoff)}</td>
              <td className="px-3 py-3 align-top">
                <MarketCell label="Moneyline" mkt={r.markets.moneyline} />
              </td>
              <td className="px-3 py-3 align-top">
                <MarketCell label="Spread" mkt={r.markets.spread} />
              </td>
              <td className="px-3 py-3 align-top">
                <MarketCell label="Total" mkt={r.markets.total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
