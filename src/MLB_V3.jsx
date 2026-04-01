// src/MLB_V3.jsx
// MLB Home Run Model V3 — XGBoost + Statcast pipeline
// Route: /mlb-hr-v3
// DO NOT modify the V2 route (/mlb-hr) or mlb-rr-generate.mjs

import React, { useEffect, useState, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_URL = "/.netlify/functions/mlb-slate-v3";

const GRADE_COLORS = {
  "A+": "bg-emerald-100 text-emerald-800 border border-emerald-300",
  A:   "bg-green-100 text-green-800 border border-green-300",
  "B+": "bg-blue-100 text-blue-800 border border-blue-300",
  B:   "bg-sky-100 text-sky-800 border border-sky-300",
};

const FEATURE_LABELS = {
  hr_rate_bayes:     "HR Rate (Bayes)",
  barrel_pct:        "Barrel %",
  hard_hit_pct:      "Hard Hit %",
  pitcher_barrel:    "Pitcher Barrel Allowed",
  pitcher_rv100:     "Pitcher Arsenal RV/100",
  pitcher_hrfb:      "Pitcher HR/FB",
  park_hr_factor:    "Park HR Factor",
  temp_adj:          "Temp Adjustment",
  wind_adj:          "Wind Adjustment",
  pull_park_score:   "Pull × Park Score",
  pitcher_zone_pct:  "Pitcher Zone %",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtPct(v) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtOdds(v) {
  if (v == null) return "—";
  return v > 0 ? `+${v}` : `${v}`;
}

function fmtUnits(v) {
  if (v == null) return "—";
  return `${v.toFixed(2)}u`;
}

function fmtFeature(key, val) {
  if (val == null) return "—";
  if (key === "hr_rate_bayes")    return val.toFixed(4);
  if (key === "pitcher_rv100")    return val.toFixed(4);
  if (key === "park_hr_factor")   return val.toFixed(3);
  if (key === "pull_park_score")  return val.toFixed(4);
  if (key === "pitcher_zone_pct") return `${(val * 100).toFixed(1)}%`;
  if (key === "temp_adj") return `${val >= 0 ? "+" : ""}${val.toFixed(1)}°F`;
  if (key === "wind_adj") return `${val >= 0 ? "+" : ""}${val.toFixed(1)} mph`;
  return val.toFixed(1);
}

function FreshnessIndicator({ freshness }) {
  if (!freshness) return null;
  const { generated_at, stale, features_missing } = freshness;
  let color = "bg-emerald-500";
  let label = "Live";
  if (features_missing) { color = "bg-red-500"; label = "Features Missing"; }
  else if (stale)       { color = "bg-yellow-400"; label = "Stale (>26h)"; }
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
      <span>{label}</span>
      {generated_at && (
        <span className="text-gray-400">· {new Date(generated_at).toLocaleString()}</span>
      )}
    </div>
  );
}

function GradeBadge({ grade }) {
  if (!grade) return null;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${GRADE_COLORS[grade] || "bg-gray-100 text-gray-700"}`}>
      {grade}
    </span>
  );
}

// ─── Feature Panel (collapsible per-player) ───────────────────────────────────
function FeaturePanel({ player }) {
  const [open, setOpen] = useState(false);
  const features = player.features || {};
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        {open ? "▲" : "▼"} Model inputs
      </button>
      {open && (
        <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-600 bg-gray-50 rounded p-2">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <div key={key} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="font-mono font-medium">{fmtFeature(key, features[key])}</span>
            </div>
          ))}
          {player.blended != null && (
            <div className="col-span-2 flex justify-between border-t pt-1 mt-1">
              <span className="text-gray-500">Stats blend (curr/hist)</span>
              <span className="font-mono">{fmtPct(player.blended_weight)} curr</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Top 10 Candidates Table (always shown) ───────────────────────────────────
function Top10Table({ candidates, showFeatures, onToggleFeatures }) {
  const top10 = (candidates || []).slice(0, 10);
  if (top10.length === 0) return null;
  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-gray-900 text-base">
            Top 10 by Model Probability
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sorted by XGBoost calibrated HR probability · EV threshold not applied · live odds not required
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showFeatures}
            onChange={e => onToggleFeatures(e.target.checked)}
            className="rounded"
          />
          Show model inputs
        </label>
      </div>
      <div className="divide-y">
        {top10.map((p, i) => {
          const hasOdds = p.american_odds != null;
          const hasEV   = p.ev != null;
          return (
            <div key={p.player_id ?? i} className="px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                {/* Rank + name */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-lg font-bold text-gray-300 w-6 shrink-0 text-center">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{p.player_name}</span>
                      {p.grade && <GradeBadge grade={p.grade} />}
                      {!hasOdds && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                          No odds
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {p.team_abbrev ?? p.team} · vs {p.opp_pitcher_name ?? p.opp_pitcher ?? "—"} · {p.venue ?? ""}
                    </div>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex items-center gap-4 shrink-0 text-right text-xs">
                  <div>
                    <div className="font-mono font-bold text-blue-700 text-sm">{fmtPct(p.model_prob)}</div>
                    <div className="text-gray-400">Model P</div>
                  </div>
                  {hasOdds && (
                    <div>
                      <div className="font-mono font-semibold text-gray-700">{fmtOdds(p.american_odds)}</div>
                      <div className="text-gray-400">Odds</div>
                    </div>
                  )}
                  {hasEV && (
                    <div>
                      <div className={`font-mono font-semibold ${p.ev >= 0.25 ? "text-emerald-700" : "text-gray-500"}`}>
                        {fmtPct(p.ev)}
                      </div>
                      <div className="text-gray-400">EV</div>
                    </div>
                  )}
                </div>
              </div>
              {showFeatures && <FeaturePanel player={p} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pick Card (straight bets) ────────────────────────────────────────────────
function PickCard({ pick, showFeatures }) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{pick.player_name}</span>
            <GradeBadge grade={pick.grade} />
            {pick.blended === false && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                Limited history
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {pick.team_abbrev} · vs {pick.opp_pitcher_name || "—"} · {pick.venue || ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-emerald-700">{fmtPct(pick.ev)}</div>
          <div className="text-xs text-gray-400">EV</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="font-mono font-semibold text-gray-800">{fmtPct(pick.model_prob)}</div>
          <div className="text-gray-400">Model P</div>
        </div>
        <div>
          <div className="font-mono font-semibold text-gray-800">{fmtPct(pick.implied_prob)}</div>
          <div className="text-gray-400">Implied</div>
        </div>
        <div>
          <div className="font-mono font-semibold text-gray-800">{fmtOdds(pick.american_odds)}</div>
          <div className="text-gray-400">Odds</div>
        </div>
        <div>
          <div className="font-mono font-semibold text-blue-700">{fmtUnits(pick.kelly_units)}</div>
          <div className="text-gray-400">¼ Kelly</div>
        </div>
      </div>

      {showFeatures && <FeaturePanel player={pick} />}
    </div>
  );
}

// ─── RR Combo Table ───────────────────────────────────────────────────────────
function RRComboTable({ combos, label, totalStake }) {
  if (!combos || combos.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
              <th className="text-left py-2 px-2 border-b">#</th>
              <th className="text-left py-2 px-2 border-b">Players</th>
              <th className="text-right py-2 px-2 border-b">Odds</th>
              <th className="text-right py-2 px-2 border-b">Stake</th>
              <th className="text-right py-2 px-2 border-b">Win</th>
            </tr>
          </thead>
          <tbody>
            {combos.map((c, i) => (
              <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                <td className="py-2 px-2">
                  <div className="flex flex-col gap-0.5">
                    {(c.players || []).map((p, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <GradeBadge grade={p.grade} />
                        <span className="font-medium text-gray-800">{p.player_name}</span>
                        <span className="text-gray-400">{fmtOdds(p.american_odds)}</span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-2 px-2 text-right font-mono font-semibold">{fmtOdds(c.parlay_odds)}</td>
                <td className="py-2 px-2 text-right font-mono text-blue-700">{fmtUnits(c.stake)}</td>
                <td className="py-2 px-2 text-right font-mono text-emerald-700">{fmtUnits(c.win_amount)}</td>
              </tr>
            ))}
          </tbody>
          {totalStake != null && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={3} className="py-2 px-2 text-gray-600 text-right">Total stake</td>
                <td className="py-2 px-2 text-right font-mono text-blue-800">{fmtUnits(totalStake)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── PNG Export ───────────────────────────────────────────────────────────────
function useExportPNG(ref, filename) {
  return useCallback(async () => {
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ref.current, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      link.download = filename;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("Install html2canvas to enable PNG export: npm install html2canvas");
    }
  }, [ref, filename]);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MLB_V3() {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const [showFeatures, setShowFeatures] = useState(false);
  const [showTopFeatures, setShowTopFeatures] = useState(false);
  const rrRef = useRef(null);

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });
    try {
      const res = await fetch(API_URL);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      setState({ status: "ok", data: json, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const exportFilename = `mlb-hr-v3-rr-${new Date().toISOString().slice(0, 10)}.png`;
  const exportPNG = useExportPNG(rrRef, exportFilename);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-gray-500">
        <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading MLB HR V3 slate…</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="max-w-xl mx-auto mt-12 p-6 bg-red-50 border border-red-200 rounded-lg text-center">
        <div className="text-2xl mb-2">⚠️</div>
        <h2 className="font-bold text-red-800 mb-1">Failed to load slate</h2>
        <p className="text-red-600 text-sm mb-4 font-mono break-all">{state.error}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const d = state.data;
  const { rr, qualifying_picks = [], straight_bets = [], candidates = [], meta = {}, data_freshness } = d;
  const x2 = rr?.x2_combos || [];
  const x3 = rr?.x3_combos || [];
  const highConviction = rr?.high_conviction_day;
  const sgpExcluded = rr?.combos_excluded_by_sgp || 0;

  const totalX2Stake = x2.reduce((s, c) => s + (c.stake || 0), 0);
  const totalX3Stake = x3.reduce((s, c) => s + (c.stake || 0), 0);
  const totalRRStake = totalX2Stake + totalX3Stake;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            ⚾ MLB HR Model V3
            <span className="text-sm font-normal bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              XGBoost · AUC 0.654
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
          <div className="mt-1">
            <FreshnessIndicator freshness={data_freshness} />
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-1 text-sm text-gray-600">
          <div>
            <span className="font-semibold">{meta.candidates_total ?? "—"}</span> candidates evaluated
          </div>
          <div>
            <span className="font-semibold text-emerald-700">{meta.qualifying_count ?? qualifying_picks.length}</span> cleared EV ≥ 25%
          </div>
          {meta.odds_source && (
            <div className="text-xs text-gray-400">Odds: {meta.odds_source}</div>
          )}
        </div>
      </div>

      {/* ── Staleness / missing banner ────────────────────────────────────── */}
      {data_freshness?.features_missing && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
          <span>🔴</span>
          <div>
            <span className="font-semibold">Feature data unavailable.</span> The GitHub Actions pipeline
            may not have run yet today. Model probabilities shown are unavailable; odds are live.
          </div>
        </div>
      )}
      {data_freshness?.stale && !data_freshness?.features_missing && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800 flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <span className="font-semibold">Feature data is stale</span> (older than 26 hours).
            Model probabilities may not reflect today's lineup changes.
          </div>
        </div>
      )}

      {/* ── High Conviction Banner ────────────────────────────────────────── */}
      {highConviction && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <div>
            <div className="font-bold text-emerald-900 text-sm">High Conviction Day</div>
            <div className="text-emerald-700 text-xs mt-0.5">
              ≥5 players with model probability ≥ 30%. Top-5 × 3 combos activated.
              Backtest median ROI on these days: <span className="font-semibold">+34.4%</span>.
            </div>
          </div>
        </div>
      )}

      {/* ── Round Robin Section ───────────────────────────────────────────── */}
      {(x2.length > 0 || x3.length > 0) ? (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-gray-900 text-base">Round Robin Combos</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                FanDuel SGP rule applied
                {sgpExcluded > 0 && ` · ${sgpExcluded} same-game combo${sgpExcluded > 1 ? "s" : ""} excluded`}
                {" · "}Total stake: <span className="font-semibold text-blue-700">{fmtUnits(totalRRStake)}</span>
              </p>
            </div>
            <div ref={rrRef} className="hidden" aria-hidden /> {/* export target set below */}
            <button
              onClick={exportPNG}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              📷 Export PNG
            </button>
          </div>
          <div ref={rrRef} className="p-5 space-y-6">
            <RRComboTable
              combos={x2}
              label={`Top-5 × 2 Parlays (${x2.length} combos · ${fmtUnits(totalX2Stake)} total)`}
              totalStake={totalX2Stake}
            />
            {x3.length > 0 && (
              <RRComboTable
                combos={x3}
                label={`Top-5 × 3 Parlays — High Conviction (${x3.length} combos · ${fmtUnits(totalX3Stake)} total)`}
                totalStake={totalX3Stake}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border rounded-xl p-6 text-center text-gray-500 text-sm">
          No round robin combos generated today.
          {qualifying_picks.length === 0
            ? " No players cleared the EV ≥ 25% threshold."
            : ` ${qualifying_picks.length} player(s) cleared EV threshold but fewer than 2 qualify for combos.`}
        </div>
      )}

      {/* ── Straight Bets Section ─────────────────────────────────────────── */}
      {straight_bets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-gray-900 text-base">Straight Bets</h2>
              <p className="text-xs text-gray-500">
                Size independently from RR · ¼ Kelly · Backtest avg straight ROI on RR-zero days: −35%
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFeatures}
                  onChange={e => setShowFeatures(e.target.checked)}
                  className="rounded"
                />
                Show model inputs
              </label>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {straight_bets.map((p, i) => (
              <PickCard key={p.player_id ?? i} pick={p} showFeatures={showFeatures} />
            ))}
          </div>
        </div>
      )}

      {/* ── No picks at all ───────────────────────────────────────────────── */}
      {straight_bets.length === 0 && qualifying_picks.length === 0 && (
        <div className="bg-gray-50 border rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">🔍</div>
          <h3 className="font-semibold text-gray-700 mb-1">No qualifying picks today</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            No players cleared the EV ≥ 25% threshold against today's live FanDuel odds.
            Check back after lineups are confirmed (~2 hours before first pitch).
          </p>
        </div>
      )}

      {/* ── Top 10 by Model Probability (always shown) ───────────────────── */}
      <Top10Table
        candidates={candidates}
        showFeatures={showTopFeatures}
        onToggleFeatures={setShowTopFeatures}
      />

      {/* ── Model Transparency Panel ──────────────────────────────────────── */}
      {qualifying_picks.length > 0 && (
        <ModelTransparencyPanel picks={qualifying_picks} />
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="text-xs text-gray-400 border-t pt-4 space-y-1">
        <div>
          Model: <span className="font-mono">{d.model || "xgb_v1"}</span> ·
          Pipeline: Statcast EV + FanGraphs Pitching + Park Factors ·
          EV threshold: ≥ 25% · Kelly: ¼ × full Kelly, capped 2u, floored 0.25u
        </div>
        <div>
          Bootstrap backtest (2025 holdout): AUC 0.654 · ROI@EV25 +18.3% · p5 +5.6% ·
          RR cumROI +34.4% (high conviction) · Portfolio cumROI +11.6%
        </div>
        <div className="text-gray-300">
          V2 HR model still available at <a href="/mlb-hr" className="underline hover:text-gray-500">/mlb-hr</a>
        </div>
      </div>
    </div>
  );
}

// ─── Model Transparency Panel ─────────────────────────────────────────────────
function ModelTransparencyPanel({ picks }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-sm font-medium text-gray-700"
      >
        <span>🔬 Model Transparency — Feature Values</span>
        <span className="text-gray-400 text-xs">{open ? "collapse ▲" : "expand ▼"}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                <th className="text-left py-2 px-3 border-b sticky left-0 bg-gray-50">Player</th>
                {Object.values(FEATURE_LABELS).map(l => (
                  <th key={l} className="text-right py-2 px-3 border-b whitespace-nowrap">{l}</th>
                ))}
                <th className="text-right py-2 px-3 border-b">Model P</th>
                <th className="text-right py-2 px-3 border-b">EV</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p, i) => {
                const f = p.features || {};
                return (
                  <tr key={p.player_id ?? i} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap">
                      {p.player_name}
                      {p.grade && <GradeBadge grade={p.grade} />}
                    </td>
                    {Object.keys(FEATURE_LABELS).map(key => (
                      <td key={key} className="py-2 px-3 text-right font-mono text-gray-700">
                        {fmtFeature(key, f[key])}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-mono font-semibold text-gray-800">
                      {fmtPct(p.model_prob)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">
                      {fmtPct(p.ev)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
