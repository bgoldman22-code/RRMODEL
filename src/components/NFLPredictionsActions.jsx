import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "rr.train.secret";

function fmtDate(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}

export default function NFLPredictionsActions() {
  const [secret, setSecret] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [meta, setMeta]   = useState({ trained_at: null, updated: null, sampleSize: null });
  const [busy, setBusy]   = useState({ learn: false, score: false });

  useEffect(() => {
    // hydrate diagnostics from GET endpoint on mount
    (async () => {
      try {
        const r = await fetch("/.netlify/functions/nfl-predictions-get");
        const j = await r.json();
        const sample = Array.isArray(j?.rows) ? j.rows.length : (j?.count ?? null);
        setMeta(m => ({ ...m, updated: j?.updated || m.updated, sampleSize: sample }));
      } catch {}
    })();
  }, []);

  const header = useMemo(() => ({
    "content-type": "application/json",
    ...(secret ? { "x-train-secret": secret } : {}),
  }), [secret]);

  async function ensureSecret() {
    let s = secret;
    if (!s) {
      s = prompt("Enter TRAIN_SECRET to run this action:");
      if (!s) return null;
      localStorage.setItem(STORAGE_KEY, s);
      setSecret(s);
    }
    return s;
  }

  async function run(path, which) {
    const s = await ensureSecret();
    if (!s) return;
    setBusy(b => ({ ...b, [which]: true }));
    try {
      const res = await fetch(path, { method: "POST", headers: header });
      const text = await res.text();
      let j;
      try { j = JSON.parse(text); } catch { j = { ok: false, error: "Non-JSON response", raw: text }; }
      setMeta(m => ({
        trained_at: j?.trained_at ?? m.trained_at,
        updated: j?.updated ?? m.updated,
        sampleSize: typeof j?.sampleSize === "number" ? j.sampleSize : m.sampleSize,
      }));
      alert(j?.ok ? "✅ Success" : `⚠️ Check logs — ${j?.error || "ok=false"}`);
      if (!j?.ok) console.error("Action error payload:", j);
    } catch (e) {
      console.error(e);
      alert("Action failed — see console for details.");
    } finally {
      setBusy(b => ({ ...b, [which]: false }));
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            disabled={busy.learn}
            onClick={() => run("/.netlify/functions/nfl-predictions-train", "learn")}
          >
            {busy.learn ? "Learning…" : "Run Learn Now"}
          </button>
          <button
            className="px-3 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            disabled={busy.score}
            onClick={() => run("/.netlify/functions/nfl-predictions-score", "score")}
          >
            {busy.score ? "Rescoring…" : "Rescore Now"}
          </button>
        </div>

        <div className="text-sm grid grid-cols-1 md:grid-cols-3 gap-2">
          <div><span className="text-gray-500">Last Trained:</span> <span className="font-medium">{fmtDate(meta.trained_at)}</span></div>
          <div><span className="text-gray-500">Last Scored:</span> <span className="font-medium">{fmtDate(meta.updated)}</span></div>
          <div><span className="text-gray-500">Sample Size:</span> <span className="font-medium">{meta.sampleSize ?? "—"}</span></div>
        </div>
      </div>

      <hr className="my-4 border-gray-200" />
    </div>
  );
}
