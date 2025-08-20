// src/MLB.jsx — v5.4
// Ensures a DEFAULT EXPORT so App.jsx `import MLB from "./MLB.jsx"` works.
// Includes: Generate button, Pure EV table, algo tweaks (pitch-fit, veteran dampen, exploitable flag).

import React, { useEffect, useState, useCallback } from "react";
import { pitchTypeFitMultiplier_v3, veteranRelianceDampen_v1, moderatePowerExploitable_v1 } from "./lib/hr-factors_v4";

export default function MLB() {
  const [rows, setRows] = useState([]);
  const [pureEV, setPureEV] = useState([]);
  const [busy, setBusy] = useState(false);
  const EV_FLOOR = Number(import.meta.env.VITE_PURE_EV_FLOOR ?? 0.22);

  const buildAll = useCallback((data) => {
    const built = (data?.candidates ?? []).map(buildRow);
    built.sort((a,b) => b.p_model - a.p_model);
    setRows(built);
    const evList = built
      .filter(r => (r.p_model ?? 0) >= EV_FLOOR && typeof r.ev === "number")
      .slice()
      .sort((a,b)=>b.ev - a.ev)
      .slice(0, 13);
    setPureEV(evList);
  }, [EV_FLOOR]);

  useEffect(() => {
    (async () => {
      const data = await loadModelJson();
      if (data) buildAll(data);
    })();
  }, [buildAll]);

  async function loadModelJson() {
    try {
      const r = await fetch("/data/mlb.json", { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      console.error("loadModelJson error", e);
      return null;
    }
  }

  async function regenerate() {
    const REFRESH_ENDPOINT = import.meta.env.VITE_REFRESH_ENDPOINT || "/.netlify/functions/odds-refresh-multi";
    setBusy(true);
    try {
      try {
        await fetch(REFRESH_ENDPOINT + "?mode=hr-only", { method: "POST" });
      } catch (e) {
        console.warn("refresh endpoint not available:", e?.message || e);
      }
      const data = await loadModelJson();
      if (data) buildAll(data);
    } finally {
      setBusy(false);
    }
  }

  function decimalFromAmerican(american) {
    if (american == null) return null;
    const a = Number(american);
    if (!Number.isFinite(a) || a === 0) return null;
    return a > 0 ? 1 + a/100 : 1 + 100/Math.abs(a);
  }

  function buildRow(x) {
    const name = x?.name ?? x?.player ?? "—";
    const game = x?.game ?? `${x?.away ?? "?"}@${x?.home ?? "?"}`;
    let p = Number(x?.p_model ?? x?.modelProb ?? 0);
    if (!Number.isFinite(p) || p <= 0) p = 0;

    // New factors (safe no-ops if fields missing)
    const mPitch = pitchTypeFitMultiplier_v3(x?.vsPitchDamage, x?.pitcherTopPitch, x?.pitcherMix);
    const mVet   = veteranRelianceDampen_v1(x?.seasonHRPace, x?.careerHR, x?.age);
    const modPow = moderatePowerExploitable_v1(p, x?.seasonHRPace, x?.vsPitchDamage, x?.pitcherTopPitch, x?.pitcherMix);
    const mult   = Math.max(0.85, Math.min(1.15, mPitch * mVet * (modPow?.mult ?? 1)));
    p = Math.max(0, Math.min(0.95, p * mult));

    const modelDec = p > 0 ? 1 / p : null;
    const modelAmerican = modelDec
      ? (modelDec >= 2 ? Math.round((modelDec - 1) * 100) : Math.round(-100 / (modelDec - 1)))
      : null;

    const american = x?.american ?? x?.oddsAmerican ?? null;
    const dec = decimalFromAmerican(american) ?? modelDec;
    const ev = (typeof p === "number" && typeof dec === "number") ? (p * (dec - 1) - (1 - p)) : null;

    const whys = [];
    if (x?.why) whys.push(x.why);
    if (modPow?.tag) whys.push(modPow.tag);
    const top = x?.pitcherTopPitch ? String(x.pitcherTopPitch).toUpperCase().slice(0,2) : null;
    if (top && x?.vsPitchDamage && typeof x.vsPitchDamage[top] === "number" && x.vsPitchDamage[top] >= 1.10) {
      whys.push(`fits vs ${x.pitcherTopPitch}`);
    }

    return {
      name,
      game,
      p_model: p,
      modelAmerican,
      american,
      ev: ev ?? 0,
      why: whys.join(" • ") || "",
    };
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">MLB HR — Calibrated + Hot/Cold + Odds-first EV</h1>
        <button
          onClick={regenerate}
          disabled={busy}
          className={`px-3 py-1 rounded ${busy ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          aria-busy={busy}
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>

      {/* Main Picks */}
      {Array.isArray(rows) && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-3 py-2 text-right">Model HR%</th>
                <th className="px-3 py-2 text-right">Model Odds</th>
                <th className="px-3 py-2 text-right">Actual Odds</th>
                <th className="px-3 py-2 text-right">EV (1u)</th>
                <th className="px-3 py-2 text-left">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 13).map((r, i) => (
                <tr key={`pick-${i}`} className="border-b">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.game}</td>
                  <td className="px-3 py-2 text-right">{(r.p_model * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{r.modelAmerican > 0 ? `+${r.modelAmerican}` : r.modelAmerican}</td>
                  <td className="px-3 py-2 text-right">{r.american > 0 ? `+${r.american}` : r.american}</td>
                  <td className="px-3 py-2 text-right">{Number(r.ev ?? 0).toFixed(3)}</td>
                  <td className="px-3 py-2">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pure EV (with floor) */}
      {Array.isArray(pureEV) && pureEV.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">
            Best EV (floor ≥ {(EV_FLOOR * 100).toFixed(0)}% model HR)
          </h2>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-left">Game</th>
                  <th className="px-3 py-2 text-right">Model HR%</th>
                  <th className="px-3 py-2 text-right">Model Odds</th>
                  <th className="px-3 py-2 text-right">Actual Odds</th>
                  <th className="px-3 py-2 text-right">EV (1u)</th>
                  <th className="px-3 py-2 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {pureEV.map((r, i) => (
                  <tr key={`pureev-${i}`} className="border-b">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.game}</td>
                    <td className="px-3 py-2 text-right">{(r.p_model * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{r.modelAmerican > 0 ? `+${r.modelAmerican}` : r.modelAmerican}</td>
                    <td className="px-3 py-2 text-right">{r.american > 0 ? `+${r.american}` : r.american}</td>
                    <td className="px-3 py-2 text-right">{Number(r.ev ?? 0).toFixed(3)}</td>
                    <td className="px-3 py-2">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">
              EV(1u) = p·(decimal−1) − (1−p). Uses book odds when available, else model odds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
