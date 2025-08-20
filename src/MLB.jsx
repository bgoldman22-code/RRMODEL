
import React, { useEffect, useMemo, useState } from "react";

/**
 * MLB HR — Calibrated + Hot/Cold + Odds-first EV
 * Patch: show-fallback-v1
 *
 * Goals
 * - Model-first join: we only score players that exist in candidates.json if available.
 * - If no candidates load, we optionally show an odds-only fallback list (clearly labeled).
 * - Restore four tables (Main, Bonus, Straight Prob, Pure EV with floor).
 * - Ensure header summary is back.
 * - Guard multipliers: if any input is missing, multiplier becomes 1.
 * - Cleanup formatting, +odds, EV, alignment.
 */

// ---------- Tunables ----------
const MAIN_TABLE_SIZE = 12;
const PURE_PROB_SIZE = 13;
const PURE_EV_SIZE = 13;
const PURE_EV_FLOOR = 0.25;      // 25% floor for Pure EV table
const EV_THRESHOLD = 0.0005;     // Minimum EV for main picks
const EV_NEAR = 0.001;           // ± window for "near threshold" (bonus picks)
const SHOW_ODDS_FALLBACK_DEFAULT = true;   // show odds-only when candidates are unavailable

// Candidate & odds sources (first that returns JSON is used)
const CANDIDATE_URLS = [
  "/api/mlb-hr-candidates",
  "/.netlify/blobs/rrmodelblobs/mlb-hr-candidates.json",
  "/data/mlb-hr-candidates.json"
];

// NOTE: odds-get on your site already aggregates FanDuel batter_home_runs O0.5
const ODDS_URLS = [
  "/.netlify/functions/odds-get", // returns {offers:[...]} or your enhanced payload
  "/.netlify/functions/odds-refresh-multi", // as a backup
];

// ---------- Helpers ----------

function fmtOdds(american) {
  if (american == null || Number.isNaN(+american)) return "—";
  const n = +american;
  return n > 0 ? `+${n}` : `${n}`;
}

function impliedProbFromOdds(american) {
  const n = +american;
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

function probToModelOdds(p) {
  // model odds mirror how we show "Model Odds"
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const american = p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
  return american;
}

function computeEV(prob, american, stake = 1) {
  if (!Number.isFinite(prob) || !Number.isFinite(+american)) return 0;
  // EV(1u) with American odds payout
  const dec = +american > 0 ? 1 + (+american / 100) : 1 + (100 / Math.abs(+american));
  // Profit on win is (dec - 1); expected value = p*(dec-1) - (1-p)*1
  return prob * (dec - 1) - (1 - prob) * 1;
}

// Safe guard: return 1 if inputs missing
function hotColdMultiplier(recentHRs7d, paLast50) {
  let m = 1;
  if (typeof recentHRs7d === "number" && recentHRs7d > 0) m *= 1.04;
  if (typeof paLast50 === "number" && paLast50 > 30) m *= 1.01;
  return m;
}

// Pitch-type fit: if we have evidence, bump slightly; otherwise 1.
function pitchFitMultiplier(vsPitchDamageScore) {
  if (!Number.isFinite(vsPitchDamageScore)) return 1;
  // map score ~[0..1] -> 1.00 .. 1.05
  const clamped = Math.max(0, Math.min(1, vsPitchDamageScore));
  return 1 + clamped * 0.05;
}

// Combine multipliers safely
function applyMultipliers(baseProb, mList) {
  if (!Number.isFinite(baseProb)) return null;
  let m = 1;
  for (const k of mList) {
    const v = Number.isFinite(k) ? k : 1;
    if (v > 0) m *= v;
  }
  return Math.max(0, Math.min(0.95, baseProb * m)); // cap at 95% for sanity
}

async function fetchJsonFirst(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      return { url: u, json: j };
    } catch {}
  }
  return { url: null, json: null };
}

