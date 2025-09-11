import React from "react";
import NFLPredictionsActions from "../components/NFLPredictionsActions.jsx";

// Keep this page minimal; your data table rendering lives in your existing component/page.
// This ensures the alias '@' isn't required. If you still prefer '@', the patch adds a Vite alias too.

export default function NFLPredictions() {
  return (
    <div className="max-w-7xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">NFL Predictions</h1>
      <NFLPredictionsActions />
      {/* The rest of your existing table UI remains as-is in your repo */}
    </div>
  );
}
