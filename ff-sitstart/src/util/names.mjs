// Team name normalization mappings
export const TEAM_ALIASES = {
  // NFL team abbreviations to full names
  'ARI': ['Arizona Cardinals', 'ARI', 'Arizona'],
  'ATL': ['Atlanta Falcons', 'ATL', 'Atlanta'],
  'BAL': ['Baltimore Ravens', 'BAL', 'Baltimore'],
  'BUF': ['Buffalo Bills', 'BUF', 'Buffalo'],
  'CAR': ['Carolina Panthers', 'CAR', 'Carolina'],
  'CHI': ['Chicago Bears', 'CHI', 'Chicago'],
  'CIN': ['Cincinnati Bengals', 'CIN', 'Cincinnati'],
  'CLE': ['Cleveland Browns', 'CLE', 'Cleveland'],
  'DAL': ['Dallas Cowboys', 'DAL', 'Dallas'],
  'DEN': ['Denver Broncos', 'DEN', 'Denver'],
  'DET': ['Detroit Lions', 'DET', 'Detroit'],
  'GB': ['Green Bay Packers', 'GB', 'Green Bay', 'GNB'],
  'HOU': ['Houston Texans', 'HOU', 'Houston'],
  'IND': ['Indianapolis Colts', 'IND', 'Indianapolis'],
  'JAX': ['Jacksonville Jaguars', 'JAX', 'Jacksonville', 'JAC'],
  'KC': ['Kansas City Chiefs', 'KC', 'Kansas City', 'KAN'],
  'LV': ['Las Vegas Raiders', 'LV', 'Las Vegas', 'Raiders', 'OAK'],
  'LAC': ['Los Angeles Chargers', 'LAC', 'LA Chargers', 'L.A. Chargers', 'Chargers', 'SD'],
  'LAR': ['Los Angeles Rams', 'LAR', 'LA Rams', 'L.A. Rams', 'Rams', 'LA', 'STL'],
  'MIA': ['Miami Dolphins', 'MIA', 'Miami'],
  'MIN': ['Minnesota Vikings', 'MIN', 'Minnesota'],
  'NE': ['New England Patriots', 'NE', 'New England', 'Patriots', 'NWE'],
  'NO': ['New Orleans Saints', 'NO', 'New Orleans', 'Saints', 'NOR'],
  'NYG': ['New York Giants', 'NYG', 'NY Giants', 'Giants'],
  'NYJ': ['New York Jets', 'NYJ', 'NY Jets', 'Jets'],
  'PHI': ['Philadelphia Eagles', 'PHI', 'Philadelphia'],
  'PIT': ['Pittsburgh Steelers', 'PIT', 'Pittsburgh'],
  'SF': ['San Francisco 49ers', 'SF', 'San Francisco', '49ers', 'SFO'],
  'SEA': ['Seattle Seahawks', 'SEA', 'Seattle'],
  'TB': ['Tampa Bay Buccaneers', 'TB', 'Tampa Bay', 'Tampa', 'TAM'],
  'TEN': ['Tennessee Titans', 'TEN', 'Tennessee'],
  'WAS': ['Washington Commanders', 'WAS', 'Washington', 'WSH']
};

// Build reverse lookup
const ALIAS_TO_ABBR = {};
for (const [abbr, aliases] of Object.entries(TEAM_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_ABBR[alias.toLowerCase()] = abbr;
  }
}

export function normalizeTeam(teamName) {
  if (!teamName) return null;
  
  const clean = teamName.trim();
  const lower = clean.toLowerCase();
  
  // Direct match
  if (ALIAS_TO_ABBR[lower]) {
    return ALIAS_TO_ABBR[lower];
  }
  
  // Fuzzy match (contains)
  for (const [alias, abbr] of Object.entries(ALIAS_TO_ABBR)) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return abbr;
    }
  }
  
  return clean; // Return as-is if no match
}

// Player name normalization
export function normalizePlayerName(name) {
  if (!name) return null;
  
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .replace(/Jr\.?|Sr\.?|III|II|IV/gi, '')
    .trim();
}

// Fuzzy match player by name + team
export function matchPlayer(targetName, targetTeam, candidatesList) {
  const normTarget = normalizePlayerName(targetName).toLowerCase();
  const normTeam = normalizeTeam(targetTeam);
  
  // Exact match (name + team)
  for (const candidate of candidatesList) {
    const normCandidate = normalizePlayerName(candidate.name).toLowerCase();
    const candTeam = normalizeTeam(candidate.team);
    
    if (normCandidate === normTarget && candTeam === normTeam) {
      return candidate;
    }
  }
  
  // Partial match (same team, name contains or vice versa)
  for (const candidate of candidatesList) {
    const normCandidate = normalizePlayerName(candidate.name).toLowerCase();
    const candTeam = normalizeTeam(candidate.team);
    
    if (candTeam === normTeam) {
      if (normCandidate.includes(normTarget) || normTarget.includes(normCandidate)) {
        return candidate;
      }
    }
  }
  
  return null;
}
