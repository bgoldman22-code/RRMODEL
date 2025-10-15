/**
 * Schema Validation for NBA Data
 * 
 * Validates data structure, field presence, and value ranges
 * Ensures data quality before training models
 * 
 * Features:
 * - Schema versioning
 * - Type checking
 * - Range validation
 * - Required field verification
 * - Detailed error reporting
 */

// Schema version - bump when structure changes
export const SCHEMA_VERSION = 1;

/**
 * Team Stats Schema
 * 
 * Defines required fields and valid ranges for team advanced stats
 */
export const TEAM_STATS_SCHEMA = {
  version: SCHEMA_VERSION,
  required: [
    'pace', 'offRtg', 'defRtg', 'netRtg',
    'efg_pct', 'ts_pct', 'tov_pct', 'orb_pct', 'ft_fga'
  ],
  ranges: {
    pace: { min: 80, max: 110, description: 'Possessions per 48 minutes' },
    offRtg: { min: 95, max: 125, description: 'Offensive rating (points per 100 possessions)' },
    defRtg: { min: 95, max: 125, description: 'Defensive rating (points allowed per 100 possessions)' },
    netRtg: { min: -20, max: 20, description: 'Net rating (OffRtg - DefRtg)' },
    efg_pct: { min: 0, max: 1, description: 'Effective field goal percentage' },
    ts_pct: { min: 0, max: 1, description: 'True shooting percentage' },
    tov_pct: { min: 0, max: 0.3, description: 'Turnover percentage' },
    orb_pct: { min: 0, max: 0.5, description: 'Offensive rebound percentage' },
    ft_fga: { min: 0, max: 0.5, description: 'Free throw rate (FTA/FGA)' }
  }
};

/**
 * Player Stats Schema
 */
export const PLAYER_STATS_SCHEMA = {
  version: SCHEMA_VERSION,
  required: [
    'id', 'name', 'team', 'gp', 'mpg',
    'ppg', 'rpg', 'apg', 'bpm', 'vorp'
  ],
  ranges: {
    gp: { min: 0, max: 82, description: 'Games played' },
    mpg: { min: 0, max: 48, description: 'Minutes per game' },
    ppg: { min: 0, max: 50, description: 'Points per game' },
    rpg: { min: 0, max: 20, description: 'Rebounds per game' },
    apg: { min: 0, max: 15, description: 'Assists per game' },
    bpm: { min: -10, max: 15, description: 'Box Plus/Minus' },
    vorp: { min: -2, max: 12, description: 'Value Over Replacement Player' },
    per: { min: 0, max: 40, description: 'Player Efficiency Rating', optional: true },
    ts_pct: { min: 0, max: 1, description: 'True shooting percentage', optional: true },
    usg_pct: { min: 0, max: 0.5, description: 'Usage percentage', optional: true }
  }
};

/**
 * RCI (Roster Continuity Index) Schema
 */
export const RCI_SCHEMA = {
  version: SCHEMA_VERSION,
  required: ['teamId', 'teamAbbr', 'season', 'continuity'],
  continuityFields: ['returningMinutesPct', 'returningBPMPct', 'rci'],
  ranges: {
    returningMinutesPct: { min: 0, max: 1, description: 'Percentage of minutes from returning players' },
    returningBPMPct: { min: 0, max: 1, description: 'Percentage of BPM from returning players' },
    rci: { min: 0, max: 1, description: 'Roster Continuity Index' }
  }
};

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message, field, value, expected) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.expected = expected;
  }
}

/**
 * Validate team stats data
 * 
 * @param {object} data - Team stats object { 'BOS': {...}, 'LAL': {...} }
 * @param {object} options - Validation options
 * @returns {object} Validation result { valid: boolean, errors: [] }
 */
