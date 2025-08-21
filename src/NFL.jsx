import React, { useMemo, useState, useEffect } from 'react';
import { getWeeksAvailable, getGamesForWeek } from './utils/nflSchedule';
import { buildWeekCandidates } from './nfl/tdEngine';
import { ENABLE_NFL_TD } from './config/features';

export default function NFL() {
  if (!ENABLE_NFL_TD) {
    return <div className="p-6 max-w-5xl mx-auto"><h1 className="text-2xl font-bold">NFL — Anytime TD</h1><p>Feature disabled.</p></div>
  }
  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(weeks[0] || 1);
  const games = useMemo(()=>getGamesForWeek(week), [week]);
  const { overall, byGame, diagnostics } = useMemo(()=>buildWeekCandidates(week, games), [week, games]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm">Week</label>
          <select className="border rounded px-2 py-1" value={week} onChange={e=>setWeek(parseInt(e.target.value,10))}>
            {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
      </div>
      <div className="text-sm opacity-70 mb-4">
        Using OddsAPI: no • data (last {diagnostics.years_used} yrs): {diagnostics.pbp_ok ? 'ok' : 'missing'}
      </div>

      <h2 className="text-lg font-semibold mb-2">Top candidates (overall)</h2>
      <div className="overflow-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Player</th>
              <th className="p-2 text-left">Team</th>
              <th className="p-2 text-left">Game</th>
              <th className="p-2 text-right">Model TD%</th>
              <th className="p-2 text-right">RZ path</th>
              <th className="p-2 text-right">EXP path</th>
              <th className="p-2 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {overall.slice(0,20).map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.player} <span className="opacity-60 text-xs">({r.pos})</span></td>
                <td className="p-2">{r.team}</td>
                <td className="p-2">{r.game}</td>
                <td className="p-2 text-right">{(Math.round(r.td_prob*1000)/10).toFixed(1)}%</td>
                <td className="p-2 text-right">{(Math.round(r.paths.rz*1000)/10).toFixed(1)}%</td>
                <td className="p-2 text-right">{(Math.round(r.paths.exp*1000)/10).toFixed(1)}%</td>
                <td className="p-2">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
