// Compatibility shim: src/utils/evMath.js
// Keeps older imports working by re-exporting from ev.js

import {
  americanToDecimal,
  evFromProbAndOdds,
  expectedValue1U
} from "./ev.js";

// Some components expect a function named computeEV(prob, americanOdds, stake=1)
export function computeEV(prob, americanOdds, stake = 1) {
  // expected value for `stake` units at given probability and American odds
  // using the underlying evFromProbAndOdds API.
  return evFromProbAndOdds(prob, americanOdds, stake);
}

// Re-export the commonly used util
export { americanToDecimal };

export default {
  americanToDecimal,
  computeEV,
};
