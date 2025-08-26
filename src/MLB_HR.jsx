// src/MLB_HR.jsx
import React from "react";

export default function MLB_HR() {
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-2">MLB — Home Run Model</h1>
      <p className="text-gray-600 mb-4">
        This page is wired up to satisfy the import and will render once the HR slate endpoint is finalized.
      </p>
      <ul className="list-disc pl-6 text-sm text-gray-700">
        <li>Check odds diagnostics: <code>/.netlify/functions/odds-diag</code></li>
        <li>Game context: <code>/.netlify/functions/mlb-game-context?date=YYYY-MM-DD</code></li>
        <li>If you have a HR slate function, update this component to fetch it and render tables.</li>
      </ul>
    </div>
  );
}
