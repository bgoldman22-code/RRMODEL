/**
 * Universal NBA Team Mapper
 * Handles ALL team name variations from ALL data sources
 * Enhanced with NBA IDs and spacing-insensitive matching
 * 
 * Updated: November 12, 2025
 * Includes: ESPN, The Odds API, NBA Stats API, NBA CDN, Basketball Ref
 */

import teamInfo from '../../../data/nba/teams/team-info.json' with { type: 'json' };

// ============================================================================
// BUILD LOOKUP MAPS
// ============================================================================

const TRICODE_TO_INFO = new Map();
const ID_TO_INFO = new Map();
const FULL_TO_INFO = new Map();
const ALIASES = new Map();

// Initialize from canonical team-info.json
teamInfo.teams.forEach(team => {
  const info = {
    id: team.id,
    tricode: team.abbreviation,
    fullName: team.name,
    city: team.city,
    nickname: team.name.replace(team.city, '').trim()
  };
  
  // Primary lookups
  TRICODE_TO_INFO.set(info.tricode, info);
  ID_TO_INFO.set(info.id, info);
  ID_TO_INFO.set(String(info.id), info); // Also support string IDs
  
  // Full name lookups (case-insensitive)
  FULL_TO_INFO.set(info.fullName.toLowerCase(), info);
  
  // Aliases (case-insensitive, spacing-insensitive)
  const addAlias = (alias) => {
    ALIASES.set(alias.toLowerCase(), info);
    ALIASES.set(alias.toLowerCase().replace(/\s+/g, ''), info); // No spaces
    ALIASES.set(alias.toLowerCase().replace(/\s+/g, '-'), info); // Dashes
  };
  
  // Standard aliases
  addAlias(info.fullName);                           // "Golden State Warriors"
  addAlias(`${info.city} ${info.nickname}`);         // Same as fullName but explicit
  addAlias(info.nickname);                           // "Warriors"
  addAlias(info.city);                               // "Golden State" (risky but useful)
  
  // Abbreviated city
  const cityWords = info.city.split(' ');
  if (cityWords.length > 1) {
    addAlias(`${cityWords[0]} ${info.nickname}`);    // "Golden Warriors"
  }
  
  // LA special cases
  if (info.city === 'Los Angeles') {
    addAlias(`LA ${info.nickname}`);                 // "LA Lakers"
    addAlias(`L.A. ${info.nickname}`);               // "L.A. Lakers"
    addAlias(`Los Angeles ${info.nickname}`);        // Explicit
    
    // Clippers-specific
    if (info.tricode === 'LAC') {
      addAlias('LA Clippers');
      addAlias('L.A. Clippers');
      addAlias('Clippers');
    }
    
    // Lakers-specific
    if (info.tricode === 'LAL') {
      addAlias('LA Lakers');
      addAlias('L.A. Lakers');
      addAlias('Lakers');
    }
  }
  
  // NY special cases
  if (info.city === 'New York') {
    addAlias(`NY ${info.nickname}`);                 // "NY Knicks"
    addAlias(`N.Y. ${info.nickname}`);               // "N.Y. Knicks"
    addAlias(`New York ${info.nickname}`);           // Explicit
  }
  
  // 76ers special cases (spacing quirks)
  if (info.tricode === 'PHI') {
    addAlias('Philadelphia 76ers');
    addAlias('Philadelphia Sixers');
    addAlias('Philly 76ers');
    addAlias('Philly Sixers');
    addAlias('76ers');
    addAlias('Sixers');
    addAlias('Philadelphia76ers');                   // No space
    addAlias('PhiladelphiaSixers');
  }
  
  // Trail Blazers special cases (spacing quirks)
  if (info.tricode === 'POR') {
    addAlias('Portland Trail Blazers');
    addAlias('Portland TrailBlazers');               // One word
    addAlias('Portland Trailblazers');               // Lowercase
    addAlias('Trail Blazers');
    addAlias('TrailBlazers');
    addAlias('Blazers');
  }
});

// ============================================================================
// NORMALIZATION FUNCTION
// ============================================================================

/**
 * Resolve any team name variation to standard tricode
 * @param {string|number} input - Any team identifier (name, tricode, ID)
 * @returns {string|null} - Standard tricode (e.g., "GSW") or null if not found
 */
