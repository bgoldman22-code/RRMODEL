
import React, { useMemo, useState } from "react";

/**
 * MLB HR — Calibrated + Hot/Cold + Odds-first EV
 * This file restores:
 *  - Generate button wiring
 *  - Header summary line (Date • Candidates • Using OddsAPI • Calibration scale)
 *  - Tables: Main (EV-first), Bonus (near threshold), Pure Probability (top 13),
 *            Pure EV (top 13 with floor)
 *  - Filters to avoid odds-only fallback rows flooding the page
 *  - Clean columns: Model HR% • Model Odds • Actual Odds • EV (1u) • Why
 *
 * NOTES:
 *  - We only populate tables from CANDIDATES that include a model probability.
 *    If odds-only fallback (FanDuel Over 0.5) is all we have, we show a short
 *    notice and keep the page concise.
 *  - We keep lightweight multipliers (hot/cold + pitch-fit) but they are SAFE:
 *    they only apply when the needed fields exist; otherwise multiplier = 1.
 */

const DECIMALS = 3;
const MAIN_TABLE_SIZE = 12;
const PURE_PROB_SIZE = 13;
const PURE_EV_SIZE = 13;
const PURE_EV_FLOOR = 0.25; // floor probability for the Pure EV table (25% default)
const EV_THRESHOLD = 0.0005; // main picks threshold
const EV_NEAR = 0.001; // bonus window above/below threshold

function fmtPct(p) {
  if (p == null || isNaN(p)) return "";
  return `${(p * 100).toFixed(1)}%`;
}

function americanFromProb(p) {
  if (p == null || p <= 0 || p >= 1) return null;
  const fav = p >= 0.5;
  if (fav) {
    const val = Math.round((p / (1 - p)) * 100);
    return -val;
  }
  const val = Math.round(((1 - p) / p) * 100);
  return val;
}

function decimalFromAmerican(a) {
  if (a == null || a === 0) return null;
  if (a > 0) return 1 + a / 100;
  return 1 + 100 / (-a);
}

function impliedFromAmerican(a) {
  if (a == null) return null;
  if (a > 0) return 100 / (a + 100);
  return (-a) / ((-a) + 100);
}

function fmtAmerican(a) {
  if (a == null || isNaN(a)) return "";
  return a > 0 ? `+${a}` : `${a}`;
}

function evOneUnit(p, american) {
  // EV(1u) = p * decimal - 1
  const d = decimalFromAmerican(american);
  if (!d || p == null) return null;
  return p * d - 1;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// SAFE multipliers (only apply when data exists)
function hotColdMultiplier(recentHRs7d, paLast50) {
  // Tiny, bounded effect
  let m = 1;
  if (typeof recentHRs7d === "number" && recentHRs7d > 0) m *= 1.04;
  if (typeof paLast50 === "number") {
    if (paLast50 < 25) m *= 0.98;
    else if (paLast50 > 80) m *= 1.01;
  }
  return clamp(m, 0.94, 1.06);
}

function pitchTypeFitMultiplier(dmg = {}) {
  let bump = 1;
  // Expect fields like dmg.vsFourSeam, dmg.vsSinker … in [0..1] scale (relative)
  const vals = Object.values(dmg).filter((x) => typeof x === "number");
  if (vals.length) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > 0.6) bump *= 1.04;
    else if (avg < 0.4) bump *= 0.98;
  }
  return clamp(bump, 0.95, 1.05);
}

