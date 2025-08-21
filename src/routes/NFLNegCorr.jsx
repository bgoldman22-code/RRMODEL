
// src/routes/NFLNegCorr.jsx
import React, { useEffect, useState } from 'react';
import { scoreNegCorr, suggestLines } from '../nfl/negcorr/negCorrEngine';

export default function NFLNegCorrPage(){
  const [rows,setRows] = useState([]);
  const [odds,setOdds] = useState(null);
  const [usingOddsApi,setUsingOddsApi] = useState(false);

  useEffect(()=>{
    const s = scoreNegCorr();
    setRows(s);
    fetch('/.netlify/functions/odds-nfl-negcorr').then(r => {
      if(!r.ok) throw new Error('odds fetch failed');
      return r.json();
    }).then(j => {
      if(j && j.ok){
        setUsingOddsApi(true);
        setOdds(j.lines);
      }
    }).catch(()=>{});
  },[]);

  const renderPair = (r) => {
    const lines = (odds && odds[r.player]) || suggestLines(r);
    const overRec = lines.recLine ?? 4.5;
    const underYds = lines.ydsLine ?? 50;
    const altFloor = lines.altRecFloor ?? 3;

    const s1 = r.profiles.receptionsOver_yardsUnder;
    const s2 = r.profiles.receptionsUnder_yardsOver;

    return (
      <tr key={r.player}>
        <td className="px-2 py-1 font-semibold">{r.player} <span className="text-xs opacity-60">({r.team})</span></td>
        <td className="px-2 py-1">{altFloor} + recs  &  Under {underYds}.5 yds <span className="text-xs opacity-60">score {s1}</span></td>
        <td className="px-2 py-1">Under {overRec}.5 recs  &  Over {underYds}.5 yds <span className="text-xs opacity-60">score {s2}</span></td>
        <td className="px-2 py-1 text-xs">{r.role} • {r.seasons}</td>
      </tr>
    );
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">NFL Negative Correlation Builder</h1>
      <p className="opacity-80 text-sm">
        Standalone module. Uses past 3y metrics & roles only. Odds integration is optional ({usingOddsApi ? 'Using TheOddsAPI' : 'odds-agnostic mode'}).
      </p>

      <div className="overflow-auto border rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-2 py-1">Player</th>
              <th className="text-left px-2 py-1">Play: Receptions Over + Yards Under</th>
              <th className="text-left px-2 py-1">Play: Receptions Under + Yards Over</th>
              <th className="text-left px-2 py-1">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(renderPair)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
