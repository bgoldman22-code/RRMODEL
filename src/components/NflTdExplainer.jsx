// src/components/NflTdExplainer.jsx
import React from "react";

export default function NflTdExplainer() {
  return (
    <div className="mt-6 p-4 border rounded-md bg-white">
      <h3 className="text-lg font-semibold mb-2">How to read this table</h3>
      <ul className="list-disc pl-6 space-y-1 text-sm leading-relaxed">
        <li>
          <strong>Model TD%</strong> — our blended probability a player scores a TD this game. It combines the Red Zone path and Explosive path, minus any vulture penalty.
        </li>
        <li>
          <strong>RZ path</strong> — touchdown probability coming from sustained drives in the red zone (inside the 20). It uses team red‑zone trips per game (last 3 seasons), your team’s position share (RB/WR/TE/QB), opponent’s
          red‑zone TD allow rate vs that position, and the player’s depth‑based share.
        </li>
        <li>
          <strong>EXP path</strong> — touchdown probability from big plays outside the red zone. It uses opponent explosive‑play allow rates (rush/receiving), the player’s explosive index, coverage fit, and weather adjustments.
        </li>
        <li>
          <strong>Share %</strong> — the portion of a team’s red‑zone chances expected to go to this player’s position (and then to the player based on depth/role).
        </li>
        <li>
          <strong>Explosive idx</strong> — a composite 0–100 style rating from the last 3 seasons combining deep‑target rate/aDOT, YAC per target, breakaway rush %, and big‑play conversion. Higher means more long‑TD potential.
        </li>
        <li>
          <strong>“vs &lt;TEAM&gt; RZ allow XX%”</strong> — opponent’s red‑zone TD allowance versus this position from the last 3 seasons (stabilized). Higher means softer in close.
        </li>
        <li>
          <strong>Why</strong> — quick natural‑language summary of the biggest drivers for this player this week.
        </li>
      </ul>
      <p className="text-xs opacity-70 mt-3">
        Notes: weights default to ~65% Red Zone, ~30% Explosive, ~5% vulture adjustments, then auto‑tune by team. Dataset: last 3 seasons of play‑by‑play aggregates.
      </p>
    </div>
  );
}
