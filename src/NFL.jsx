import React, { useMemo, useState } from "react";

/**
 * NFL.jsx — Stability patch
 * - Default date = next Thursday
 * - Adds Neg-Correlation tool (single-player), separate from RR
 * - All guards: never crashes if props are off
 */

function nextThursdayISO() {
  const d = new Date();
  // 4 => Thursday (0=Sun)
  const day = d.getDay();
  const diff = (4 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

export default function NFL() {
  const [date, setDate] = useState(nextThursdayISO());
  const [mode, setMode] = useState("atd"); // "atd" | "negcorr"

  const header = useMemo(() => {
    return mode === "atd" ? "NFL — Anytime TD" : "NFL — Neg Correlation (single player)";
  }, [mode]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{header}</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">Pick date:</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="atd">Anytime TD</option>
            <option value="negcorr">Neg Correlation (single)</option>
          </select>
        </div>
      </div>

      {mode === "atd" ? (
        <div className="text-sm text-gray-600">
          Games in window are loaded by your existing odds layer. If props are off, this page will keep a calm empty state.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            Build a single‑player negative correlation angle (e.g., 5+ receptions with &lt;30 yards, or 3+ receptions with 70+ yards).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded p-3">
              <div className="font-medium mb-2">Receptions heavy</div>
              <ul className="list-disc list-inside text-sm text-gray-700">
                <li>Alt receptions ladder: 3+, 5+, 7+</li>
                <li>Alt yards under: &lt;30 or &lt;40</li>
                <li>Player type: RB/TE slot WR archetypes</li>
              </ul>
            </div>
            <div className="border rounded p-3">
              <div className="font-medium mb-2">Yards heavy</div>
              <ul className="list-disc list-inside text-sm text-gray-700">
                <li>Alt yards: 70+, 90+</li>
                <li>Receptions under: &le;3</li>
                <li>Player type: low aDOT WR, RB wheel routes</li>
              </ul>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            (Odds wiring uses your existing functions when available; this panel is UI-only and crash-proof.)
          </div>
        </div>
      )}
    </div>
  );
}
