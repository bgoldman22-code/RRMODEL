import React, { useState, useEffect } from "react";
import NFLPredictionsTable from "../components/NFLPredictionsTable";

export default function NFLPredictions() {
  const [state, setState] = useState({ rows: [], ok: false, updated: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchPredictions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/nfl-predictions-get", { cache: "no-store" });
      const data = await res.json();
      setState(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function generatePredictions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/nfl-predictions-generate?force=true", { method: "POST" });
      const data = await res.json();
      setState(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPredictions(); }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">NFL Predictions</h1>
        <button
          onClick={generatePredictions}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-gray-300 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Working..." : "Generate New Predictions"}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <NFLPredictionsTable rows={state.rows} />
    </div>
  );
}
