import React, { useEffect, useState } from "react";

export default function NFLPredictions() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/.netlify/functions/nfl-predictions-generate")
      .then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, []);

  return (
    <div className="nfl-preds">
      <h2>NFL Predictions</h2>
      <table>
        <thead>
          <tr>
            <th>Matchup</th><th>Moneyline</th><th>Conf</th><th>Spread</th><th>Conf</th><th>Total</th><th>Conf</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.matchup}</td>
              <td>{r.moneylineText}</td>
              <td>{(r.moneylineConf*100).toFixed(0)}%</td>
              <td>{r.spreadText}</td>
              <td>{(r.spreadConf*100).toFixed(0)}%</td>
              <td>{r.totalText}</td>
              <td>{(r.totalConf*100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
