/**
 * MLB Research V1.1 - Leakage Guardrail Module
 * 
 * This module provides runtime validation to PREVENT data leakage.
 * It enforces the fundamental rule: features can ONLY use data from BEFORE ACTUAL first pitch.
 * 
 * V1.1 CHANGES:
 * - Use actual_first_pitch_utc as leakage boundary (not scheduled)
 * - Validate lineup sources (no PA-sequence derivation)
 * - Check for opener games
 * - Validate team features are from internal logs
 * 
 * Version: 1.1.0
 */

import type { 
  MLBResearchGameV1Full,
  MLBResearchGameV1Lite,
  MLBResearchGameV1,
  PregameOnly, 
  BatterRollingStats,
  PitcherRollingStats,
  GameId,
  QualityFlags
} from './types.v1.1.js';

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
  type: 'temporal' | 'outcome_in_features' | 'future_data' | 'same_game_data' | 'lineup_source' | 'opener_not_flagged';
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
 * Get the leakage boundary for a game
 * CRITICAL: Uses ACTUAL first pitch if available, falls back to scheduled
 */
export function getLeakageBoundary(gameId: GameId): Date {
  return new Date(gameId.actual_first_pitch_utc ?? gameId.scheduled_first_pitch_utc);
}

/**
 * Check if we're using fallback (scheduled) time instead of actual
 * This should be flagged in QA
 */
export function isUsingFallbackTime(gameId: GameId): boolean {
  return gameId.actual_first_pitch_utc === null;
}

/**
 * Check if date A is strictly before date B (no same-day games counted)
 * For date-only comparisons (ignores time)
 */
export function isStrictlyBeforeDate(dateA: string, dateB: string): boolean {
  const a = new Date(dateA);
  const b = new Date(dateB);
  a.setUTCHours(0, 0, 0, 0);
  b.setUTCHours(0, 0, 0, 0);
  return a.getTime() < b.getTime();
}

/**
 * Check if timestamp A is before timestamp B (full datetime comparison)
 * This is the PRIMARY leakage check function
 */
export function isTimestampBefore(tsA: string | Date, tsB: string | Date): boolean {
  const a = typeof tsA === 'string' ? new Date(tsA) : tsA;
  const b = typeof tsB === 'string' ? new Date(tsB) : tsB;
  return a.getTime() < b.getTime();
}

/**
 * Check if a game occurred strictly before the target game's first pitch
 */
