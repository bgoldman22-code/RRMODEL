import React from "react";

export default function NFLPredictionsActions() {
  const hit = (url) => {
    fetch(url, { method: "POST" })
      .then(r => r.text())
      .then(t => { try { console.log(JSON.parse(t)); } catch { console.warn("Raw:", t); } });
  };
  return (
    <div className="mb-4 space-x-2">
      <button onClick={() => hit("/.netlify/functions/nfl-predictions-train?open=1")} className="bg-green-600 text-white px-3 py-1 rounded">
        Train Now
      </button>
      <button onClick={() => hit("/.netlify/functions/nfl-predictions-score")} className="bg-green-600 text-white px-3 py-1 rounded">
        Rescore Now
      </button>
    </div>
  );
}
