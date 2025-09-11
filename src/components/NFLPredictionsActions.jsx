import React, { useEffect, useMemo, useState } from "react";

/**
 * Lightweight "green buttons" control surface for NFL Predictions page.
 *
 * - Prompts once for TRAIN_SECRET (stored in localStorage as nfl.trainSecret).
 * - POSTs to /.netlify/functions/nfl-predictions-train and nfl-predictions-score
 *   with header `x-train-secret` to authorize.
 * - Shows last updated timestamps + small diagnostics.
 * - Non-invasive: drop this anywhere in your NFL predictions page.
 */
export default function NFLPredictionsActions({ className = "" }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [lastScoredAt, setLastScoredAt] = useState(null);
  const [lastTrainedAt, setLastTrainedAt] = useState(null);
  const [sampleSize, setSampleSize] = useState(null);

  // Load any cached secret
  useEffect(() => {
    const s = localStorage.getItem("nfl.trainSecret") || "";
    if (s) setSecret(s);
  }, []);

  // Pull current diagnostics from GET endpoint
  async function refreshDiagnostics() {
    try {
      const r = await fetch("/.netlify/functions/nfl-predictions-get", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        // updated = last score time from scorer
        setLastScoredAt(j.updated || null);
        // Optional trainer metadata if provided
        if (j.trainer?.last_trained_at) setLastTrainedAt(j.trainer.last_trained_at);
        if (j.trainer?.sampleSize) setSampleSize(j.trainer.sampleSize);
      }
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    refreshDiagnostics();
  }, []);

  function promptForSecret() {
    const s = window.prompt("Enter TRAIN_SECRET to authorize:", secret || "");
    if (!s) return null;
    localStorage.setItem("nfl.trainSecret", s);
    setSecret(s);
    return s;
  }

  async function postWithSecret(fnPath) {
    setError("");
    setMsg("");
    const s = secret || promptForSecret();
    if (!s) return;
    setBusy(true);
    try {
      const res = await fetch(`/.netlify/functions/${fnPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-train-secret": s
        },
        body: JSON.stringify({ trigger: "manual" })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out?.ok === false) {
        throw new Error(out?.error || `Request failed: ${res.status}`);
      }
      setMsg(out?.message || `OK: ${fnPath} completed`);
      // If endpoints return updated timestamps, surface them
      if (out.updated) setLastScoredAt(out.updated);
      if (out.trained_at) setLastTrainedAt(out.trained_at);
      if (typeof out.sampleSize === "number") setSampleSize(out.sampleSize);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
      refreshDiagnostics();
    }
  }

  const nice = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <div className={`mt-4 rounded-2xl border p-4 shadow-sm bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold"
          disabled={busy}
          onClick={() => postWithSecret("nfl-predictions-train")}
          title="Ingest latest data + retrain feature weights with recency bias"
        >
          {busy ? "Running…" : "Run Learn Now"}
        </button>
        <button
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold"
          disabled={busy}
          onClick={() => postWithSecret("nfl-predictions-score")}
          title="Recompute weekly game picks + parlays from current model + odds"
        >
          {busy ? "Scoring…" : "Rescore Now"}
        </button>

        <button
          className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
          disabled={busy}
          onClick={refreshDiagnostics}
          title="Refresh diagnostics"
        >
          Refresh
        </button>

        <div className="ml-auto text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1">
          <span><span className="font-semibold">Last Trained:</span> {nice(lastTrainedAt)}</span>
          <span><span className="font-semibold">Last Scored:</span> {nice(lastScoredAt)}</span>
          <span><span className="font-semibold">Sample Size:</span> {sampleSize ?? "—"}</span>
        </div>
      </div>

      {(msg || error) && (
        <div className="mt-3 text-sm">
          {msg && <div className="text-green-700">{msg}</div>}
          {error && <div className="text-red-600">{error}</div>}
        </div>
      )}
    </div>
  );
}
