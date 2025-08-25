
// src/NFL.jsx
import { useEffect, useState } from "react";

export default function NFL() {
  const [status, setStatus] = useState("bootstrapping");
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // 1) Bootstrap with weekly roll-forward
        await fetch("/.netlify/functions/nfl-bootstrap?refresh=1&mode=auto", {
          headers: { accept: "application/json" }
        }).then(r => r.json()).catch(()=>null);

        // 2) Get candidates (debug helps us surface any schedule issues)
        const c = await fetch("/.netlify/functions/nfl-td-candidates?debug=1", {
          headers: { accept: "application/json" }
        }).then(r => r.json());
        if (!c?.ok) {
          setStatus("error");
          setErr(c?.error || "unknown error");
          setInfo(c?.diag || null);
          return;
        }
        setRows(c.candidates || []);
        setInfo({ season: c.season, week: c.week, games: c.games });
        setStatus("done");
      } catch (e) {
        setStatus("error");
        setErr(String(e));
      }
    })();
  }, []);

  return (
    <div className="container" style={{padding:"1rem"}}>
      <h1>NFL — Anytime TD</h1>
      <p>Status: {status}{info ? ` • Season ${info.season ?? ""} Week ${info.week ?? ""} • Games ${info.games ?? ""}` : ""}</p>
      {err && <pre style={{background:"#fee", padding:"0.5rem", border:"1px solid #f99"}}>{err}</pre>}
      {status === "done" && rows.length === 0 && <p>No candidates yet.</p>}
      {rows.length > 0 && (
        <table border="1" cellPadding="6" cellSpacing="0">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Model TD%</th>
              <th>RZ path</th>
              <th>EXP path</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.player}</td>
                <td>{r.pos}</td>
                <td>{r.modelTdPct}%</td>
                <td>{r.rzPath}%</td>
                <td>{r.expPath}%</td>
                <td>{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
