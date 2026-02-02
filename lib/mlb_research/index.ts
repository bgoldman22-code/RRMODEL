/**
 * MLB Research V1.1 - Module Index
 * 
 * This is the main entry point for the MLB Research schema and utilities.
 * 
 * Usage:
 *   import { MLBResearchGameV1Full, checkForLeakage } from './lib/mlb_research';
 * 
 * V1.1 Changes:
 * - Use actual_first_pitch_utc as leakage boundary
 * - Added PA-based windows for batters
 * - Added pitcher role (starter/opener/bulk)
 * - Added labels_definition.md for explicit market definitions
 */

// V1.1 Types (recommended)
export type {
  // Core identifiers
  GameId,
  TeamInfo,
  PlayerInfo,
  
  // Pregame context
  PregameLineup,
  PregameStartingPitcher,
  PregameWeather,
  VenueInfo,
  PregameOdds,
  PregameContext,
  
  // Rolling window features
  BatterRollingStats,
  BatterGameWindows,
  BatterPAWindows,
  BatterRollingWindows,
  BatterVsHandedness,
  BatterVsOpponent,
  BatterFeaturePack,
  PitcherRollingStats,
  PitcherRollingWindows,
  PitcherVsHandedness,
  PitcherVsOpponent,
  PitcherFeaturePack,
  TeamFeaturePack,
  FeaturePacks,
  
  // Outcomes
  BatterGameOutcome,
  PitcherGameOutcome,
  GameOutcome,
  
  // Main record types
  MLBResearchGameV1Full,
  MLBResearchGameV1Lite,
  MLBResearchGameV1,
  RecordMeta,
  QualityFlags,
  
  // Leakage guard types
  PregameOnly,
  OutcomeOnly
} from './types.v1.1.js';

// Type guards and utilities
export { 
  isCompleteGame, 
  isLiteMode,
  getPregameData,
  getLeakageBoundary 
} from './types.v1.1.js';

// Leakage guard utilities (v1.1)
export {
  // Core functions
  getLeakageBoundary as getLeakageBoundaryFn,
  isUsingFallbackTime,
  
  // Validation
  validateGameRecord,
  runFullValidation,
  validateDataset,
  
  // Leakage detection
  checkForLeakage,
  validateRollingWindowSource,
  checkForOpeners,
  
  // Feature isolation
  stripOutcomes,
  createFeatureSafeDataset,
  getHistoricalGames,
  getPlayerGamesForRolling,
  getPlayerGamesForPARolling,
  
  // Date utilities
  isStrictlyBeforeDate,
  isTimestampBefore,
  
  // Types
  type ValidationResult,
  type LeakageCheckResult,
  type LeakageViolation
} from './leakage_guard.v1.1.js';

// Schema version constant
export const SCHEMA_VERSION = '1.1.0' as const;

// Default export for convenience
import leakageGuard from './leakage_guard.v1.1.js';
export default leakageGuard;
