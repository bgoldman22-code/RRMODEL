
import React from "react";

/**
 * MissingOddsTable
 * Defensive component used by MLB.jsx when some top model picks have no odds.
 * It accepts ANY of these props and will try to render something sensible:
 *  - items: Array<{ name, reason, hint }>
 *  - data: same as items
 *  - missing: same as items
 *  - list: same as items
 *  - rows: same as items
 *
 * Each item may be a string (player name) or an object with flexible keys:
 *  - { name, why, reason, hint, marketTried, normalized }
 */
export default function MissingOddsTable(props) {
  const tryArrays = [props.items, props.data, props.missing, props.list, props.rows];
  const source = (tryArrays.find(a => Array.isArray(a)) || []).slice(0, 20);

  if (!source.length) return null; // render nothing if no data

  const rows = source.map((it, idx) => {
    if (typeof it === "string") return { name: it, reason: "", hint: "" };
    if (!it || typeof it !== "object") return { name: String(it ?? ""), reason: "", hint: "" };
    // flexible field picking
    const name = it.name || it.player || it.key || it.normalized || it.rawKey || it.target || "";
    const reason = it.reason || it.why || it.error || "";
    const hint = it.hint || it.marketTried || it.market || it.region || "";
    return { name, reason, hint };
  });

  return (
    <div className="mt-6">
      <h3 style={{ margin: "0 0 8px 0" }}>Top Model Picks Missing Odds</h3>
      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px" }}>Player</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Reason</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Hint</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px" }}>{r.name || <em>(unknown)</em>}</td>
                <td style={{ padding: "8px" }}>{r.reason || "-"}</td>
                <td style={{ padding: "8px" }}>{r.hint || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        If a player should be here with odds, run <code>/.netlify/functions/odds-diagnostics</code> and <code>/.netlify/functions/odds-lookup?name=Player%20Name</code>.
      </p>
    </div>
  );
}
