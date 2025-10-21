/**
 * NBA Name Normalization Utility
 * 
 * Handles diacritic stripping, punctuation, and common aliases
 * Critical for matching players/teams across different data sources
 * 
 * GPT Feedback Fix #2: Name canonicalization
 */

/**
 * Normalize a name for matching (strip diacritics, punctuation, standardize case)
 */
export function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .normalize('NFKD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .toUpperCase();
}

/**
 * Common NBA name aliases / edge cases
 * Maps normalized names to canonical names
 */
const NAME_ALIASES = {
  // Punctuation variations
  'AJ GREEN': 'A.J. GREEN',
  'JJ REDICK': 'J.J. REDICK',
  'PJ TUCKER': 'P.J. TUCKER',
  'RJ BARRETT': 'R.J. BARRETT',
  'OG ANUNOBY': 'O.G. ANUNOBY',
  'KJ MARTIN': 'K.J. MARTIN',
  'TJ MCCONNELL': 'T.J. MCCONNELL',
  'CJ MCCOLLUM': 'C.J. MCCOLLUM',
  
  // Nickname variations
  'MICHAEL PORTER': 'MICHAEL PORTER JR',
  'WENDELL CARTER': 'WENDELL CARTER JR',
  'GARY PAYTON': 'GARY PAYTON II',
  'GLEN ROBINSON': 'GLEN ROBINSON III',
  'LONNIE WALKER': 'LONNIE WALKER IV',
  'KEVIN PORTER': 'KEVIN PORTER JR',
  'DERRICK JONES': 'DERRICK JONES JR',
  'KELLY OUBRE': 'KELLY OUBRE JR',
  'TROY BROWN': 'TROY BROWN JR',
  'JAREN JACKSON': 'JAREN JACKSON JR',
  
  // Common misspellings / accented names
  'NIKOLA JOKIC': 'NIKOLA JOKIĆ',
  'LUKA DONCIC': 'LUKA DONČIĆ',
  'BOGDAN BOGDANOVIC': 'BOGDAN BOGDANOVIĆ',
  'BOJAN BOGDANOVIC': 'BOJAN BOGDANOVIĆ',
  'NIKOLA VUCEVIC': 'NIKOLA VUČEVIĆ',
  'DARIO SARIC': 'DARIO ŠARIĆ',
  'GORAN DRAGIC': 'GORAN DRAGIĆ',
  'JUSUF NURKIC': 'JUSUF NURKIĆ',
  'SANDRO MAMUKELASHVILI': 'SANDRO MAMUKELASHVILI',
  
  // International names with accent variations
  'JOSE ALVARADO': 'JOSÉ ALVARADO',
  'JUAN TOSCANO ANDERSON': 'JUAN TOSCANO-ANDERSON',
  'SANTI ALDAMA': 'SANTIAGO ALDAMA',
  'ALPEREN SENGUN': 'ALPEREN ŞENGÜN',
  'CEDI OSMAN': 'CEDI OSMAN',
  'FURKAN KORKMAZ': 'FURKAN KORKMAZ',
  
  // Hyphenated names
  'CAMERON THOMAS': 'CAM THOMAS', // Sometimes abbreviated
  'KENTAVIOUS CALDWELL POPE': 'KENTAVIOUS CALDWELL-POPE',
  'MICHAEL PORTER JR': 'MICHAEL PORTER JR.',
  
  // Team name variations
  'GOLDEN STATE': 'GOLDEN STATE WARRIORS',
  'LOS ANGELES LAKERS': 'LA LAKERS',
  'LOS ANGELES CLIPPERS': 'LA CLIPPERS',
  'NEW YORK': 'NEW YORK KNICKS',
  'SAN ANTONIO': 'SAN ANTONIO SPURS'
};

/**
 * Match a name with aliases and normalization
 * Returns the canonical name if found in alias map, otherwise normalized name
 */
export function canonicalizeName(name) {
  const normalized = normalizeName(name);
  return NAME_ALIASES[normalized] || name; // Return original if not in map (preserve accents)
}

/**
 * Fuzzy match two names (handles slight variations)
 * Returns true if names are likely the same person
 */
export function namesMatch(name1, name2) {
  if (!name1 || !name2) return false;
  
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Check if one is a substring of the other (handles "Michael Porter" vs "Michael Porter Jr")
  if (norm1.length > 5 && norm2.length > 5) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  }
  
  // Check aliases
  const canon1 = canonicalizeName(name1);
  const canon2 = canonicalizeName(name2);
  if (normalizeName(canon1) === normalizeName(canon2)) return true;
  
  return false;
}

/**
 * Find a player in a list by name (fuzzy matching)
 */
export function findPlayerByName(playerName, playerList) {
  if (!playerName || !playerList || playerList.length === 0) return null;
  
  // Try exact match first
  const exactMatch = playerList.find(p => 
    p.name && namesMatch(p.name, playerName)
  );
  if (exactMatch) return exactMatch;
  
  // Try normalized match
  const normalizedSearch = normalizeName(playerName);
  const normalizedMatch = playerList.find(p => 
    p.name && normalizeName(p.name) === normalizedSearch
  );
  if (normalizedMatch) return normalizedMatch;
  
  // Try partial match (last name)
  const lastNameSearch = normalizedSearch.split(' ').pop();
  if (lastNameSearch && lastNameSearch.length > 3) {
    const partialMatch = playerList.find(p => {
      if (!p.name) return false;
      const lastName = normalizeName(p.name).split(' ').pop();
      return lastName === lastNameSearch;
    });
    if (partialMatch) return partialMatch;
  }
  
  return null;
}

/**
 * Log unmatched names for review (one-time warning)
 */
const unmatchedNames = new Set();

export function logUnmatchedName(name, source = 'unknown') {
  const key = `${source}:${normalizeName(name)}`;
  if (!unmatchedNames.has(key)) {
    unmatchedNames.add(key);
    console.warn(`[Name Normalization] Unmatched name from ${source}: "${name}" (normalized: "${normalizeName(name)}")`);
  }
}

/**
 * Get stats on unmatched names (for debugging)
 */
export function getUnmatchedNameStats() {
  return {
    count: unmatchedNames.size,
    names: Array.from(unmatchedNames)
  };
}
