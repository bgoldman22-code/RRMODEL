// src/pages/NflTd.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { ENABLE_NFL_TD } from '../config/features';
import { getWeeksAvailable, getGamesForWeek } from '../utils/nflSchedule';
import NflTdTable from '../components/NflTdTable';

function qsWeek(){ const w = parseInt(new URLSearchParams(location.search).get('week')||'',10); return Number.isFinite(w)? w : null; }

export default function NflTd(){
  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(qsWeek() || (weeks.includes(1)?1:weeks[0]||1));
  const games = useMemo(()=> getGamesForWeek(week), [week]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(()=>{
    const params = new URLSearchParams(location.search);
    params.set('week', String(week));
    history.replaceState(null, '', `?${params.toString()}`);
  }, [week]);

  useEffect(()=>{
    if (!ENABLE_NFL_TD) return;
    setLoading(true); setErr(null);
    fetch(`/.netlify/functions/nfl-td-predictions?season=2025&week=${week}`)
      .then(r=>r.json()).then(j=>{
        if (!j || !j.rows) throw new Error('Bad TD response');
        setRows(j.rows);
      }).catch(e=> setErr(e.message || 'Error')).finally(()=> setLoading(false));
  }, [week]);

  if (!ENABLE_NFL_TD){
    return <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      <p className="text-sm opacity-70">This feature is currently disabled.</p>
    </div>;
  }

  const topEV = useMemo(()=> rows.filter(r=> typeof r.value==='number').slice(0, 20), [rows]);
  const highProb = useMemo(()=> rows.slice().sort((a,b)=> b.td_prob - a.td_prob).slice(0, 20), [rows]);
  const longshots = useMemo(()=> rows.filter(r=> r.model_american >= 300).slice(0, 20), [rows]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <select className="border rounded px-2 py-1" value={week} onChange={e=> setWeek(parseInt(e.target.value,10))}>
          {weeks.map(w=> <option key={w} value={w}>Week {w}</option>)}
        </select>
      </div>

      {err && <div className="text-red-600 mb-3">{String(err)}</div>}
      {loading && <div className="opacity-70">Loading…</div>}

      {!loading && <>
        <NflTdTable title="Top EV / Value" rows={topEV} emptyText="No EV edges yet (odds-agnostic mode)" />
        <NflTdTable title="Highest Model Probability" rows={highProb} emptyText="No players" />
        <NflTdTable title="Longshot Radar (≥ +300)" rows={longshots} emptyText="No longshots" />
      </>}
    </div>
  );
}
