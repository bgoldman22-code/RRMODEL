/**
 * MLB Research V1 - Leakage Guardrail Module
 * 
 * This module provides runtime validation to PREVENT data leakage.
 * It enforces the fundamental rule: features can ONLY use data from BEFORE first pitch.
 * 
 * Version: 1.0.0
 */

import type { 
  MLBResearchGameV1, 
  PregameOnly, 
  BatterRollingStats,
  PitcherRollingStats,
  BatterFeaturePack,
  PitcherFeaturePack 
} from './types.js';

// ============================================================================
// CORE VALIDATION TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface LeakageCheckResult {
  passed: boolean;
  violations: LeakageViolation[];
}

export interface LeakageViolation {
  type: 'temporal' | 'outcome_in_features' | 'future_data' | 'same_game_data';
  severity: 'critical' | 'warning';
  message: string;
  field_path?: string;
  game_pk?: number;
  player_id?: number;
}

// ============================================================================
// DATE/TIME UTILITIES
// ============================================================================

/**
 * Parse various date formats to Date object
 */
export function parseGameDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Check if date A is strictly before date B (no same-day games counted)
 */
export function isStrictlyBefore(dateA: string, dateB: string): boolean {
  const a = new Date(dateA);
  const b = new Date(dateB);
  // Set both to start of day for date-only comparison
  a.setUTCHours(0, 0, 0, 0);
  b.setUTCHours(0, 0, 0, 0);
  return a.getTime() < b.getTime();
}

/**
 * Check if timestamp A is before timestamp B (full datetime comparison)
 */
export function isTimestampBefore(tsA: string, tsB: string): boolean {
  return new Date(tsA).getTime() < new Date(tsB).getTime();
}

/**
 * Get the start of day in UTC for a given date
 */
