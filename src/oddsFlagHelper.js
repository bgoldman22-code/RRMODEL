// src/oddsFlagHelper.js
// Minimal helper to compute the "Using OddsAPI" flag consistently.
// Call setUsedOddsFlag(oddsMap) after you build the oddsMap in MLB.jsx.
export function setUsedOddsFlag(meta, oddsMap) {
  try {
    const size = oddsMap && typeof oddsMap.size === 'number' ? oddsMap.size : (oddsMap ? Object.keys(oddsMap).length : 0);
    const hasOdds = Number(size) > 0;
    // Ensure the header flips to "yes" when any odds are present
    meta.usedOdds = !!hasOdds;
    return meta;
  } catch (_e) {
    // Never break the UI
    return meta;
  }
}
