
import React, { useEffect, useMemo, useState } from "react";
import NflTdTable from "../components/NflTdTable";

function pad2(n){ return String(n).padStart(2,"0"); }
function nextThursdayISO(){
  const now = new Date();
  const dow = now.getDay(); // local 0..6
  const daysUntilThu = (4 - dow + 7) % 7;
  const cand = new Date(now);
  cand.setDate(now.getDate() + daysUntilThu);
  const y = cand.getFullYear();
  const m = pad2(cand.getMonth()+1);
  const d = pad2(cand.getDate());
  return `${y}-${m}-${d}`;
}

async function safeJSON(url){
  try{
    const r = await fetch(url);
    const t = await r.text();
    if(!r.ok) return null;
    if(!t || t.trim().startsWith("<")) return null;
    return JSON.parse(t);
  }catch{ return null; }
}

export default function NFLAnytimeTDPage(){
  const [date, setDate] = useState(nextThursdayISO());
  const [weekly, setWeekly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ games: 0, props: 0, mode: "week" });

  async function generate(){
    setLoading(true);
    setError(null);
    try{
      const modeParam = weekly ? "&mode=week" : "";
      const url = `/.netlify/functions/nfl-anytime-td-candidates?date=${date}${modeParam}`;
      const data = await safeJSON(url);
      const list = Array.isArray(data?.candidates) ? data.candidates : [];
      setRows(list);
      const info = data?.info || {};
      setMeta({
        games: Number(info.games ?? 0),
        props: Number(info.props ?? 0),
        mode: info.mode || (weekly ? "week" : "day")
      });
    }catch(e){
      setError(String(e));
    }finally{
      setLoading(false);
    }
  }

  useEffect(() => { generate(); }, [date, weekly]);

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
      <h1 className="text-2xl font-semibold mb-1">NFL — Anytime TD (Calibrated + Usage + Odds-first EV)</h1>
      <div className="text-sm text-gray-600 mb-4">
        Date (ET): {date} • Mode: {weekly ? "Thu–Mon week" : "Single day"} • Games in window: {meta.games} • Props: {meta.props}
      </div>

      <div className="flex gap-3 items-center mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border px-2 py-1 rounded"/>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={weekly} onChange={e => setWeekly(e.target.checked)}/>
          Thu–Mon week window
        </label>
        <button onClick={generate} disabled={loading} className="bg-black text-white px-4 py-1 rounded disabled:opacity-50">
          {loading ? "Generating…" : "Generate"}
        </button>
        {error && <span className="text-red-600 text-sm">{String(error)}</span>}
      </div>

      <NflTdTable title="Top 12 (EV)" rows={topEV} emptyText="No EV rows yet — odds may not be posted."/>

      <NflTdTable title="Bonus picks (near threshold)" rows={nearEV} emptyText="No near-threshold rows right now."/>

      <NflTdTable title="Straight Anytime TD (Top 20 Raw Probability)" rows={topProb} emptyText="No model probabilities yet."/>

      {rows.length === 0 && (
        <div className="text-sm text-gray-500 mt-4">
          If props aren’t available yet from books, candidates will be empty. As soon as the odds provider posts <code>player_anytime_td</code>
          markets, EV and tables will populate automatically.
        </div>
      )}
    </div>
  );
}
