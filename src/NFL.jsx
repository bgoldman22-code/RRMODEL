
import React, { useEffect, useState } from "react";

export default function NFL() {
  const [state, setState] = useState({ status: "bootstrapping", rows: [], meta: null, error: null });

  async function load() {
    setState(s => ({ ...s, status: "bootstrapping" }));
    // ensure schedule & depth exist
    const b = await fetch("/.netlify/functions/nfl-bootstrap?refresh=1").then(r=>r.json()).catch(()=>null);
    if (!b || !b.ok) {
      setState({ status: "error", rows: [], meta: null, error: "bootstrap failed" });
      return;
    }
    const c = await fetch("/.netlify/functions/nfl-td-candidates").then(r=>r.json()).catch(()=>null);
    if (!c || !c.ok) {
      setState({ status: "error", rows: [], meta: b, error: c?.error || "candidates failed" });
      return;
    }
    setState({ status: "done", rows: c.candidates || [], meta: { season:c.season, week:c.week, games:c.games }, error: null });
  }

  useEffect(()=>{ load(); }, []);

  return (
    <div className="container">
      <h2>NFL — Anytime TD</h2>
      <p>status: {state.status}</p>
      {state.error && <pre style={{whiteSpace:"pre-wrap"}}>{String(state.error)}</pre>}
      {state.meta && <p>Season {state.meta.season} • Week {state.meta.week} • Games {state.meta.games}</p>}
      {state.rows.length === 0 ? (
        <p>No candidates yet.</p>
      ) : (
        <table className="basic">
          <thead>
            <tr>
              <th>Player</th><th>Pos</th><th>Model TD%</th><th>RZ path</th><th>EXP path</th><th>Why</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((r, i) => (
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
