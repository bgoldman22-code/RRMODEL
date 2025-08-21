import React, { useMemo, useState } from 'react';
import { ENABLE_NFL_TD } from '../config/features';
import { getWeeksAvailable, getGamesForWeek } from '../utils/nflSchedule';

export default function NflTd() {
  if (!ENABLE_NFL_TD) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">NFL Anytime TD</h1>
        <p className="text-sm opacity-70">This feature is currently disabled.</p>
      </div>
    );
  }

  const weeks = getWeeksAvailable();
  const [week, setWeek] = useState(weeks.includes(1) ? 1 : weeks[0] ?? 1);
  const games = useMemo(() => getGamesForWeek(week), [week]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>

      <div className="mb-4">
        <label className="block text-sm opacity-80 mb-1">Select week:</label>
        <select
          className="border rounded px-3 py-2"
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
        >
          {weeks.map(w => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
      </div>

      <div className="mb-2 text-sm">
        Games this week: <b>{games.length}</b>
      </div>
      <div className="mb-6 text-sm opacity-70">
        Using OddsAPI: no — showing schedule only
      </div>

      {games.length === 0 ? (
        <div className="text-sm opacity-70">
          No regular season games scheduled in this local file for Week {week}.
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((g, idx) => (
            <div key={idx} className="border rounded p-3">
              <div className="font-medium">{g.away} @ {g.home}</div>
              <div className="text-xs opacity-70">
                Week {g.week} • {g.date}{g.site ? ` • ${g.site}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
