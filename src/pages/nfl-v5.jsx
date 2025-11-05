import React, { useEffect, useState } from "react";
import NFLPredictionsTable from "../components/NFLPredictionsTable";

const V5_ENDPOINT = "/.netlify/functions/nfl-v5-latest";
const FALLBACK_ENDPOINT = "/.netlify/functions/nfl-predictions-get"; // Temporary fallback

export default function NFLV5Page() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      setUsingFallback(false);
      
      try {
        // Try V5 endpoint first
        const res = await fetch(V5_ENDPOINT, { 
          headers: { "cache-control": "no-cache" } 
        });
        
        if (!res.ok) {
          // If V5 fails, try fallback
          console.log("V5 endpoint not ready, using fallback...");
          const fallbackRes = await fetch(FALLBACK_ENDPOINT, {
            headers: { "cache-control": "no-cache" }
          });
          
          if (!fallbackRes.ok) {
            throw new Error(`No predictions available (HTTP ${fallbackRes.status})`);
          }
          
          const fallbackJson = await fallbackRes.json();
          if (!cancelled) {
            setData(fallbackJson);
            setUsingFallback(true);
          }
          return;
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
          NFL Predictions V5
          <span className="ml-3 text-sm font-normal opacity-60">
            🏆 Hybrid Best-of-Breed Models
          </span>
        </h1>
        <p className="text-sm opacity-80 mt-2">
          <strong>Spread:</strong> Poisson EPA Model (+37% ROI, 2020-2024 backtest) | 
          <strong className="ml-2">Total:</strong> Quantile Blend (25th/75th percentiles, pace-adjusted)
        </p>
        <p className="text-xs opacity-60 mt-1">
          V5 uses the most profitable model for each bet type. Moneyline predictions omitted (awaiting profitable model).
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
            <p className="text-sm opacity-60">Loading V5 predictions...</p>
          </div>
        </div>
      )}
      
      {data && !isLoading && (
        <>
          {usingFallback && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-sm">
              <p className="text-yellow-900 font-medium">⚠️ Using Temporary Fallback Data</p>
              <p className="text-yellow-700 text-xs mt-1">
                V5 predictions will be available after the first scheduled refresh (10:00 UTC daily).
                Currently showing existing predictions.
              </p>
            </div>
          )}
          {data.meta && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm">
              <div className="flex flex-wrap gap-4 mb-2">
                <span><strong>Model:</strong> {usingFallback ? "V3 (Fallback)" : "V5 Hybrid"}</span>
                <span><strong>Games:</strong> {data.meta.games || data.rows?.length}</span>
                <span><strong>Week:</strong> {data.meta.week} ({data.meta.season})</span>
                <span><strong>Updated:</strong> {new Date(data.meta.updated_at || data.updated).toLocaleString()}</span>
              </div>
              {data.meta.models && !usingFallback && (
                <div className="text-xs opacity-75 mt-2 space-y-1">
                  <div><strong>Spread:</strong> {data.meta.models.spread}</div>
                  <div><strong>Total:</strong> {data.meta.models.total}</div>
                  <div><strong>Moneyline:</strong> {data.meta.models.moneyline}</div>
                </div>
              )}
            </div>
          )}
          <NFLPredictionsTable data={data} isLoading={false} error={null} />
        </>
      )}
      
      {data && !isLoading && data.meta?.notes && (
        <div className="mt-4 text-xs opacity-60 space-y-1">
          {data.meta.notes.map((note, i) => (
            <div key={i}>• {note}</div>
          ))}
        </div>
      )}
    </div>
  );
}
