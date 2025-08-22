
import React from "react";
import { americanToDecimal, computeEV } from "@/utils/evMath";

export default function StraightTables({ picks = [] }) {
  if (!picks || picks.length === 0) {
    return <div>No picks available.</div>;
  }

  // Raw Probability top 13
  const topProb = [...picks]
    .sort((a, b) => b.model_hrp - a.model_hrp)
    .slice(0, 13);

  // EV picks with 19% floor
  const evPicks = [...picks]
    .filter(p => p.model_hrp >= 0.19)
    .map(p => ({
      ...p,
      ev: p.ev ?? computeEV(p.model_hrp, p.odds)
    }))
    .sort((a, b) => b.ev - a.ev)
    .slice(0, 13);

  return (
    <div>
      <h2>Straight HR Bets (Top 13 Raw Probability)</h2>
      <table>
        <thead>
          <tr><th>Player</th><th>Prob%</th><th>Odds</th></tr>
        </thead>
        <tbody>
          {topProb.map((p,i)=>(
            <tr key={i}>
              <td>{p.player}</td>
              <td>{(p.model_hrp*100).toFixed(1)}%</td>
              <td>{p.odds}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Straight EV Bets (Top 13 EV Picks)</h2>
      <div style={{fontSize:"0.8em", color:"green"}}>EV block active</div>
      <table>
        <thead>
          <tr><th>Player</th><th>Prob%</th><th>Odds</th><th>EV (1u)</th></tr>
        </thead>
        <tbody>
          {evPicks.map((p,i)=>(
            <tr key={i}>
              <td>{p.player}</td>
              <td>{(p.model_hrp*100).toFixed(1)}%</td>
              <td>{p.odds}</td>
              <td>{p.ev.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