export function getStartOfDayUTC(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

/**
 * Validate that a game record conforms to the V1 schema
 */
export function validateGameRecord(game: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!game || typeof game !== 'object') {
    return { valid: false, errors: ['Game record must be an object'], warnings: [] };
  }
  
  const g = game as Record<string, unknown>;
  
  // Required top-level fields
  const requiredFields = ['schema_version', 'game_id', 'home_team', 'away_team', 'pregame', 'features', 'outcome', 'meta'];
  for (const field of requiredFields) {
    if (!(field in g)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Schema version check
  if (g.schema_version !== '1.0.0') {
    errors.push(`Invalid schema_version: expected '1.0.0', got '${g.schema_version}'`);
  }
  
  // Game ID validation
  if (g.game_id && typeof g.game_id === 'object') {
    const gameId = g.game_id as Record<string, unknown>;
    if (typeof gameId.game_pk !== 'number') {
      errors.push('game_id.game_pk must be a number');
    }
    if (typeof gameId.season !== 'number' || gameId.season < 2021 || gameId.season > 2025) {
      errors.push('game_id.season must be a number between 2021-2025');
    }
  }
  
  // Pregame lineup validation
  if (g.pregame && typeof g.pregame === 'object') {
    const pregame = g.pregame as Record<string, unknown>;
    
    if (Array.isArray(pregame.home_lineup)) {
      if (pregame.home_lineup.length !== 9) {
        errors.push(`home_lineup must have exactly 9 batters, got ${pregame.home_lineup.length}`);
      }
    }
    
    if (Array.isArray(pregame.away_lineup)) {
      if (pregame.away_lineup.length !== 9) {
        errors.push(`away_lineup must have exactly 9 batters, got ${pregame.away_lineup.length}`);
      }
    }
  }
  
  // Feature pack validation
  if (g.features && typeof g.features === 'object') {
    const features = g.features as Record<string, unknown>;
    
    if (Array.isArray(features.home_batters) && features.home_batters.length !== 9) {
      errors.push(`features.home_batters must have exactly 9 batters`);
    }
    
    if (Array.isArray(features.away_batters) && features.away_batters.length !== 9) {
      errors.push(`features.away_batters must have exactly 9 batters`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// LEAKAGE DETECTION
// ============================================================================

/**
 * Core leakage check: ensures no future data is used in features
 * 
 * This is the MOST IMPORTANT function in the entire system.
 * It validates that rolling window features only use games from BEFORE the target game.
 */
export function checkForLeakage(
  targetGame: MLBResearchGameV1,
  historicalGames: MLBResearchGameV1[]
): LeakageCheckResult {
  const violations: LeakageViolation[] = [];
  
  const targetDate = targetGame.game_id.game_date;
  const targetGamePk = targetGame.game_id.game_pk;
  const targetFirstPitch = targetGame.game_id.scheduled_first_pitch_utc;
  
  // Check 1: No games from same day or future should be in historical data
  for (const histGame of historicalGames) {
    if (!isStrictlyBefore(histGame.game_id.game_date, targetDate)) {
      violations.push({
        type: 'temporal',
        severity: 'critical',
        message: `Historical game ${histGame.game_id.game_pk} (${histGame.game_id.game_date}) is not strictly before target game (${targetDate})`,
        game_pk: histGame.game_id.game_pk
      });
    }
    
    // Same game should never be in historical data
    if (histGame.game_id.game_pk === targetGamePk) {
      violations.push({
        type: 'same_game_data',
        severity: 'critical',
        message: `Target game ${targetGamePk} found in historical games - this is a critical leakage!`,
        game_pk: targetGamePk
      });
    }
  }
  
  // Check 2: Pregame context timestamps should be before first pitch
  if (targetGame.pregame.weather?.forecast_made_at_utc) {
    if (!isTimestampBefore(targetGame.pregame.weather.forecast_made_at_utc, targetFirstPitch)) {
      violations.push({
        type: 'temporal',
        severity: 'warning',
        message: `Weather forecast timestamp is after scheduled first pitch`,
        field_path: 'pregame.weather.forecast_made_at_utc'
      });
    }
  }
  
  if (targetGame.pregame.odds?.snapshot_at_utc) {
    if (!isTimestampBefore(targetGame.pregame.odds.snapshot_at_utc, targetFirstPitch)) {
      violations.push({
        type: 'temporal',
        severity: 'warning',
        message: `Odds snapshot timestamp is after scheduled first pitch`,
        field_path: 'pregame.odds.snapshot_at_utc'
      });
    }
  }
  
  // Check 3: Lineup confirmation times should be before first pitch
  for (const lineup of [...targetGame.pregame.home_lineup, ...targetGame.pregame.away_lineup]) {
    if (!isTimestampBefore(lineup.confirmed_at_utc, targetFirstPitch)) {
      violations.push({
        type: 'temporal',
        severity: 'warning',
        message: `Lineup confirmation for player ${lineup.player.player_id} is after first pitch`,
        player_id: lineup.player.player_id,
        field_path: 'pregame.lineup.confirmed_at_utc'
      });
    }
  }
  
  return {
    passed: violations.filter(v => v.severity === 'critical').length === 0,
    violations
  };
}

/**
 * Validate that rolling window stats are computed correctly
 * (i.e., only from games before the target game)
 */
export function validateRollingWindowSource(
  targetGameDate: string,
  rollingStats: BatterRollingStats | PitcherRollingStats,
  sourceGames: { game_date: string; game_pk: number }[]
): LeakageCheckResult {
  const violations: LeakageViolation[] = [];
  
  for (const sourceGame of sourceGames) {
    if (!isStrictlyBefore(sourceGame.game_date, targetGameDate)) {
      violations.push({
        type: 'future_data',
        severity: 'critical',
        message: `Rolling stats include game ${sourceGame.game_pk} from ${sourceGame.game_date}, which is not before target ${targetGameDate}`,
        game_pk: sourceGame.game_pk
      });
    }
  }
  
  return {
    passed: violations.length === 0,
    violations
  };
}

// ============================================================================
// FEATURE ISOLATION HELPERS
// ============================================================================

/**
 * Strip outcome data from a game record - use this when building features
 * This is a runtime safeguard to prevent accidental access to outcomes
 */
export function stripOutcomes(game: MLBResearchGameV1): PregameOnly {
  const { outcome, ...pregameData } = game;
  return pregameData as PregameOnly;
}

/**
 * Create a feature-safe view of games (no outcome access possible)
 */
export function createFeatureSafeDataset(games: MLBResearchGameV1[]): PregameOnly[] {
  return games.map(stripOutcomes);
}

/**
 * Get games strictly before a target date for feature computation
 */
export function getHistoricalGames(
  allGames: MLBResearchGameV1[],
  targetDate: string,
  targetGamePk?: number
): MLBResearchGameV1[] {
  return allGames.filter(game => {
    // Must be strictly before target date
    if (!isStrictlyBefore(game.game_id.game_date, targetDate)) {
      return false;
    }
    // Must not be the same game (safety check)
    if (targetGamePk && game.game_id.game_pk === targetGamePk) {
      return false;
    }
    return true;
  });
}

/**
 * Get player's games for rolling window computation
 */
export function getPlayerGamesForRolling(
  allGames: MLBResearchGameV1[],
  playerId: number,
  targetDate: string,
  windowSize: number,
  playerType: 'batter' | 'pitcher'
): MLBResearchGameV1[] {
  // Get all games before target date
  const historicalGames = getHistoricalGames(allGames, targetDate);
  
  // Filter to games where this player participated
  const playerGames = historicalGames.filter(game => {
    if (playerType === 'batter') {
      const allBatters = [
        ...game.outcome.home_batters,
        ...game.outcome.away_batters
      ];
      return allBatters.some(b => b.player_id === playerId && b.pa > 0);
    } else {
      return (
        game.outcome.home_pitcher.player_id === playerId ||
        game.outcome.away_pitcher.player_id === playerId
      );
    }
  });
  
  // Sort by date descending and take most recent N games
  playerGames.sort((a, b) => 
    new Date(b.game_id.game_date).getTime() - new Date(a.game_id.game_date).getTime()
  );
  
  return playerGames.slice(0, windowSize);
}

// ============================================================================
// VALIDATION SUITE
// ============================================================================

/**
 * Run full validation suite on a game record
 */
export function runFullValidation(
  game: MLBResearchGameV1,
  historicalGames?: MLBResearchGameV1[]
): {
  schemaValid: ValidationResult;
  leakageCheck?: LeakageCheckResult;
  overallPassed: boolean;
} {
  const schemaValid = validateGameRecord(game);
  
  let leakageCheck: LeakageCheckResult | undefined;
  if (historicalGames) {
    leakageCheck = checkForLeakage(game, historicalGames);
  }
  
  const overallPassed = schemaValid.valid && (!leakageCheck || leakageCheck.passed);
  
  return {
    schemaValid,
    leakageCheck,
    overallPassed
  };
}

/**
 * Validate an entire dataset for internal consistency
 */
export function validateDataset(games: MLBResearchGameV1[]): {
  valid: boolean;
  gameErrors: Map<number, string[]>;
  summary: {
    totalGames: number;
    validGames: number;
    invalidGames: number;
    leakageViolations: number;
  };
} {
  const gameErrors = new Map<number, string[]>();
  let validGames = 0;
  let totalLeakageViolations = 0;
  
  // Sort games by date
  const sortedGames = [...games].sort((a, b) => 
    new Date(a.game_id.game_date).getTime() - new Date(b.game_id.game_date).getTime()
  );
  
  for (let i = 0; i < sortedGames.length; i++) {
    const game = sortedGames[i];
    const errors: string[] = [];
    
    // Schema validation
    const schemaResult = validateGameRecord(game);
    if (!schemaResult.valid) {
      errors.push(...schemaResult.errors);
    }
    
    // Leakage check (using all games before this one)
    const priorGames = sortedGames.slice(0, i);
    const leakageResult = checkForLeakage(game, priorGames);
    if (!leakageResult.passed) {
      const criticalViolations = leakageResult.violations.filter(v => v.severity === 'critical');
      errors.push(...criticalViolations.map(v => v.message));
      totalLeakageViolations += criticalViolations.length;
    }
    
    if (errors.length > 0) {
      gameErrors.set(game.game_id.game_pk, errors);
    } else {
      validGames++;
    }
  }
  
  return {
    valid: gameErrors.size === 0,
    gameErrors,
    summary: {
      totalGames: games.length,
      validGames,
      invalidGames: games.length - validGames,
      leakageViolations: totalLeakageViolations
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Validation
  validateGameRecord,
  runFullValidation,
  validateDataset,
  
  // Leakage detection
  checkForLeakage,
  validateRollingWindowSource,
  
  // Feature isolation
  stripOutcomes,
  createFeatureSafeDataset,
  getHistoricalGames,
  getPlayerGamesForRolling,
  
  // Date utilities
  isStrictlyBefore,
  isTimestampBefore,
  parseGameDate,
  getStartOfDayUTC
};
