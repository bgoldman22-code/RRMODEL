
// src/routes/NFLNegCorr.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { scoreNegCorr, suggestLines } from '../nfl/negcorr/negCorrEngine';

export default function NFLNegCorr(){
  const [rows, setRows] = useState([]);
  const [windowInfo, setWindowInfo] = useState(null);
  const [pickDate, setPickDate] = useState(() => {
    const d = new Date();
    // default to next Thursday like TD page usually does
    const day = d.getDay();
    const diff = (4 - day + 7) % 7 || 7; // 4=Thu
    d.setDate(d.getDate() + diff);
    return d.toISOString().substring(0,10);
  });

  useEffect(()=>{ setRows(scoreNegCorr()); },[]);

  useEffect(()=>{
    fetch('/.netlify/functions/nfl-schedule-local?date=' + pickDate)
      .then(r => r.json())
      .then(setWindowInfo)
      .catch(()=> setWindowInfo(null));
  }, [pickDate]);

  const header = useMemo(()=>{
    if(!windowInfo) return null;
    const { week, start, end, games } = windowInfo;
    return `Week ${week} • ${start} → ${end} • Games: ${games}`;
  }, [windowInfo]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">NFL — Negative Correlation</h1>
      <div className="flex items-center gap-3">
        <label className="text-sm opacity-70">Pick date (ET):</label>
        <input
          type="date"
          className="border rounded px-2 py-1 text-sm"
          value={pickDate}
          onChange={e => setPickDate(e.target.value)}
        />
        {header && <div className="text-sm opacity-70">{header}</div>}
      </div>

      <div className="overflow-auto border rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-left px-3 py-2">Receptions Over + Yards Under</th>
              <th className="text-left px-3 py-2">Receptions Under + Yards Over</th>
              <th className="text-left px-3 py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lines = suggestLines(r);
              return (
                <tr key={r.player} className="border-t">
                  <td className="px-3 py-2 font-semibold">
                    {r.player} <span className="text-xs opacity-60">({r.team})</span>
                  </td>
                  <td className="px-3 py-2">
                    ALT {lines.altRecFloor}+ recs &nbsp; + &nbsp; Under {lines.ydsLine}.5 yds
                    <span className="ml-2 text-xs opacity-60">score {r.profiles.receptionsOver_yardsUnder}</span>
                  </td>
                  <td className="px-3 py-2">
                    Under {lines.recLine}.5 recs &nbsp; + &nbsp; Over {lines.ydsLine}.5 yds
                    <span className="ml-2 text-xs opacity-60">score {r.profiles.receptionsUnder_yardsOver}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.role} • {r.seasons}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="text-xs opacity-70">
        <summary>Notes</summary>
        <ul className="list-disc pl-5 leading-6">
          <li>Odds OFF (agnostic mode). DraftKings priority will be added via a separate function when you give the go.</li>
          <li>Page is isolated from TD/HR modules; no shared env or blobs.</li>
        </ul>
      </details>
    </div>
  );
}
