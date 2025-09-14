import React, { useEffect, useState } from "react";
import NFLPredictionsTable from "../components/NFLPredictionsTable";

export default function NFLPredictionsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const resp = await fetch("/.netlify/functions/nfl-predictions-generate");
        const json = await resp.json();
        if (!json.ok) throw new Error(json.error || "Failed");
        setRows(json.rows || []);
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="page">
      <h1>NFL Predictions</h1>
      {loading && <div>Loading…</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && <NFLPredictionsTable rows={rows} />}
    </div>
  );
}
