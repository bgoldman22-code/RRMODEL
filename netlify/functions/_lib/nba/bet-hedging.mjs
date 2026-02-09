/**
 * NBA Elite V2 - Bet Hedging & Double Down System
 * 
 * Re-exports everything from hedge-doubledown-v2.mjs (the canonical EV-aware system).
 * This file exists for backward-compatible import paths.
 */
export {
  generateHedge,
  generateDoubleDown,
  generateHedgeAndDoubleDown,
  applyHedgingSystem,
  calculateEV,
  oddsToProb,
  probToOdds,
  isTooJuiced,
  isFavorite,
  HEDGE_GATES,
  DOUBLEDOWN_GATES
} from './hedge-doubledown-v2.mjs';

export { default } from './hedge-doubledown-v2.mjs';
