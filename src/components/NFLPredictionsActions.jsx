import React, { useState } from "react";

/**
 * Small action panel with "Train now" and "Rescore now" buttons.
 * Calls Netlify Functions and shows JSON (or raw text) results.
 * Training allows an open trigger via `?open=1` so you can run it without a secret.
 */
export default function NFLPredictionsActions({ className = "" }) {
  const [trainStatus, setTrainStatus] = useState(null);
  const [scoreStatus, setScoreStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function callFn(path) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST" }); // POST so it can't be pre-rendered/cached
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        return { ok: false, raw: text, note: "Non-JSON response" };
      }
    } catch (e) {
      return { ok: false, error: String(e) };
    } finally {
      setBusy(false);
    }
  }

  const onTrain = async () => {
    setTrainStatus({ working: true });
    const out = await callFn("/.netlify/functions/nfl-predictions-train?open=1");
    setTrainStatus(out);
  };

  const onScore = async () => {
    setScoreStatus({ working: true });
    const out = await callFn("/.netlify/functions/nfl-predictions-score");
    setScoreStatus(out);
  };

  return (
    <div className={["rounded-xl border p-3 md:p-4 bg-white/50", className].join(" ")}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-semibold">Maintenance</div>
        <div className="flex gap-2">
          <button
            onClick={onTrain}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            title="Backfill & learn from NFLVerse/ESPN caches (server-side)."
          >
            Train now
          </button>
          <button
            onClick={onScore}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            title="Recompute picks from the latest odds snapshot."
          >
            Rescore now
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
          <div className="font-medium text-emerald-800">Train status</div>
          <pre className="mt-1 overflow-x-auto text-xs text-emerald-900">
{trainStatus ? JSON.stringify(trainStatus, null, 2) : "—"}
          </pre>
        </div>
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-2">
          <div className="font-medium text-indigo-800">Score status</div>
          <pre className="mt-1 overflow-x-auto text-xs text-indigo-900">
{scoreStatus ? JSON.stringify(scoreStatus, null, 2) : "—"}
          </pre>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Tip: these actions hit Netlify Functions. If you prefer a URL trigger instead of buttons,
        call: <code>/.netlify/functions/nfl-predictions-train?open=1</code> and
        <code>/.netlify/functions/nfl-predictions-score</code> directly.
      </div>
    </div>
  );
}