async function getJSON(path) {
  const r = await fetch(path, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

async function tryMany(paths) {
  for (const p of paths) {
    try {
      const j = await getJSON(p);
      // Heuristics: valid list when it's array-ish with length
      if (Array.isArray(j) && j.length) return j;
      if (j && Array.isArray(j.candidates) && j.candidates.length) return j.candidates;
      if (j && Array.isArray(j.players) && j.players.length) return j.players;
    } catch (e) {
      // ignore and continue
    }
  }
  return [];
}

async function loadOdds() {
  // Odds refresh (non-fatal)
  try { await fetch("/.netlify/functions/odds-refresh-multi", { method: "POST" }); } catch {}
  // Then read odds
  try {
    const j = await getJSON("/.netlify/functions/odds-get");
    // Expect j.offers[] with { player, american, market:'batter_home_runs', point:0.5, bookKey:'fanduel' }
    const offers = Array.isArray(j?.offers) ? j.offers : [];
    const fdOverOnly = offers.filter(
      o => o?.market?.includes("home_runs") && o?.point === 0.5 && o?.bookKey === "fanduel"
    );
    // index by lowercased player name
    const byPlayer = new Map();
    for (const o of fdOverOnly) {
      if (!o?.player) continue;
      const key = o.player.trim().toLowerCase();
      // choose best (highest price) if duplicates
      const prev = byPlayer.get(key);
      if (!prev || (typeof o.american === "number" && o.american > prev.american)) {
        byPlayer.set(key, o);
      }
    }
    return { usingOddsApi: fdOverOnly.length > 0, mapByPlayer: byPlayer, raw: fdOverOnly };
  } catch (e) {
    return { usingOddsApi: false, mapByPlayer: new Map(), raw: [] };
  }
}

async function loadCandidates() {
  const candidates = await tryMany([
    "/.netlify/functions/mlb-daily-learn",
    "/.netlify/functions/mlb-candidates",
    "/data/mlb/model-candidates.json",
    "/data/mlb/candidates.json"
  ]);
  // Normalize expected fields
  return candidates.map((c) => ({
    player: c.player || c.name || "",
    game: c.game || c.matchup || "",
    modelP: typeof c.modelHRProb === "number" ? c.modelHRProb :
            typeof c.model_p === "number" ? c.model_p :
            typeof c.prob === "number" ? c.prob : null,
    // optional inputs for multipliers
    recentHRs7d: c.recentHRs7d,
    paLast50: c.paLast50,
    pitchDamage: c.pitchDamage || c.pitch_fit || {},
    why: c.why || "",
  })).filter((c) => c.player && c.modelP != null);
}

function useGenerator() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState({ dateEt: "", candidatesN: 0, usingOddsApi: false, calib: 1.0 });
  const [rows, setRows] = useState([]);
  const [notice, setNotice] = useState("");

  async function generate() {
    setBusy(true);
    setNotice("");
    try {
      const [odds, cands] = await Promise.all([ loadOdds(), loadCandidates() ]);
      const dateEt = new Date().toISOString().slice(0,10);
      const usingOddsApi = !!odds.usingOddsApi;

      // Join odds to candidates (model-first). Skip odds-only fallback rows entirely.
      const joined = cands.map((c) => {
        const baseP = c.modelP;
        const mHotCold = hotColdMultiplier(c.recentHRs7d, c.paLast50);
        const mPitch = pitchTypeFitMultiplier(c.pitchDamage);
        const p = clamp(baseP * mHotCold * mPitch, 0.01, 0.95);

        const modelOdds = americanFromProb(p);

        const k = c.player.trim().toLowerCase();
        const offer = odds.mapByPlayer.get(k);
        const actualAmerican = typeof offer?.american === "number" ? offer.american : null;
        const ev = actualAmerican != null ? evOneUnit(p, actualAmerican) : null;

        const whyBits = [];
        whyBits.push(`model ${(p*100).toFixed(1)}%`);
        if (mHotCold !== 1) whyBits.push(`hot/cold ${(mHotCold>=1?"+":"")}${((mHotCold-1)*100).toFixed(0)}%`);
        if (mPitch !== 1) whyBits.push(`pitch-fit ${(mPitch>=1?"+":"")}${((mPitch-1)*100).toFixed(0)}%`);
        if (actualAmerican != null) whyBits.push(`odds ${fmtAmerican(actualAmerican)}`);

        return {
          player: c.player,
          game: c.game,
          modelP: p,
          modelOdds,
          actualOdds: actualAmerican,
          ev,
          why: whyBits.join(" • ")
        };
      });

      // Filter to reasonable list
      const valid = joined.filter(r => r.player && r.modelP != null);

      setRows(valid);
      setSummary({ dateEt, candidatesN: valid.length, usingOddsApi, calib: 1.00 });

      if (!valid.length) {
        // If we truly have zero model candidates, don’t flood page with odds-only items
        if (odds.raw.length) {
          setNotice("Model candidates unavailable. Showing no picks to avoid odds-only noise. (Odds are available and will be used once candidates load.)");
        } else {
          setNotice("No candidates and no odds available.");
        }
      }
    } catch (e) {
      console.error(e);
      setNotice("Generate failed. Check functions and data sources.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, summary, rows, notice, generate };
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}

function Table({ items }) {
  if (!items?.length) return <div style={{ color: "#777" }}>No rows</div>;
  return (
    <div className="rr-table" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Player</th>
            <th style={{ textAlign: "left" }}>Game</th>
            <th style={{ textAlign: "right" }}>Model HR%</th>
            <th style={{ textAlign: "right" }}>Model Odds</th>
            <th style={{ textAlign: "right" }}>Actual Odds</th>
            <th style={{ textAlign: "right" }}>EV (1u)</th>
            <th style={{ textAlign: "left" }}>Why</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              <td>{r.player}</td>
              <td>{r.game}</td>
              <td style={{ textAlign: "right" }}>{fmtPct(r.modelP)}</td>
              <td style={{ textAlign: "right" }}>{fmtAmerican(r.modelOdds)}</td>
              <td style={{ textAlign: "right" }}>{fmtAmerican(r.actualOdds)}</td>
              <td style={{ textAlign: "right" }}>{r.ev != null ? r.ev.toFixed(3) : ""}</td>
              <td>{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MLB() {
  const { busy, summary, rows, notice, generate } = useGenerator();

  const mainPicks = useMemo(() => {
    return rows
      .filter(r => r.actualOdds != null && (r.ev ?? -1) >= EV_THRESHOLD)
      .sort((a,b) => (b.ev ?? -1) - (a.ev ?? -1))
      .slice(0, MAIN_TABLE_SIZE);
  }, [rows]);

  const bonusPicks = useMemo(() => {
    return rows
      .filter(r => r.actualOdds != null && (r.ev ?? -1) >= (EV_THRESHOLD - EV_NEAR) && (r.ev ?? -1) < (EV_THRESHOLD))
      .sort((a,b) => (b.ev ?? -1) - (a.ev ?? -1))
      .slice(0, 20);
  }, [rows]);

  const pureProb = useMemo(() => {
    return rows
      .slice()
      .sort((a,b) => b.modelP - a.modelP)
      .slice(0, PURE_PROB_SIZE);
  }, [rows]);

  const pureEV = useMemo(() => {
    return rows
      .filter(r => r.actualOdds != null && r.modelP >= PURE_EV_FLOOR)
      .slice()
      .sort((a,b) => (b.ev ?? -1) - (a.ev ?? -1))
      .slice(0, PURE_EV_SIZE);
  }, [rows]);

  return (
    <div style={{ padding: 16 }}>
      <h2>MLB HR — Calibrated + Hot/Cold + Odds-first EV</h2>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 16px" }}>
        <button onClick={generate} disabled={busy} style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600 }}>
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>

      <div style={{ color: "#666", marginBottom: 12 }}>
        Date (ET): {summary.dateEt || "—"} • Candidates: {summary.candidatesN} • Using OddsAPI: {summary.usingOddsApi ? "yes" : "no"} • Calibration scale: {summary.calib.toFixed(2)}
      </div>

      {notice && (
        <div style={{ background: "#fff7e6", border: "1px solid #ffd596", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <Section title="Main picks (EV-first)">
        <Table items={mainPicks} />
      </Section>

      <Section title="Bonus picks (near threshold)">
        <Table items={bonusPicks} />
      </Section>

      <Section title="Straight HR Bets (Top 13 Raw Probability)">
        <Table items={pureProb} />
      </Section>

      <Section title={`Pure EV (Top ${PURE_EV_SIZE}, floor ${Math.round(PURE_EV_FLOOR*100)}%)`}>
        <Table items={pureEV} />
      </Section>
    </div>
  );
}
