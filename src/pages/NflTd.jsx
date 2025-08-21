// src/pages/NflTd.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { ENABLE_NFL_TD } from '../config/features';
import { getGamesInWindow, nextThursdayISO } from '../utils/nflSchedule';

export default function NflTd() {
  if (!ENABLE_NFL_TD) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">NFL Anytime TD</h1>
        <p className="text-sm opacity-70">This feature is currently disabled.</p>
      </div>
    );
  }

  const [date, setDate] = useState(nextThursdayISO());
  const games = useMemo(() => getGamesInWindow(date), [date]);

  // derive count
  const count = games.length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">NFL Anytime TD — Weekly Window (Thu–Mon)</h1>
      <p className="text-sm opacity-70 mb-4">
        Pick date (defaults to next Thursday):
      </p>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <button
          className="border rounded px-3 py-2"
          onClick={() => setDate(nextThursdayISO())}
          title="Reset to next Thursday"
        >
          Reset
        </button>
      </div>
      <div className="mb-2 text-sm">Games in window: <b>{count}</b></div>
      <div className="mb-6 text-sm opacity-70">Using OddsAPI: no</div>

      <div className="space-y-2">
        {games.map((g, idx) => (
          <div key={idx} className="border rounded p-3">
            <div className="font-medium">{g.away} @ {g.home}</div>
            <div className="text-xs opacity-70">Date: {g.date}{g.site ? ` • ${g.site}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