// Normalize odds-get payload to a map: name -> best american odds (number)
function indexOdds(oddsJson) {
  const map = new Map();
  if (!oddsJson) return map;

  const offers = oddsJson.offers || oddsJson.data || [];
  for (const o of offers) {
    const player = o.player || o.name || o.outcome || "";
    const american = o.american ?? o.price ?? null;
    const point = o.point ?? null;
    const market = o.market || "";
    if (!player || point !== 0.5) continue;
    if ((market || "").toLowerCase().includes("home_runs")) {
      const curr = map.get(player);
      const n = +american;
      if (Number.isFinite(n)) {
        // keep the BEST (i.e., highest positive or most negative? We want highest payout => largest decimal)
        // For simplicity, keep max by implied edge: positive odds higher is better; if negative, keep the more negative?
        // Easiest: keep the one with higher decimal payout:
        const dec = n > 0 ? 1 + (n / 100) : 1 + (100 / Math.abs(n));
        const currDec = curr != null ? (curr > 0 ? 1 + curr/100 : 1 + 100/Math.abs(curr)) : -1;
        if (dec > currDec) map.set(player, n);
      }
    }
  }
  return map;
}

// ---------- UI ----------

export default function MLB() {
  const [dt, setDt] = useState(() => new Date());
  const [usingOddsApi, setUsingOddsApi] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [oddsMap, setOddsMap] = useState(new Map());
  const [showOddsFallback, setShowOddsFallback] = useState(SHOW_ODDS_FALLBACK_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  async function loadAll() {
    setLoading(true);
    setNote("");

    // load odds first to populate header
    const { url: oddsUrl, json: oddsJson } = await fetchJsonFirst(ODDS_URLS);
    if (oddsJson) setUsingOddsApi(true);
    setOddsMap(indexOdds(oddsJson));

    // then candidates
    const { url: candUrl, json: candJson } = await fetchJsonFirst(CANDIDATE_URLS);
    if (candJson && Array.isArray(candJson.candidates)) {
      setCandidates(candJson.candidates);
      setNote("");
    } else if (Array.isArray(candJson)) {
      // Some builds store bare array
      setCandidates(candJson);
      setNote("");
    } else {
      setCandidates([]);
      setNote("Model candidates unavailable. "
        + (SHOW_ODDS_FALLBACK_DEFAULT
          ? "Showing odds-only fallback below."
          : "Showing no picks to avoid odds-only noise.")
      );
    }

    setDt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    // Lazy-load once; user can press Generate again any time.
  }, []);

  const rows = useMemo(() => {
    // If we have candidates, score them; otherwise optionally show odds-only
    if (candidates.length > 0) {
      return candidates.map(c => {
        const name = c.player || c.name;
        const baseProb = c.modelHR || c.modelProb || c.hrProb || c.prob; // tolerate different keys
        const odds = oddsMap.get(name);
        const hcMul = hotColdMultiplier(c.recentHRs7d, c.paLast50);
        const ptMul = pitchFitMultiplier(c.pitchTypeFitScore);
        const prob = applyMultipliers(baseProb, [hcMul, ptMul]);

        const modelOdds = probToModelOdds(prob);
        const ev = computeEV(prob, odds);

        const whyBits = [];
        if (Number.isFinite(c.modelRaw)) whyBits.push(`model ${Math.round(c.modelRaw*1000)/10}%`);
        if (Number.isFinite(c.hotColdAdj)) whyBits.push(`hot/cold ${c.hotColdAdj > 0 ? "+" : ""}${Math.round(c.hotColdAdj*100)}%`);
        if (Number.isFinite(c.parkHRDelta)) whyBits.push(`park HR ${c.parkHRDelta>0?"+":""}${Math.round(c.parkHRDelta*100)}%`);
        if (odds != null) whyBits.push(`odds ${fmtOdds(odds)}`);

        return {
          name,
          game: c.game || c.matchup || "",
          prob: prob ?? baseProb ?? null,
          modelOdds,
          actualOdds: odds,
          ev,
          why: whyBits.join(" • ") || "—",
        };
      }).filter(r => Number.isFinite(r.prob));
    }

    // odds-only fallback
    if (!showOddsFallback) return [];
    const items = [];
    for (const [name, american] of oddsMap.entries()) {
      items.push({
        name,
        game: "", // unknown here
        prob: impliedProbFromOdds(american),
        modelOdds: probToModelOdds(impliedProbFromOdds(american)),
        actualOdds: american,
        ev: 0,
        why: "implied from market; fallback",
      });
    }
    // sort by prob desc, trim to a reasonable size
    return items.sort((a,b)=> (b.prob||0)-(a.prob||0)).slice(0, 40);
  }, [candidates, oddsMap, showOddsFallback]);

  // Slices
  const mainPicks = useMemo(() => rows
    .filter(r => Number.isFinite(r.ev) && r.ev >= EV_THRESHOLD)
    .sort((a,b)=> b.ev - a.ev)
    .slice(0, MAIN_TABLE_SIZE)
  , [rows]);

  const bonusPicks = useMemo(() => rows
    .filter(r => Number.isFinite(r.ev) && r.ev >= 0 && r.ev < EV_THRESHOLD + EV_NEAR)
    .sort((a,b)=> b.ev - a.ev)
    .slice(0, MAIN_TABLE_SIZE)
  , [rows]);

  const straightProb = useMemo(() => rows
    .slice()
    .sort((a,b)=> (b.prob||0) - (a.prob||0))
    .slice(0, PURE_PROB_SIZE)
  , [rows]);

  const pureEV = useMemo(() => rows
    .filter(r => (r.prob || 0) >= PURE_EV_FLOOR)
    .slice()
    .sort((a,b)=> (b.ev||0) - (a.ev||0))
    .slice(0, PURE_EV_SIZE)
  , [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">MLB HR — Calibrated + Hot/Cold + Odds-first EV</h1>
        <button
          onClick={loadAll}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {loading ? "Loading..." : "Generate"}
        </button>
      </div>

      <div className="text-gray-700">
        <strong>Date (ET):</strong> {new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,10)}{" "}
        • <strong>Candidates:</strong> {candidates.length}{" "}
        • <strong>Using OddsAPI:</strong> {usingOddsApi ? "yes" : "no"}{" "}
        • <strong>Calibration scale:</strong> 1.00
      </div>

      {note && (
        <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900">
          {note}{" "}
          <label className="ml-2 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOddsFallback}
              onChange={e => setShowOddsFallback(e.target.checked)}
            />
            Show odds-only fallback when model is empty
          </label>
        </div>
      )}

      <Section title="Main picks (EV-first)" rows={mainPicks} />
      <Section title="Bonus picks (near threshold)" rows={bonusPicks} />
      <Section title="Straight HR Bets (Top 13 Raw Probability)" rows={straightProb} />
      <Section title={`Pure EV (Top 13, floor ${Math.round(PURE_EV_FLOOR*100)}%)`} rows={pureEV} />
    </div>
  );
}

function Section({ title, rows }) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {(!rows || rows.length === 0) ? (
        <div className="text-gray-500">No rows</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <Th>Player</Th>
                <Th>Game</Th>
                <Th>Model HR%</Th>
                <Th>Model Odds</Th>
                <Th>Actual Odds</Th>
                <Th>EV (1u)</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <Td className="font-medium">{r.name}</Td>
                  <Td>{r.game || "—"}</Td>
                  <Td>{Number.isFinite(r.prob) ? `${(r.prob*100).toFixed(1)}%` : "—"}</Td>
                  <Td>{Number.isFinite(r.modelOdds) ? fmtOdds(r.modelOdds) : "—"}</Td>
                  <Td>{fmtOdds(r.actualOdds)}</Td>
                  <Td>{Number.isFinite(r.ev) ? r.ev.toFixed(3) : "—"}</Td>
                  <Td>{r.why || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }) {
  return <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500">{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`py-2 pr-3 ${className}`}>{children}</td>;
}