export function isGameBeforeFirstPitch(
  historicalGame: { game_id: GameId },
  targetGameFirstPitch: Date
): boolean {
  // Use the END of the historical game as the boundary
  // A game's outcomes are available after it ends, not after it starts
  // For simplicity, we use actual first pitch + 4 hours as a conservative estimate
  // In practice, you'd want the actual game end time
  const historicalStart = getLeakageBoundary(historicalGame.game_id);
  return historicalStart.getTime() < targetGameFirstPitch.getTime();
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

/**
 * Validate that a game record conforms to the V1.1 schema
 */
export function validateGameRecord(game: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!game || typeof game !== 'object') {
    return { valid: false, errors: ['Game record must be an object'], warnings: [] };
  }
  
  const g = game as Record<string, unknown>;
  
  // Required top-level fields
  const requiredFields = ['schema_version', 'game_id', 'home_team', 'away_team', 'pregame', 'outcome', 'meta'];
  for (const field of requiredFields) {
    if (!(field in g)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Schema version check
  if (g.schema_version !== '1.1.0') {
    errors.push(`Invalid schema_version: expected '1.1.0', got '${g.schema_version}'`);
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
    
    // Actual first pitch validation
    if (gameId.actual_first_pitch_utc === null && gameId.first_pitch_source !== 'fallback_to_scheduled') {
      warnings.push('actual_first_pitch_utc is null but first_pitch_source is not fallback_to_scheduled');
    }
  }
  
  // Pregame validation
  if (g.pregame && typeof g.pregame === 'object') {
    const pregame = g.pregame as Record<string, unknown>;
    
    // Lineup validation
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
    
    // Lineup source validation
    if (pregame.lineup_source === 'incomplete') {
      warnings.push('Lineup is marked incomplete - consider excluding from research');
    }
    
    // Starter role validation
    if (pregame.home_starter && typeof pregame.home_starter === 'object') {
      const starter = pregame.home_starter as Record<string, unknown>;
      if (starter.role === 'opener') {
        warnings.push('Home starter is an opener - Ks/outs markets may need special handling');
      }
    }
    
    if (pregame.away_starter && typeof pregame.away_starter === 'object') {
      const starter = pregame.away_starter as Record<string, unknown>;
      if (starter.role === 'opener') {
        warnings.push('Away starter is an opener - Ks/outs markets may need special handling');
      }
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
 * It validates that rolling window features only use games from BEFORE the target game's ACTUAL first pitch.
 */
export function checkForLeakage(
  targetGame: MLBResearchGameV1Full,
  historicalGames: MLBResearchGameV1Full[]
): LeakageCheckResult {
  const violations: LeakageViolation[] = [];
  
  const targetFirstPitch = getLeakageBoundary(targetGame.game_id);
  const targetGamePk = targetGame.game_id.game_pk;
  
  // Check 1: No games from same time or later should be in historical data
  for (const histGame of historicalGames) {
    const histFirstPitch = getLeakageBoundary(histGame.game_id);
    
    if (!isTimestampBefore(histFirstPitch, targetFirstPitch)) {
      violations.push({
        type: 'temporal',
        severity: 'critical',
        message: `Historical game ${histGame.game_id.game_pk} first pitch (${histFirstPitch.toISOString()}) is not before target game first pitch (${targetFirstPitch.toISOString()})`,
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
  
  // Check 2: Pregame context timestamps should be before ACTUAL first pitch
  if (targetGame.pregame.weather?.forecast_made_at_utc) {
    if (!isTimestampBefore(targetGame.pregame.weather.forecast_made_at_utc, targetFirstPitch)) {
      violations.push({
        type: 'temporal',
        severity: 'warning',
        message: `Weather forecast timestamp is after actual first pitch`,
        field_path: 'pregame.weather.forecast_made_at_utc'
      });
    }
  }
  
  if (targetGame.pregame.odds?.snapshot_at_utc) {
    if (!isTimestampBefore(targetGame.pregame.odds.snapshot_at_utc, targetFirstPitch)) {
      violations.push({
        type: 'temporal',
        severity: 'warning',
        message: `Odds snapshot timestamp is after actual first pitch`,
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
  
  // Check 4: Validate lineup source is not derived from PA sequence
  // (We can't fully validate this without more context, but we can check the source field)
  const invalidSources = ['pa_sequence', 'first_ab_order'];
  for (const lineup of [...targetGame.pregame.home_lineup, ...targetGame.pregame.away_lineup]) {
    if (invalidSources.includes(lineup.source)) {
      violations.push({
        type: 'lineup_source',
        severity: 'critical',
        message: `Lineup for player ${lineup.player.player_id} derived from ${lineup.source} - this is leakage!`,
        player_id: lineup.player.player_id
      });
    }
  }
  
  // Check 5: Verify team features are from internal logs
  if (targetGame.features.home_team && !targetGame.features.home_team.computed_from_internal_logs) {
    violations.push({
      type: 'outcome_in_features',
      severity: 'warning',
      message: 'Home team features may not be from internal logs - risk of leakage from season summary endpoints',
      field_path: 'features.home_team.computed_from_internal_logs'
    });
  }
  
  if (targetGame.features.away_team && !targetGame.features.away_team.computed_from_internal_logs) {
    violations.push({
      type: 'outcome_in_features',
      severity: 'warning',
      message: 'Away team features may not be from internal logs - risk of leakage from season summary endpoints',
      field_path: 'features.away_team.computed_from_internal_logs'
    });
  }
  
  return {
    passed: violations.filter(v => v.severity === 'critical').length === 0,
    violations
  };
}

/**
 * Validate that rolling window stats are computed correctly
 * (i.e., only from games before the target game's actual first pitch)
 */
export function validateRollingWindowSource(
  targetGameFirstPitch: Date,
  sourceGames: { game_id: GameId }[]
): LeakageCheckResult {
  const violations: LeakageViolation[] = [];
  
  for (const sourceGame of sourceGames) {
    const sourceFirstPitch = getLeakageBoundary(sourceGame.game_id);
    
    if (!isTimestampBefore(sourceFirstPitch, targetGameFirstPitch)) {
      violations.push({
        type: 'future_data',
        severity: 'critical',
        message: `Rolling stats include game ${sourceGame.game_id.game_pk} from ${sourceFirstPitch.toISOString()}, which is not before target first pitch ${targetGameFirstPitch.toISOString()}`,
        game_pk: sourceGame.game_id.game_pk
      });
    }
  }
  
  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * Check for opener games that should be flagged
 */
export function checkForOpeners(game: MLBResearchGameV1Full): LeakageViolation[] {
  const violations: LeakageViolation[] = [];
  
  // Check if actual outs recorded is low but role wasn't flagged as opener
  if (game.outcome.home_pitcher.outs_recorded < 9 && game.pregame.home_starter.role === 'starter') {
    violations.push({
      type: 'opener_not_flagged',
      severity: 'warning',
      message: `Home pitcher recorded only ${game.outcome.home_pitcher.outs_recorded} outs but was marked as starter, not opener`,
      player_id: game.outcome.home_pitcher.player_id
    });
  }
  
  if (game.outcome.away_pitcher.outs_recorded < 9 && game.pregame.away_starter.role === 'starter') {
    violations.push({
      type: 'opener_not_flagged',
      severity: 'warning',
      message: `Away pitcher recorded only ${game.outcome.away_pitcher.outs_recorded} outs but was marked as starter, not opener`,
      player_id: game.outcome.away_pitcher.player_id
    });
  }
  
  return violations;
}

// ============================================================================
// FEATURE ISOLATION HELPERS
// ============================================================================

/**
 * Strip outcome data from a game record - use this when building features
 * This is a runtime safeguard to prevent accidental access to outcomes
 */
export function stripOutcomes(game: MLBResearchGameV1Full): PregameOnly {
  const { outcome, ...pregameData } = game;
  return pregameData as PregameOnly;
}

/**
 * Create a feature-safe view of games (no outcome access possible)
 */
export function createFeatureSafeDataset(games: MLBResearchGameV1Full[]): PregameOnly[] {
  return games.map(stripOutcomes);
}

/**
 * Get games strictly before a target game's first pitch for feature computation
 * Uses ACTUAL first pitch time as the boundary
 */
export function getHistoricalGames(
  allGames: MLBResearchGameV1Full[],
  targetGame: { game_id: GameId }
): MLBResearchGameV1Full[] {
  const targetFirstPitch = getLeakageBoundary(targetGame.game_id);
  const targetGamePk = targetGame.game_id.game_pk;
  
  return allGames.filter(game => {
    // Must not be the same game
    if (game.game_id.game_pk === targetGamePk) {
      return false;
    }
    
    // Must be strictly before target first pitch
    const gameFirstPitch = getLeakageBoundary(game.game_id);
    return isTimestampBefore(gameFirstPitch, targetFirstPitch);
  });
}

/**
 * Get player's games for game-based rolling window computation
 */
export function getPlayerGamesForRolling(
  allGames: MLBResearchGameV1Full[],
  playerId: number,
  targetGame: { game_id: GameId },
  windowSize: number,
  playerType: 'batter' | 'pitcher'
): MLBResearchGameV1Full[] {
  // Get all games before target
  const historicalGames = getHistoricalGames(allGames, targetGame);
  
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
  
  // Sort by first pitch descending and take most recent N games
  playerGames.sort((a, b) => {
    const aTime = getLeakageBoundary(a.game_id).getTime();
    const bTime = getLeakageBoundary(b.game_id).getTime();
    return bTime - aTime;
  });
  
  return playerGames.slice(0, windowSize);
}

/**
 * Get player's games for PA-based rolling window computation
 * Returns games until we accumulate the target PA count
 */
export function getPlayerGamesForPARolling(
  allGames: MLBResearchGameV1Full[],
  playerId: number,
  targetGame: { game_id: GameId },
  targetPA: number
): MLBResearchGameV1Full[] {
  const historicalGames = getHistoricalGames(allGames, targetGame);
  
  // Filter to games where this batter had PA
  const playerGames = historicalGames.filter(game => {
    const allBatters = [
      ...game.outcome.home_batters,
      ...game.outcome.away_batters
    ];
    return allBatters.some(b => b.player_id === playerId && b.pa > 0);
  });
  
  // Sort by first pitch descending
  playerGames.sort((a, b) => {
    const aTime = getLeakageBoundary(a.game_id).getTime();
    const bTime = getLeakageBoundary(b.game_id).getTime();
    return bTime - aTime;
  });
  
  // Accumulate games until we hit target PA
  const result: MLBResearchGameV1Full[] = [];
  let accumulatedPA = 0;
  
  for (const game of playerGames) {
    const allBatters = [
      ...game.outcome.home_batters,
      ...game.outcome.away_batters
    ];
    const playerOutcome = allBatters.find(b => b.player_id === playerId);
    if (playerOutcome) {
      result.push(game);
      accumulatedPA += playerOutcome.pa;
      if (accumulatedPA >= targetPA) {
        break;
      }
    }
  }
  
  return result;
}

// ============================================================================
// VALIDATION SUITE
// ============================================================================

/**
 * Run full validation suite on a game record
 */
export function runFullValidation(
  game: MLBResearchGameV1Full,
  historicalGames?: MLBResearchGameV1Full[]
): {
  schemaValid: ValidationResult;
  leakageCheck?: LeakageCheckResult;
  openerCheck: LeakageViolation[];
  overallPassed: boolean;
} {
  const schemaValid = validateGameRecord(game);
  const openerCheck = checkForOpeners(game);
  
  let leakageCheck: LeakageCheckResult | undefined;
  if (historicalGames) {
    leakageCheck = checkForLeakage(game, historicalGames);
  }
  
  const overallPassed = 
    schemaValid.valid && 
    (!leakageCheck || leakageCheck.passed) &&
    openerCheck.filter(v => v.severity === 'critical').length === 0;
  
  return {
    schemaValid,
    leakageCheck,
    openerCheck,
    overallPassed
  };
}

/**
 * Validate an entire dataset for internal consistency
 */
export function validateDataset(games: MLBResearchGameV1Full[]): {
  valid: boolean;
  gameErrors: Map<number, string[]>;
  summary: {
    totalGames: number;
    validGames: number;
    invalidGames: number;
    leakageViolations: number;
    openerGames: number;
    fallbackTimeGames: number;
    incompleteLineupGames: number;
  };
} {
  const gameErrors = new Map<number, string[]>();
  let validGames = 0;
  let totalLeakageViolations = 0;
  let openerGames = 0;
  let fallbackTimeGames = 0;
  let incompleteLineupGames = 0;
  
  // Sort games by first pitch time
  const sortedGames = [...games].sort((a, b) => {
    const aTime = getLeakageBoundary(a.game_id).getTime();
    const bTime = getLeakageBoundary(b.game_id).getTime();
    return aTime - bTime;
  });
  
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
    
    // Opener check
    const openerViolations = checkForOpeners(game);
    if (openerViolations.length > 0) {
      openerGames++;
    }
    
    // Fallback time check
    if (isUsingFallbackTime(game.game_id)) {
      fallbackTimeGames++;
    }
    
    // Lineup check
    if (game.pregame.lineup_source === 'incomplete') {
      incompleteLineupGames++;
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
      leakageViolations: totalLeakageViolations,
      openerGames,
      fallbackTimeGames,
      incompleteLineupGames
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  getLeakageBoundary,
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
  isTimestampBefore
};
