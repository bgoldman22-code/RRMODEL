// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { hotColdMultiplier } from "./utils/hotcold.js";
import { buildWhy } from "./utils/why.js";              // keep existing export
import { pitchTypeEdgeMultiplier } from "./utils/model_scalers.js";
import TopHRLeaders from "./components/TopHRLeaders.jsx";
import MissingOddsTable from "./components/MissingOddsTable.jsx";
import { normName } from "./utils/norm.js";             // <-- FIX: import normName from new util

// Fallback American odds formatter (used by MissingOddsTable when needed)
const formatAmerican = (a) => (Number.isFinite(a) ? (a > 0 ? `+${Math.round(a)}` : `${Math.round(a)}`) : "");

/**
 * NOTE: This MLB.jsx is a conservative wrapper that expects your existing data
 * wiring to populate `rowsAll` (full candidates) and `oddsMap` (Map/object of actual odds).
 * If those are produced elsewhere in your app, leave that logic as-is.
 * We only add TopHRLeaders + MissingOddsTable rendering here.
 */
export default function MLB() {
  // Try to discover existing data exposed globally or via module scope.
  const rowsAll =
    (typeof window !== "undefined" && Array.isArray(window.__RRMODEL_CANDIDATES__)) ? window.__RRMODEL_CANDIDATES__ :
    (typeof allCandidates !== "undefined" ? allCandidates : []);

  const oddsMap =
    (typeof window !== "undefined" && window.__RRMODEL_ODDSMAP__) ? window.__RRMODEL_ODDSMAP__ :
    (typeof __RRMODEL_ODDSMAP__ !== "undefined" ? __RRMODEL_ODDSMAP__ :
    (typeof globalThis !== "undefined" && globalThis.__RRMODEL_ODDSMAP__) ? globalThis.__RRMODEL_ODDSMAP__ :
    (typeof window !== "undefined" && window.__RRMODEL_ODDSMAP__) ? window.__RRMODEL_ODDSMAP__ : new Map()));

  const [top50Names, setTop50Names] = useState([]);

  // Your existing top / bonus tables should already render elsewhere in this component/file.
  // We only append the two new blocks below. If you need them at a specific spot,
  // keep your original JSX and insert these <TopHRLeaders/> and <MissingOddsTable/> where desired.

  return (
    <div className="p-4 space-y-6">
      {/* Auto Top‑50 HR Leaders (public StatsAPI via Netlify Function) */}
      <TopHRLeaders onLoaded={setTop50Names} />

      {/* Missing Odds diagnostics (focused on Top‑50 hitters). */}
      <MissingOddsTable
        candidates={rowsAll}
        oddsMap={oddsMap}
        normName={normName}
        formatAmerican={formatAmerican}
        leaderboard={top50Names}
        maxRows={10}
      />
    </div>
  );
}