export function validateTeamStats(data, options = {}) {
  const { strict = true, logErrors = true } = options;
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push(new ValidationError('Data must be an object', 'root', data, 'object'));
    return { valid: false, errors };
  }
  
  const teamCount = Object.keys(data).length;
  console.log(`[Validation] Checking ${teamCount} teams...`);
  
  for (const [teamAbbr, stats] of Object.entries(data)) {
    // Check for required fields
    for (const field of TEAM_STATS_SCHEMA.required) {
      if (!(field in stats)) {
        const error = new ValidationError(
          `Missing required field: ${field}`,
          `${teamAbbr}.${field}`,
          undefined,
          'required field'
        );
        errors.push(error);
        if (logErrors) console.error(`[Validation] ❌ ${error.message}`);
      }
    }
    
    // Check value ranges
    for (const [field, range] of Object.entries(TEAM_STATS_SCHEMA.ranges)) {
      if (field in stats) {
        const value = stats[field];
        
        // Type check
        if (typeof value !== 'number' || isNaN(value)) {
          const error = new ValidationError(
            `Invalid type for ${field}`,
            `${teamAbbr}.${field}`,
            value,
            'number'
          );
          errors.push(error);
          if (logErrors) console.error(`[Validation] ❌ ${error.message}: got ${typeof value}`);
          continue;
        }
        
        // Range check
        if (value < range.min || value > range.max) {
          const error = new ValidationError(
            `Value out of range for ${field}`,
            `${teamAbbr}.${field}`,
            value,
            `${range.min} - ${range.max}`
          );
          errors.push(error);
          if (logErrors) {
            console.error(`[Validation] ❌ ${teamAbbr}.${field} = ${value} (expected ${range.min}-${range.max})`);
          }
        }
      }
    }
  }
  
  const valid = errors.length === 0;
  
  if (valid) {
    console.log(`[Validation] ✅ All ${teamCount} teams passed validation`);
  } else {
    console.error(`[Validation] ❌ Found ${errors.length} validation errors`);
  }
  
  if (strict && !valid) {
    throw new ValidationError(
      `Validation failed with ${errors.length} errors`,
      'validation',
      errors,
      'no errors'
    );
  }
  
  return { valid, errors, teamsChecked: teamCount };
}

/**
 * Validate player stats data
 * 
 * @param {object} data - Player stats object { 'playerId': {...} }
 * @param {object} options - Validation options
 * @returns {object} Validation result
 */
export function validatePlayerStats(data, options = {}) {
  const { strict = true, logErrors = true } = options;
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push(new ValidationError('Data must be an object', 'root', data, 'object'));
    return { valid: false, errors };
  }
  
  const playerCount = Object.keys(data).length;
  console.log(`[Validation] Checking ${playerCount} players...`);
  
  for (const [playerId, stats] of Object.entries(data)) {
    // Check for required fields
    for (const field of PLAYER_STATS_SCHEMA.required) {
      if (!(field in stats)) {
        const error = new ValidationError(
          `Missing required field: ${field}`,
          `${playerId}.${field}`,
          undefined,
          'required field'
        );
        errors.push(error);
        if (logErrors) console.error(`[Validation] ❌ ${stats.name || playerId}: missing ${field}`);
      }
    }
    
    // Check value ranges
    for (const [field, range] of Object.entries(PLAYER_STATS_SCHEMA.ranges)) {
      if (range.optional && !(field in stats)) continue; // Skip optional missing fields
      
      if (field in stats) {
        const value = stats[field];
        
        // Type check
        if (typeof value !== 'number' || isNaN(value)) {
          const error = new ValidationError(
            `Invalid type for ${field}`,
            `${playerId}.${field}`,
            value,
            'number'
          );
          errors.push(error);
          if (logErrors) console.error(`[Validation] ❌ ${stats.name}: ${field} is ${typeof value}`);
          continue;
        }
        
        // Range check
        if (value < range.min || value > range.max) {
          const error = new ValidationError(
            `Value out of range for ${field}`,
            `${playerId}.${field}`,
            value,
            `${range.min} - ${range.max}`
          );
          errors.push(error);
          if (logErrors) {
            console.error(`[Validation] ❌ ${stats.name}: ${field} = ${value} (expected ${range.min}-${range.max})`);
          }
        }
      }
    }
  }
  
  const valid = errors.length === 0;
  
  if (valid) {
    console.log(`[Validation] ✅ All ${playerCount} players passed validation`);
  } else {
    console.error(`[Validation] ❌ Found ${errors.length} validation errors`);
  }
  
  if (strict && !valid) {
    throw new ValidationError(
      `Validation failed with ${errors.length} errors`,
      'validation',
      errors,
      'no errors'
    );
  }
  
  return { valid, errors, playersChecked: playerCount };
}

/**
 * Validate RCI data
 * 
 * @param {object} data - RCI data object { 'BOS': {...} }
 * @param {object} options - Validation options
 * @returns {object} Validation result
 */
