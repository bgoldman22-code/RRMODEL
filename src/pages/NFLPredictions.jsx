// src/pages/NFLPredictions.jsx
import React from "react";

export default function NFLPredictions() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    const url = "/.netlify/functions/nfl-predictions-generate";
    fetch(url)
      .then(r => r.json())
      .then(j => {
        if (j?.ok) setRows(j.rows || []);
        else setErr(j?.error || "Unknown error");
      })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const Header = () => (
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
  );

  const Row = ({ r }) => {
    const moneylineTxt = r.moneyline ? `${r.moneyline.team}${r.moneyline.price!=null ? ` (${r.moneyline.price>=0?'+':''}${r.moneyline.price})` : ""}` : "-";
    const spreadTxt = r.spread ? `${r.spread.team} ${r.spread.line}${r.spread.price!=null ? ` (${r.spread.price>=0?'+':''}${r.spread.price})` : ""}` : "-";
    const totalTxt = r.total ? `${r.total.side} ${r.total.line}${r.total.price!=null ? ` (${r.total.price>=0?'+':''}${r.total.price})` : ""}` : "-";
    const fmt = (p) => p==null ? "-" : `${Math.round(p*100)}%`;
    return (
      <tr>
        <td>{r.matchup}</td>
        <td>{new Date(r.kickoff).toLocaleString()}</td>
        <td>{moneylineTxt}</td>
        <td>{fmt(r.moneyline?.confidence)}</td>
        <td>{spreadTxt}</td>
        <td>{fmt(r.spread?.confidence)}</td>
        <td>{totalTxt}</td>
        <td>{fmt(r.total?.confidence)}</td>
      </tr>
    );
  };

  if (loading) return <div>Loading…</div>;
  if (err) return <div style={{color:"crimson"}}>Error: {String(err)}</div>;

  return (
    <div style={{padding:"1rem"}}>
      <h1>NFL Predictions</h1>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <Header />
          <tbody>
            {rows.map((r) => <Row key={r.id || r.matchup} r={r} />)}
          </tbody>
        </table>
      </div>
      <style>{`
        table th, table td { padding: 8px 10px; border-bottom: 1px solid #eee; text-align: left; }
        thead th { position: sticky; top: 0; background: #fafafa; z-index: 1; }
        tr:hover { background: #fffdf7; }
      `}</style>
    </div>
  );
}