export function normalizeTeamName(input) {
  if (!input) return null;
  
  // Handle numeric IDs
  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const info = ID_TO_INFO.get(typeof input === 'number' ? input : parseInt(input));
    return info?.tricode || null;
  }
  
  const cleaned = String(input).trim();
  
  // Already a tricode? (3 chars, all uppercase)
  if (/^[A-Z]{3}$/.test(cleaned)) {
    return TRICODE_TO_INFO.has(cleaned) ? cleaned : null;
  }
  
  // Try exact full name match (case-insensitive)
  const lower = cleaned.toLowerCase();
  if (FULL_TO_INFO.has(lower)) {
    return FULL_TO_INFO.get(lower).tricode;
  }
  
  // Try aliases (case-insensitive, spacing-insensitive)
  const normalized = lower.replace(/\s+/g, ' ');     // Normalize spaces
  const noSpaces = lower.replace(/\s+/g, '');        // Remove all spaces
  const withDashes = lower.replace(/\s+/g, '-');     // Replace with dashes
  
  if (ALIASES.has(normalized)) {
    return ALIASES.get(normalized).tricode;
  }
  
  if (ALIASES.has(noSpaces)) {
    return ALIASES.get(noSpaces).tricode;
  }
  
  if (ALIASES.has(withDashes)) {
    return ALIASES.get(withDashes).tricode;
  }
  
  // Fuzzy match: check if input contains a known nickname
  for (const [alias, info] of ALIASES.entries()) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return info.tricode;
    }
  }
  
  console.warn(`⚠️ Could not resolve team name: "${input}"`);
  return null;
}

// ============================================================================
// INFO GETTERS
// ============================================================================

/**
 * Get full team info from tricode, ID, or name
 * @param {string|number} input - Any team identifier
 * @returns {object|null} - Team info object or null
 */
export function getTeamInfo(input) {
  const tricode = normalizeTeamName(input);
  return tricode ? TRICODE_TO_INFO.get(tricode) : null;
}

/**
 * Get full team name from tricode, ID, or name
 * @param {string|number} input - Any team identifier
 * @returns {string|null} - Full team name or null
 */
export function getFullName(input) {
  return getTeamInfo(input)?.fullName || null;
}

/**
 * Get NBA team ID from tricode, name, or existing ID
 * @param {string|number} input - Any team identifier
 * @returns {number|null} - NBA team ID or null
 */
export function getTeamId(input) {
  return getTeamInfo(input)?.id || null;
}

/**
 * Get team city from tricode, ID, or name
 * @param {string|number} input - Any team identifier
 * @returns {string|null} - City name or null
 */
export function getTeamCity(input) {
  return getTeamInfo(input)?.city || null;
}

// ============================================================================
// VALIDATION & COMPARISON
// ============================================================================

/**
 * Validate a matchup (check both teams are valid)
 * @param {string|number} homeTeam - Home team identifier
 * @param {string|number} awayTeam - Away team identifier
 * @returns {object} - { valid, home, away }
 */
export function validateMatchup(homeTeam, awayTeam) {
  const home = normalizeTeamName(homeTeam);
  const away = normalizeTeamName(awayTeam);
  
  if (!home || !away) {
    console.error(`❌ Invalid matchup: ${homeTeam} vs ${awayTeam}`);
    return { valid: false, home: null, away: null };
  }
  
  if (home === away) {
    console.error(`❌ Same team in matchup: ${homeTeam} vs ${awayTeam}`);
    return { valid: false, home: null, away: null };
  }
  
  return { valid: true, home, away };
}

/**
 * Compare two team names (handles any format)
 * @param {string|number} team1 - First team identifier
 * @param {string|number} team2 - Second team identifier
 * @returns {boolean} - True if same team
 */
export function teamsMatch(team1, team2) {
  const t1 = normalizeTeamName(team1);
  const t2 = normalizeTeamName(team2);
  return t1 && t2 && t1 === t2;
}

/**
 * Get all valid tricodes
 * @returns {string[]} - Array of all tricodes
 */
export function getAllTricodes() {
  return Array.from(TRICODE_TO_INFO.keys());
}

/**
 * Get all team infos
 * @returns {object[]} - Array of all team info objects
 */
export function getAllTeams() {
  return Array.from(TRICODE_TO_INFO.values());
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  normalizeTeamName,
  getTeamInfo,
  getFullName,
  getTeamId,
  getTeamCity,
  validateMatchup,
  teamsMatch,
  getAllTricodes,
  getAllTeams,
  TRICODE_TO_INFO,
  ID_TO_INFO
};
