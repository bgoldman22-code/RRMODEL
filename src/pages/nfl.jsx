import React, { useEffect, useState } from "react";
import NFLPredictionsTable from "../components/NFLPredictionsTable";

const ENDPOINT = "/.netlify/functions/nfl-predictions-generate";

export default function NFLPage() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        // Ask backend for hybrid picks (model + odds wiring)
        const url = `${ENDPOINT}?mode=hybrid&v=2`;
        const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">NFL Predictions</h1>
        <p className="text-sm opacity-80">
          Moneyline, Spread, and Over/Under picks with calibrated confidence. Powered by your model; odds used only to map markets/lines.
        </p>
      </div>
      <NFLPredictionsTable data={data} isLoading={isLoading} error={error} />
    </div>
  );
}
