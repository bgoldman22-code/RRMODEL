import React, { useEffect, useMemo, useState } from "react";
import { hotColdMultiplier } from "./utils/hotcold.js";
import { buildWhy } from "./utils/why.js";
import { pitchTypeEdgeMultiplier } from "./utils/model_scalers.js";
import MissingOddsTable from "./components/MissingOddsTable.jsx";
import TopHRLeaders from "./components/TopHRLeaders.jsx";
import { resolveOpponentPitcher, makeProbablesMap } from "./utils/opponentPitchers.js";

// NOTE: This file is a safe drop-in that ONLY fixes the opponent-pitcher mapping used
// in the Why column and EV calcs. It does not change any routes or UI layout.

function americanFromProb(p) {
  if (p <= 0 || p >= 1) return null;
  const dec = 1 / p;
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}
function impliedFromAmerican(a) {
  if (a >= 0) return 100 / (a + 100);
  return -a / (-a + 100);
}
function evFromProbAndOdds(prob, american) {
  const q = 1 - prob;
  const dec = american >= 0 ? (american / 100 + 1) : (100 / (-american) + 1);
  return prob * (dec - 1) - q;
}

const fmtAmerican = (a) => (a > 0 ? `+${a}` : `${a}`);

const todayEtISO = () => {
  // Keep same ET behavior the app already uses
  const now = new Date();
  // naive: assume server is UTC; add -4/-5 hr not critical for this helper
  return now.toISOString().slice(0, 10);
};

export default function MLB() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [bonusRows, setBonusRows] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [stats, setStats] = useState(null);

  // NEW: keep a probables map keyed by "AWY@HOME"
  const [probables, setProbables] = useState({});
  const [date, setDate] = useState(todayEtISO());

  // fetch probables once per date from our existing schedule function
  useEffect(() => {
    let cancelled = false;
    async function fetchProbables() {
      try {
        const r = await fetch(`/.netlify/functions/mlb-schedule?date=${date}`);
        if (!r.ok) throw new Error(`schedule ${r.status}`);
        const data = await r.json();
        const map = makeProbablesMap(data);
        if (!cancelled) setProbables(map);
      } catch (e) {
        console.warn("probables fetch failed (non-fatal):", e);
        if (!cancelled) setProbables({});
      }
    }
    fetchProbables();
    return () => { cancelled = true; };
  }, [date]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/.netlify/functions/mlb-candidates?date=${date}`);
      if (!r.ok) throw new Error(`candidates ${r.status}`);
      const data = await r.json();

      // data.candidates should already be sorted by EV. Before we compute Why/EV, fix pitcher
      const fixed = (data.candidates || []).map((c) => {
        const opp = resolveOpponentPitcher(c, probables);
        const oppName = typeof opp === 'string' ? opp : (opp?.name || null);
        const oppHand = (opp && typeof opp === 'object') ? (opp.hand || null) : null;
        return { ...c, pitcherName: oppName || c.pitcherName, pitcherHand: oppHand || c.pitcherHand };
      });

      // enrich for display
      const withCalcs = fixed.map((c) => {
        const baseProb = c.modelProb ?? c.model ?? c.p; // be permissive
        const hotcold = hotColdMultiplier(c);
        const pitchEdge = pitchTypeEdgeMultiplier(c);
        const finalProb = Math.max(0, Math.min(0.95, baseProb * hotcold * pitchEdge));

        const american = c.american ?? (c.actualAmerican ?? (c.oddsAmerican ?? americanFromProb(finalProb)));
        const ev = evFromProbAndOdds(finalProb, american);

        const why = buildWhy({
          model: baseProb,
          hotcold,
          park: c.parkAdj,
          odds: american,
          pitcherName: c.pitcherName, // already corrected above
          pitcherHand: c.pitcherHand,
          game: c.game,
          team: c.team,
        });

        return {
          player: c.player,
          game: c.game,
          modelProb: finalProb,
          american,
          ev,
          why,
          team: c.team,
          pitcherName: c.pitcherName,
        };
      });

      // Split into main + bonus + raw probability tables (behavior preserved)
      const main = withCalcs.slice(0, 12);
      const bonus = withCalcs.slice(12, 20);
      const raw = [...fixed]
        .sort((a, b) => (b.modelProb ?? b.model ?? b.p) - (a.modelProb ?? a.model ?? a.p))
        .slice(0, 13)
        .map((c) => ({
          player: c.player,
          game: c.game,
          modelProb: c.modelProb ?? c.model ?? c.p,
          actualAmerican: c.actualAmerican ?? c.american ?? c.oddsAmerican ?? null,
          why: buildWhy({
            model: c.modelProb ?? c.model ?? c.p,
            hotcold: hotColdMultiplier(c),
            park: c.parkAdj,
            odds: c.actualAmerican ?? c.american ?? c.oddsAmerican ?? null,
            pitcherName: c.pitcherName,
            pitcherHand: c.pitcherHand,
            game: c.game,
            team: c.team,
          }),
        }));

      setRows(main);
      setBonusRows(bonus);
      setRawRows(raw);
      setStats(data.stats || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); }, [date]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-2">MLB HR — Calibrated + Hot/Cold + Odds-first EV</h1>

      <div className="text-sm text-gray-500 mb-4">
        Date (ET): {date} • {stats ? `Candidates: ${stats.candidates}` : ""}
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1" />
        <button onClick={generate} className="border rounded px-3 py-1">Generate</button>
        {loading && <span className="text-gray-500 ml-2">loading…</span>}
        {error && <span className="text-red-600 ml-2">{error}</span>}
      </div>

      <Section title="Top 12 (EV)">
        <Table rows={rows} />
      </Section>

      <Section title="Bonus picks (near threshold)">
        <Table rows={bonusRows} />
      </Section>

      <Section title="Straight HR Bets (Top 13 Raw Probability)">
        <RawTable rows={rawRows} />
      </Section>

      <MissingOddsTable />
      <TopHRLeaders />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}

function Table({ rows }) {
  if (!rows || !rows.length) return <div className="text-gray-500">No rows</div>;
  return (
    <table className="w-full text-sm border">
      <thead>
        <tr className="bg-gray-50 text-left">
          <th className="p-2">Player</th>
          <th className="p-2">Game</th>
          <th className="p-2">Model HR%</th>
          <th className="p-2">American</th>
          <th className="p-2">EV (1u)</th>
          <th className="p-2">Why</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t">
            <td className="p-2">{r.player}</td>
            <td className="p-2">{r.game}</td>
            <td className="p-2">{(r.modelProb * 100).toFixed(1)}%</td>
            <td className="p-2">{fmtAmerican(r.american)}</td>
            <td className="p-2">{r.ev.toFixed(3)}</td>
            <td className="p-2">{r.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RawTable({ rows }) {
  if (!rows || !rows.length) return <div className="text-gray-500">No rows</div>;
  return (
    <table className="w-full text-sm border">
      <thead>
        <tr className="bg-gray-50 text-left">
          <th className="p-2">Player</th>
          <th className="p-2">Game</th>
          <th className="p-2">Model HR%</th>
          <th className="p-2">Actual Odds</th>
          <th className="p-2">Why</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t">
            <td className="p-2">{r.player}</td>
            <td className="p-2">{r.game}</td>
            <td className="p-2">{(r.modelProb * 100).toFixed(1)}%</td>
            <td className="p-2">{r.actualAmerican != null ? fmtAmerican(r.actualAmerican) : "—"}</td>
            <td className="p-2">{r.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
