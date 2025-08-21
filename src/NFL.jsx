import React, { useMemo, useState } from "react";
import { getWeeksAvailable, getGamesForWeek } from "./utils/nflSchedule";

export default function NFL() {
  const [mode, setMode] = useState("atd"); // keep existing toggle footprint
  const weeks = getWeeksAvailable();
  const defaultWeek = weeks.includes(1) ? 1 : (weeks[0] || 1);
  const [week, setWeek] = useState(defaultWeek);
  const games = useMemo(() => getGamesForWeek(week), [week]);

  const header = useMemo(() => {
    return mode === "atd" ? "NFL — Anytime TD" : "NFL — Neg Correlation (single player)";
  }, [mode]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{header}</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">Week:</label>
          <select
            value={week}
            onChange={e => setWeek(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {weeks.map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm opacity-70">
        Showing schedule from local file. Odds/props are off for now.
      </p>

      <div className="mt-2">
        <div className="text-sm mb-2">Games this week: <b>{games.length}</b></div>
        <div className="grid gap-2">
          {games.map((g, idx) => (
            <div key={idx} className="border rounded p-3">
              <div className="font-medium">{g.away} @ {g.home}</div>
              <div className="text-xs opacity-70">Date: {g.date}{g.site ? ` • ${g.site}` : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