export function validateRCI(data, options = {}) {
  const { strict = true, logErrors = true } = options;
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push(new ValidationError('Data must be an object', 'root', data, 'object'));
    return { valid: false, errors };
  }
  
  const teamCount = Object.keys(data).length;
  console.log(`[Validation] Checking RCI for ${teamCount} teams...`);
  
  for (const [teamAbbr, teamData] of Object.entries(data)) {
    // Check for required fields
    for (const field of RCI_SCHEMA.required) {
      if (!(field in teamData)) {
        const error = new ValidationError(
          `Missing required field: ${field}`,
          `${teamAbbr}.${field}`,
          undefined,
          'required field'
        );
        errors.push(error);
        if (logErrors) console.error(`[Validation] ❌ ${error.message}`);
      }
    }
    
    // Check continuity object
    if (teamData.continuity) {
      for (const field of RCI_SCHEMA.continuityFields) {
        if (!(field in teamData.continuity)) {
          const error = new ValidationError(
            `Missing continuity field: ${field}`,
            `${teamAbbr}.continuity.${field}`,
            undefined,
            'required field'
          );
          errors.push(error);
          if (logErrors) console.error(`[Validation] ❌ ${error.message}`);
          continue;
        }
        
        const value = teamData.continuity[field];
        const range = RCI_SCHEMA.ranges[field];
        
        // Type check
        if (typeof value !== 'number' || isNaN(value)) {
          const error = new ValidationError(
            `Invalid type for ${field}`,
            `${teamAbbr}.continuity.${field}`,
            value,
            'number'
          );
          errors.push(error);
          if (logErrors) console.error(`[Validation] ❌ ${error.message}`);
          continue;
        }
        
        // Range check
        if (value < range.min || value > range.max) {
          const error = new ValidationError(
            `Value out of range for ${field}`,
            `${teamAbbr}.continuity.${field}`,
            value,
            `${range.min} - ${range.max}`
          );
          errors.push(error);
          if (logErrors) {
            console.error(`[Validation] ❌ ${teamAbbr}.${field} = ${value} (expected ${range.min}-${range.max})`);
          }
        }
      }
    }
  }
  
  const valid = errors.length === 0;
  
  if (valid) {
    console.log(`[Validation] ✅ All ${teamCount} teams passed RCI validation`);
  } else {
    console.error(`[Validation] ❌ Found ${errors.length} validation errors`);
  }
  
  if (strict && !valid) {
    throw new ValidationError(
      `Validation failed with ${errors.length} errors`,
      'validation',
      errors,
      'no errors'
    );
  }
  
  return { valid, errors, teamsChecked: teamCount };
}

/**
 * Validate data file structure
 * 
 * Checks for schema version, metadata, and data structure
 * 
 * @param {object} fileData - Complete file data
 * @param {string} expectedType - Expected data type ('teams', 'players', 'rci')
 * @returns {object} Validation result
 */
export function validateDataFile(fileData, expectedType) {
  const errors = [];
  
  // Check schema version
  if (!fileData.schema_version) {
    errors.push(new ValidationError(
      'Missing schema_version',
      'schema_version',
      undefined,
      SCHEMA_VERSION
    ));
  } else if (fileData.schema_version !== SCHEMA_VERSION) {
    console.warn(`[Validation] ⚠️  Schema version mismatch: file=${fileData.schema_version}, expected=${SCHEMA_VERSION}`);
  }
  
  // Check data object exists
  if (!fileData.data) {
    errors.push(new ValidationError(
      'Missing data object',
      'data',
      undefined,
      'object'
    ));
    return { valid: false, errors };
  }
  
  // Validate data based on type
  let result;
  switch (expectedType) {
    case 'teams':
      result = validateTeamStats(fileData.data, { strict: false });
      break;
    case 'players':
      result = validatePlayerStats(fileData.data, { strict: false });
      break;
    case 'rci':
      result = validateRCI(fileData.data, { strict: false });
      break;
    default:
      return { valid: false, errors: [new ValidationError('Unknown data type', 'type', expectedType, 'teams|players|rci')] };
  }
  
  return {
    valid: errors.length === 0 && result.valid,
    errors: [...errors, ...result.errors],
    ...result
  };
}

/**
 * Create validated data file structure
 * 
 * Wraps data with schema version and metadata
 * 
 * @param {object} data - Raw data object
 * @param {string} dataType - Data type ('teams', 'players', 'rci')
 * @param {object} metadata - Additional metadata
 * @returns {object} Complete file structure
 */
export function createDataFile(data, dataType, metadata = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    data_type: dataType,
    generated_at: new Date().toISOString(),
    ...metadata,
    data
  };
}

export default {
  validateTeamStats,
  validatePlayerStats,
  validateRCI,
  validateDataFile,
  createDataFile,
  SCHEMA_VERSION,
  ValidationError
};
