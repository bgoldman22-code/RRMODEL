import React, { useEffect, useState } from "react";
import NFLPredictionsTable from "../components/NFLPredictionsTable";

const ENDPOINT = "/.netlify/functions/nfl-v41-latest";

export default function NFLV4Page() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(ENDPOINT, { 
          headers: { "cache-control": "no-cache" } 
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
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
        <h1 className="text-2xl font-semibold">
          NFL Predictions V4.1
          <span className="ml-3 text-sm font-normal opacity-60">
            🆕 Direct ML + Elite Spread/Total Models
          </span>
        </h1>
        <p className="text-sm opacity-80 mt-2">
          <strong>Spread & Total:</strong> V3/V4 EPA Model (+37% ROI on spreads) | 
          <strong className="ml-2">Moneyline:</strong> Direct ML Logistic (Platt calibrated, 70.5% holdout AUC, +31% ROI)
        </p>
        <p className="text-xs opacity-60 mt-1">
          Model trained on 2020-2023, validated on 2024 holdout. Perfect monotonicity (1.0). Independent V4.1 pipeline.
        </p>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-medium">Error loading predictions</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}
      
      {isLoading && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-sm opacity-60">Loading V4.1 predictions...</p>
          </div>
        </div>
      )}
      
      {data && !isLoading && (
        <>
          {data.meta && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm">
              <div className="flex flex-wrap gap-4">
                <span><strong>Model:</strong> {data.meta.model}</span>
                <span><strong>Games:</strong> {data.meta.games}</span>
                <span><strong>Updated:</strong> {new Date(data.meta.updated_at).toLocaleString()}</span>
              </div>
            </div>
          )}
          <NFLPredictionsTable data={data} isLoading={false} error={null} />
        </>
      )}
    </div>
  );
}
