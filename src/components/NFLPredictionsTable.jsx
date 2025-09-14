import React from "react";
import "./predictions.css";

export default function NFLPredictionsTable({ rows }) {
  if (!rows || !rows.length) return <div className="predictions-empty">No predictions yet.</div>;

  return (
    <div className="predictions-card">
      <table className="predictions-table">
        <thead>
          <tr>
            <th>Matchup</th>
            <th>Kickoff</th>
            <th>Moneyline Pick</th>
            <th>Spread Pick</th>
            <th>Total Pick</th>
            <th>Confidence (ML / ATS / O‑U)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const ml = r.moneyline || {};
            const sp = r.spread || {};
            const tot = r.total || {};
            const mlTeam = ml.team || r.displayPick;
            const spreadTeam = sp.team || (sp.side ? (sp.side === "home" ? r.homeTeam : r.awayTeam) : null);
            const spreadLabel = sp.side ? `${spreadTeam} ${sp.side === "home" ? "" : ""}${r.odds?.spread_point != null ? ` (${sp.side === "home" ? "-" : "+"}${Math.abs(r.odds.spread_point)})` : ""}` : "—";
            const totalLabel = tot.side ? `${tot.side.toUpperCase()} ${tot.total ?? ""}` : "—";
            const kickoff = r.kickoff ? new Date(r.kickoff).toLocaleString() : "TBD";
            return (
              <tr key={r.id}>
                <td className="matchup">{r.matchup}</td>
                <td className="kickoff">{kickoff}</td>
                <td className="ml-pick"><strong>{mlTeam}</strong>{ml.price != null ? ` (${ml.price})` : ""}</td>
                <td className="spread-pick">{spreadLabel}</td>
                <td className="total-pick">{totalLabel}</td>
                <td className="conf">
                  <div className="conf-badges">
                    <span className="badge">{Math.round((ml.confidence || 0.5)*100)}%</span>
                    <span className="sep">/</span>
                    <span className="badge">{Math.round((sp.confidence || 0.5)*100)}%</span>
                    <span className="sep">/</span>
                    <span className="badge">{Math.round((tot.confidence || 0.5)*100)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
