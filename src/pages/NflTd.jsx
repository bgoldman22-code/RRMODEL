// src/pages/NflTd.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { ENABLE_NFL_TD } from '../config/features';
import { getWeeksAvailable, getGamesForWeek } from '../utils/nflSchedule';

export default function NflTd() {
  if (!ENABLE_NFL_TD) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
        <p className="text-sm opacity-70">This feature is currently disabled.</p>
      </div>
    );
  }

  const weeks = getWeeksAvailable();
  const defaultWeek = weeks.includes(1) ? 1 : weeks[0] || 1;
  const [week, setWeek] = useState(defaultWeek);
  const games = useMemo(() => getGamesForWeek(week), [week]);

  useEffect(() => {
    // if URL has ?week=, sync it
    const params = new URLSearchParams(window.location.search);
    const w = parseInt(params.get('week') || '', 10);
    if (w && weeks.includes(w)) setWeek(w);
  }, []);

  useEffect(() => {
    // push ?week= to URL (no reload)
    const url = new URL(window.location.href);
    url.searchParams.set('week', String(week));
    window.history.replaceState({}, '', url.toString());
  }, [week]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-2xl font-bold">NFL — Anytime TD</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-70">Week</label>
          <select
            className="border rounded px-2 py-2 text-sm"
            value={week}
            onChange={e => setWeek(parseInt(e.target.value, 10))}
          >
            {weeks.map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-2 text-sm">Games this week: <b>{games.length}</b></div>
      <div className="mb-6 text-sm opacity-70">Using OddsAPI: no</div>

      {games.length === 0 ? (
        <div className="text-sm opacity-70 border rounded p-4">
          No regular season games scheduled in Week {week}.
        </div>
      ) : (
        <div className="grid gap-2">
          {games.map((g, idx) => (
            <div key={idx} className="border rounded p-3">
              <div className="font-medium">{g.away} @ {g.home}</div>
              <div className="text-xs opacity-70">Date: {g.date}{g.site ? ` • ${g.site}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
