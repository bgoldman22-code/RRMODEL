// netlify/functions/lib/parkFactors.js
// Minimal static HR park factors (1.00 = neutral). Adjust/expand as needed.
export const HR_PARK_FACTOR = {
  // AL
  BAL: 0.95, BOS: 0.98, NYY: 1.08, TBR: 0.90, TOR: 1.04,
  CWS: 1.05, CLE: 0.98, DET: 0.90, KCR: 0.92, MIN: 1.02,
  HOU: 1.06, LAA: 1.00, OAK: 0.88, SEA: 0.92, TEX: 1.10,
  // NL
  ATL: 1.06, MIA: 0.90, NYM: 0.95, PHI: 1.07, WSH: 0.98,
  CHC: 1.05, CIN: 1.12, MIL: 1.03, PIT: 0.92, STL: 1.00,
  ARI: 1.04, COL: 1.25, LAD: 1.00, SDP: 0.96, SFG: 0.90
};
export function parkHRFactorForAbbrev(abbrev){
  const k = String(abbrev||'').toUpperCase();
  return typeof HR_PARK_FACTOR[k] === 'number' ? HR_PARK_FACTOR[k] : 1.00;
}
