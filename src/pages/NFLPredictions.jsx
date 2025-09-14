// patched NFLPredictions.jsx
import React, { useEffect, useState } from "react";

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    fetch("/.netlify/functions/nfl-predictions-generate")
      .then(r => r.json())
      .then(data => setRows(data.rows || []));
  }, []);

  return (
    <div>
      <h1>NFL Predictions</h1>
      <table>
        <thead>
          <tr>
            <th>Matchup</th>
            <th>Kickoff</th>
            <th>Moneyline</th>
            <th>Conf</th>
            <th>Spread</th>
            <th>Conf</th>
            <th>Total</th>
            <th>Conf</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.matchup}</td>
              <td>{new Date(r.kickoff).toLocaleString()}</td>
              <td>{r.odds ? `${r.odds.home} (${r.odds.ml_home})` : "-"}</td>
              <td>{r.pick?.confidence ? Math.round(r.pick.confidence * 100) + "%" : "-"}</td>
              <td>{r.odds?.spread_point ? `${r.homeTeam} ${r.odds.spread_point} (${r.odds.spread_home_line})` : "-"}</td>
              <td>-</td>
              <td>{r.odds?.total_points ? `O/U ${r.odds.total_points}` : "-"}</td>
              <td>-</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
