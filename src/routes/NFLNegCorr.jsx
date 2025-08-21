
// src/routes/NFLNegCorr.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { scoreNegCorr, suggestLines } from '../nfl/negcorr/engine';

const fmt = (d)=> new Date(d).toISOString().slice(0,10);

export default function NFLNegCorr(){
  const [date,setDate] = useState(fmt(new Date()));
  const [week,setWeek] = useState(null);
  const [games,setGames] = useState([]);
  const [rows,setRows] = useState([]);

  useEffect(()=>{ setRows(scoreNegCorr()); },[]);

  useEffect(()=>{
    fetch('/.netlify/functions/nfl-schedule-local?date='+date).then(r=>r.json()).then(j=>{
      if(j && j.ok){ setWeek(j.week); setGames(j.games||[]); }
    }).catch(()=>{});
  },[date]);

  const windowText = useMemo(()=>{
    if(!week) return 'loading…';
    return `Week ${week.week} • ${week.start} → ${week.end} • Games: ${games.length}`;
  },[week,games]);

  return (
    <div className="container mx-auto max-w-6xl p-4">
      <h1 className="text-3xl font-semibold">NFL — Negative Correlation</h1>
      <div className="mt-2 text-sm text-gray-600">Window: {windowText}</div>

      <div className="mt-3 flex items-center gap-3">
        <label className="text-sm text-gray-700">Pick date (ET):</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded px-2 py-1"/>
      </div>

      <div className="mt-6 overflow-auto border rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-left px-3 py-2">Team</th>
              <th className="text-left px-3 py-2">Over Receptions + Under Yards</th>
              <th className="text-left px-3 py-2">Under Receptions + Over Yards</th>
              <th className="text-left px-3 py-2">Role / Seasons</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>{
              const lines = suggestLines(r);
              return (
                <tr key={r.player} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.player}</td>
                  <td className="px-3 py-2">{r.team}</td>
                  <td className="px-3 py-2">{lines.altRecFloor}+ recs  &  Under {lines.ydsLine}.5 yds <span className="text-xs text-gray-500">• score {r.s1}</span></td>
                  <td className="px-3 py-2">Under {lines.recLine}.5 recs  &  Over {lines.ydsLine}.5 yds <span className="text-xs text-gray-500">• score {r.s2}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.role} • {r.seasons}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
