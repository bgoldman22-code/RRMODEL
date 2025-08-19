
import React, { useEffect, useMemo, useState } from "react";

function todayEtISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset();
  const estOffset = 4 * 60; // America/New_York during DST; acceptable for daily date
  const d = new Date(now.getTime() - (tzOffset - estOffset) * 60000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

async function safeJSON(url) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return null;
    if (!text || text.trim().startsWith("<")) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function americanToDecimal(us) {
  if (us == null) return null;
  const n = Number(us);
  if (!Number.isFinite(n)) return null;
  if (n >= 100) return 1 + n / 100;
  if (n <= -100) return 1 + 100 / Math.abs(n);
  return null;
}
function impliedFromAmerican(us) {
  const dec = americanToDecimal(us);
  if (!dec) return null;
  return 1 / dec;
}

export default function NFLAnytimeTD() {
  const [date, setDate] = useState(todayEtISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const data = await safeJSON(`/.netlify/functions/nfl-anytime-td-candidates?date=${date}`);
      const list = Array.isArray(data?.candidates) ? data.candidates : [];
      setRows(list);
      setStats({ candidates: list.length, info: data?.info || null });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); }, [date]);

  const topEV = useMemo(() => {
    return [...rows]
      .filter(r => typeof r.EV === "number")
      .sort((a,b) => b.EV - a.EV)
      .slice(0, 12);
  }, [rows]);

  const nearEV = useMemo(() => {
    return [...rows]
      .filter(r => typeof r.EV === "number" && r.EV > -0.05 && r.EV < 0.05)
      .sort((a,b) => Math.abs(a.EV) - Math.abs(b.EV))
      .slice(0, 16);
  }, [rows]);

  const topProb = useMemo(() => {
    return [...rows]
      .filter(r => typeof r.modelProb === "number")
      .sort((a,b) => b.modelProb - a.modelProb)
      .slice(0, 20);
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-2">NFL — Anytime TD (Calibrated + Usage + Odds-first EV)</h1>
      <div className="text-sm text-gray-500 mb-4">
        Date (ET): {date} • Candidates: {stats?.candidates ?? 0}
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border px-2 py-1 rounded"
        />
        <button
          onClick={generate}
          disabled={loading}
          className="bg-black text-white px-4 py-1 rounded disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
        {error && <span className="text-red-600 text-sm">{error}</span>}
      </div>

      <Section title="Top 12 (EV)" rows={topEV} />
      <Section title="Bonus picks (near threshold)" rows={nearEV} />
      <Section title="Straight Anytime TD (Top 20 Raw Probability)" rows={topProb} />
    </div>
  );
}

function Section({ title, rows }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-500">No rows</div>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <Th>Player</Th>
              <Th>Game</Th>
              <Th>Model TD%</Th>
              <Th>Model Odds</Th>
              <Th>Actual Odds</Th>
              <Th>EV (1u)</Th>
              <Th>Why</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <Td>{r.Player}</Td>
                <Td>{r.Game}</Td>
                <Td>{(r.modelProb*100).toFixed(1)}%</Td>
                <Td>{formatUS(r.modelAmerican)}</Td>
                <Td>{formatUS(r.american)}</Td>
                <Td>{r.EV != null ? r.EV.toFixed(3) : ""}</Td>
                <Td>{r.Why}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children }) { return <th className="text-left p-2 border-r">{children}</th>; }
function Td({ children }) { return <td className="p-2 border-r align-top">{children}</td>; }

function formatUS(v){
  if (v == null || !Number.isFinite(v)) return "";
  return v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
}
