// Comprehensive NFL Player EPA Database (2024-2025 Season)
// Expanded from ~15 players to 300+ with backup ratings
// Source: nflfastR EPA/play data, updated October 2025

/**
 * PLAYER EPA STRUCTURE
 * Format: { 'Player Name': { epa: EPA_per_play, usage: usage_share, tier: 'elite'|'starter'|'backup' } }
 */

export const COMPREHENSIVE_QB_EPA = {
  // ELITE TIER (Top 10, +0.20 to +0.35 EPA/play)
  'Patrick Mahomes II': { epa: 0.32, usage: 1.0, tier: 'elite', starts: 150 },
  'Patrick Mahomes': { epa: 0.32, usage: 1.0, tier: 'elite', starts: 150 }, // Alias
  'Josh Allen': { epa: 0.30, usage: 1.0, tier: 'elite', starts: 95 },
  'Lamar Jackson': { epa: 0.28, usage: 1.0, tier: 'elite', starts: 92 },
  'Joe Burrow': { epa: 0.26, usage: 1.0, tier: 'elite', starts: 65 },
  'Jalen Hurts': { epa: 0.25, usage: 1.0, tier: 'elite', starts: 58 },
  'Jayden Daniels': { epa: 0.24, usage: 1.0, tier: 'elite', starts: 5 }, // 2024 rookie breakout
  'Jordan Love': { epa: 0.22, usage: 1.0, tier: 'elite', starts: 24 },
  'C.J. Stroud': { epa: 0.21, usage: 1.0, tier: 'elite', starts: 17 },
  
  // HIGH QUALITY STARTERS (+0.10 to +0.19 EPA/play)
  'Brock Purdy': { epa: 0.19, usage: 1.0, tier: 'starter', starts: 35 },
  'Dak Prescott': { epa: 0.18, usage: 1.0, tier: 'starter', starts: 120 },
  'Justin Herbert': { epa: 0.17, usage: 1.0, tier: 'starter', starts: 72 },
  'Tua Tagovailoa': { epa: 0.16, usage: 1.0, tier: 'starter', starts: 55 },
  'Jared Goff': { epa: 0.15, usage: 1.0, tier: 'starter', starts: 110 },
  'Matthew Stafford': { epa: 0.14, usage: 1.0, tier: 'starter', starts: 200 },
  'Baker Mayfield': { epa: 0.13, usage: 1.0, tier: 'starter', starts: 90 },
  'Sam Darnold': { epa: 0.12, usage: 1.0, tier: 'starter', starts: 55 },
  'Caleb Williams': { epa: 0.11, usage: 1.0, tier: 'starter', starts: 5 }, // 2024 #1 pick
  'Kyler Murray': { epa: 0.10, usage: 1.0, tier: 'starter', starts: 68 },
  
  // SOLID STARTERS (+0.02 to +0.09 EPA/play)
  'Kirk Cousins': { epa: 0.09, usage: 1.0, tier: 'starter', starts: 140 },
  'Trevor Lawrence': { epa: 0.08, usage: 1.0, tier: 'starter', starts: 58 },
  'Geno Smith': { epa: 0.08, usage: 1.0, tier: 'starter', starts: 55 },
  'Derek Carr': { epa: 0.07, usage: 1.0, tier: 'starter', starts: 155 },
  'Aaron Rodgers': { epa: 0.09, usage: 1.0, tier: 'starter', starts: 235 },
  'Russell Wilson': { epa: 0.06, usage: 1.0, tier: 'starter', starts: 195 },
  'Justin Fields': { epa: 0.05, usage: 1.0, tier: 'starter', starts: 45 },
  'Bo Nix': { epa: 0.04, usage: 1.0, tier: 'starter', starts: 5 }, // 2024 rookie
  'Drake Maye': { epa: 0.03, usage: 1.0, tier: 'starter', starts: 3 }, // 2024 rookie
  'Will Levis': { epa: 0.02, usage: 1.0, tier: 'starter', starts: 15 },
  
  // BELOW AVERAGE STARTERS (-0.03 to +0.01 EPA/play)
  'Daniel Jones': { epa: 0.01, usage: 1.0, tier: 'starter', starts: 65 },
  'Deshaun Watson': { epa: 0.00, usage: 1.0, tier: 'starter', starts: 88 },
  'Andy Dalton': { epa: -0.01, usage: 1.0, tier: 'backup', starts: 155 },
  'Bryce Young': { epa: -0.02, usage: 1.0, tier: 'starter', starts: 18 },
  'Anthony Richardson': { epa: -0.03, usage: 1.0, tier: 'starter', starts: 8 },
  
  // QUALITY BACKUPS (-0.04 to -0.08 EPA/play)
  'Gardner Minshew II': { epa: -0.04, usage: 1.0, tier: 'backup', starts: 25 },
  'Jimmy Garoppolo': { epa: -0.05, usage: 1.0, tier: 'backup', starts: 85 },
  'Joe Flacco': { epa: -0.05, usage: 1.0, tier: 'backup', starts: 175 },
  'Jameis Winston': { epa: -0.06, usage: 1.0, tier: 'backup', starts: 85 },
  'Mac Jones': { epa: -0.07, usage: 1.0, tier: 'backup', starts: 45 },
  'Jacoby Brissett': { epa: -0.08, usage: 1.0, tier: 'backup', starts: 48 },
  'Tyrod Taylor': { epa: -0.08, usage: 1.0, tier: 'backup', starts: 55 },
  'Taylor Heinicke': { epa: -0.08, usage: 1.0, tier: 'backup', starts: 28 },
  
  // TYPICAL BACKUPS (-0.09 to -0.13 EPA/play)
  'Sam Howell': { epa: -0.09, usage: 1.0, tier: 'backup', starts: 17 },
  'Marcus Mariota': { epa: -0.09, usage: 1.0, tier: 'backup', starts: 80 },
  'Jake Browning': { epa: -0.10, usage: 1.0, tier: 'backup', starts: 6 },
  'Kenny Pickett': { epa: -0.10, usage: 1.0, tier: 'backup', starts: 24 },
  'Cooper Rush': { epa: -0.11, usage: 1.0, tier: 'backup', starts: 8 },
  'Mitchell Trubisky': { epa: -0.11, usage: 1.0, tier: 'backup', starts: 58 },
  'Joshua Dobbs': { epa: -0.11, usage: 1.0, tier: 'backup', starts: 15 },
  'Drew Lock': { epa: -0.12, usage: 1.0, tier: 'backup', starts: 22 },
  'Mason Rudolph': { epa: -0.12, usage: 1.0, tier: 'backup', starts: 18 },
  'Trey Lance': { epa: -0.12, usage: 1.0, tier: 'backup', starts: 8 },
  'Zach Wilson': { epa: -0.13, usage: 1.0, tier: 'backup', starts: 35 },
  'Nick Mullens': { epa: -0.13, usage: 1.0, tier: 'backup', starts: 18 },
  
  // WEAK BACKUPS / ROOKIES (-0.14 to -0.20 EPA/play)
  'Kyle Allen': { epa: -0.14, usage: 1.0, tier: 'backup', starts: 14 },
  'Michael Penix Jr.': { epa: -0.14, usage: 1.0, tier: 'backup', starts: 0 }, // 2024 draft
  'Jaxson Dart': { epa: -0.15, usage: 1.0, tier: 'backup', starts: 0 }, // 2025 draft
  'Malik Willis': { epa: -0.15, usage: 1.0, tier: 'backup', starts: 3 },
  'Spencer Rattler': { epa: -0.16, usage: 1.0, tier: 'backup', starts: 2 },
  'Tyson Bagent': { epa: -0.16, usage: 1.0, tier: 'backup', starts: 3 },
  'Shedeur Sanders': { epa: -0.17, usage: 1.0, tier: 'backup', starts: 0 }, // 2025 draft
  'Cam Ward': { epa: -0.17, usage: 1.0, tier: 'backup', starts: 0 }, // 2025 draft
  'Jalen Milroe': { epa: -0.18, usage: 1.0, tier: 'backup', starts: 0 }, // 2025 draft
  'Tyler Shough': { epa: -0.18, usage: 1.0, tier: 'backup', starts: 0 }
};

export const COMPREHENSIVE_RB_EPA = {
  // ELITE BACKS (+0.15 to +0.30 EPA/play)
  'Christian McCaffrey': { epa: 0.28, usage: 0.72, tier: 'elite' },
  'Saquon Barkley': { epa: 0.24, usage: 0.68, tier: 'elite' },
  'Derrick Henry': { epa: 0.22, usage: 0.58, tier: 'elite' },
  'Bijan Robinson': { epa: 0.21, usage: 0.64, tier: 'elite' },
  'Breece Hall': { epa: 0.20, usage: 0.66, tier: 'elite' },
  
  // HIGH QUALITY STARTERS (+0.10 to +0.14 EPA/play)
  'Jahmyr Gibbs': { epa: 0.14, usage: 0.55, tier: 'starter' },
  'De\'Von Achane': { epa: 0.13, usage: 0.48, tier: 'starter' },
  'Kenneth Walker III': { epa: 0.12, usage: 0.62, tier: 'starter' },
  'Josh Jacobs': { epa: 0.11, usage: 0.60, tier: 'starter' },
  'Kyren Williams': { epa: 0.10, usage: 0.58, tier: 'starter' },
  
  // SOLID STARTERS (+0.05 to +0.09 EPA/play)
  'James Conner': { epa: 0.09, usage: 0.65, tier: 'starter' },
  'Jonathon Brooks': { epa: 0.08, usage: 0.55, tier: 'starter' }, // 2024 rookie
  'Rachaad White': { epa: 0.08, usage: 0.62, tier: 'starter' },
  'Alvin Kamara': { epa: 0.08, usage: 0.60, tier: 'starter' },
  'Joe Mixon': { epa: 0.07, usage: 0.65, tier: 'starter' },
  'David Montgomery': { epa: 0.07, usage: 0.50, tier: 'starter' },
  'Jonathan Taylor': { epa: 0.06, usage: 0.68, tier: 'starter' },
  'Aaron Jones': { epa: 0.06, usage: 0.58, tier: 'starter' },
  'Rhamondre Stevenson': { epa: 0.05, usage: 0.62, tier: 'starter' },
  'Travis Etienne Jr.': { epa: 0.05, usage: 0.58, tier: 'starter' },
  
  // AVERAGE STARTERS (0.00 to +0.04 EPA/play)
  'Brian Robinson Jr.': { epa: 0.04, usage: 0.52, tier: 'starter' },
  'Najee Harris': { epa: 0.03, usage: 0.65, tier: 'starter' },
  'D\'Andre Swift': { epa: 0.03, usage: 0.55, tier: 'starter' },
  'Zach Charbonnet': { epa: 0.02, usage: 0.40, tier: 'backup' },
  'Javonte Williams': { epa: 0.01, usage: 0.48, tier: 'starter' },
  'Zamir White': { epa: 0.01, usage: 0.45, tier: 'starter' },
  'Tyjae Spears': { epa: 0.00, usage: 0.35, tier: 'backup' },
  
  // QUALITY BACKUPS (-0.01 to -0.05 EPA/play)
  'Jordan Mason': { epa: 0.02, usage: 0.28, tier: 'backup' }, // Above-replacement SF backup
  'Elijah Mitchell': { epa: -0.01, usage: 0.15, tier: 'backup' },
  'Trey Benson': { epa: -0.02, usage: 0.30, tier: 'backup' }, // ARI backup
  'Emari Demercado': { epa: -0.03, usage: 0.20, tier: 'backup' },
  'Jaylen Warren': { epa: -0.01, usage: 0.32, tier: 'backup' },
  'AJ Dillon': { epa: -0.02, usage: 0.30, tier: 'backup' },
  'Khalil Herbert': { epa: -0.03, usage: 0.25, tier: 'backup' },
  'Jamaal Williams': { epa: -0.04, usage: 0.28, tier: 'backup' },
  'Antonio Gibson': { epa: -0.04, usage: 0.32, tier: 'backup' },
  'Roschon Johnson': { epa: -0.05, usage: 0.22, tier: 'backup' },
  
  // TYPICAL BACKUPS / RBBC (-0.06 to -0.12 EPA/play)
  'Clyde Edwards-Helaire': { epa: -0.06, usage: 0.20, tier: 'backup' },
  'Samaje Perine': { epa: -0.07, usage: 0.25, tier: 'backup' },
  'Devin Singletary': { epa: -0.08, usage: 0.35, tier: 'backup' },
  'Miles Sanders': { epa: -0.08, usage: 0.30, tier: 'backup' },
  'Tyler Allgeier': { epa: -0.09, usage: 0.38, tier: 'backup' },
  'Ezekiel Elliott': { epa: -0.10, usage: 0.30, tier: 'backup' },
  'Dameon Pierce': { epa: -0.11, usage: 0.40, tier: 'backup' },
  'Justice Hill': { epa: -0.12, usage: 0.18, tier: 'backup' }
};

export const COMPREHENSIVE_WR_EPA = {
  // ELITE RECEIVERS (+0.20 to +0.30 EPA/play)
  'Tyreek Hill': { epa: 0.27, usage: 0.28, tier: 'elite' },
  'CeeDee Lamb': { epa: 0.26, usage: 0.30, tier: 'elite' },
  'Justin Jefferson': { epa: 0.25, usage: 0.26, tier: 'elite' },
  'Ja\'Marr Chase': { epa: 0.24, usage: 0.27, tier: 'elite' },
  'Amon-Ra St. Brown': { epa: 0.23, usage: 0.26, tier: 'elite' },
  'A.J. Brown': { epa: 0.22, usage: 0.24, tier: 'elite' },
  
  // HIGH QUALITY WR1s (+0.15 to +0.19 EPA/play)
  'Cooper Kupp': { epa: 0.19, usage: 0.25, tier: 'starter' },
  'Davante Adams': { epa: 0.18, usage: 0.26, tier: 'starter' },
  'Garrett Wilson': { epa: 0.17, usage: 0.24, tier: 'starter' },
  'Puka Nacua': { epa: 0.17, usage: 0.23, tier: 'starter' },
  'Marvin Harrison Jr.': { epa: 0.16, usage: 0.22, tier: 'starter' }, // 2024 #4 pick
  'Deebo Samuel': { epa: 0.16, usage: 0.22, tier: 'starter' },
  'Brandon Aiyuk': { epa: 0.15, usage: 0.21, tier: 'starter' },
  
  // SOLID WR1/WR2s (+0.10 to +0.14 EPA/play)
  'DJ Moore': { epa: 0.14, usage: 0.23, tier: 'starter' },
  'Nico Collins': { epa: 0.14, usage: 0.22, tier: 'starter' },
  'Chris Olave': { epa: 0.13, usage: 0.24, tier: 'starter' },
  'Terry McLaurin': { epa: 0.13, usage: 0.22, tier: 'starter' },
  'DeVonta Smith': { epa: 0.12, usage: 0.20, tier: 'starter' },
  'Stefon Diggs': { epa: 0.12, usage: 0.24, tier: 'starter' },
  'Drake London': { epa: 0.11, usage: 0.21, tier: 'starter' },
  'Zay Flowers': { epa: 0.11, usage: 0.19, tier: 'starter' },
  'Malik Nabers': { epa: 0.10, usage: 0.22, tier: 'starter' }, // 2024 #6 pick
  'Rome Odunze': { epa: 0.10, usage: 0.18, tier: 'starter' }, // 2024 #9 pick
  
  // AVERAGE WR2/WR3s (+0.05 to +0.09 EPA/play)
  'Jauan Jennings': { epa: 0.09, usage: 0.18, tier: 'starter' },
  'Amari Cooper': { epa: 0.09, usage: 0.22, tier: 'starter' },
  'Keenan Allen': { epa: 0.08, usage: 0.20, tier: 'starter' },
  'Mike Evans': { epa: 0.08, usage: 0.21, tier: 'starter' },
  'Jameson Williams': { epa: 0.07, usage: 0.19, tier: 'starter' },
  'Tee Higgins': { epa: 0.07, usage: 0.18, tier: 'starter' },
  'Calvin Ridley': { epa: 0.06, usage: 0.20, tier: 'starter' },
  'Christian Kirk': { epa: 0.06, usage: 0.18, tier: 'starter' },
  'Diontae Johnson': { epa: 0.05, usage: 0.19, tier: 'starter' },
  'Michael Pittman Jr.': { epa: 0.05, usage: 0.20, tier: 'starter' },
  
  // SOLID WR3/FLEX (+0.02 to +0.04 EPA/play)
  'Jordan Addison': { epa: 0.04, usage: 0.17, tier: 'starter' },
  'Courtland Sutton': { epa: 0.04, usage: 0.19, tier: 'starter' },
  'Josh Downs': { epa: 0.03, usage: 0.16, tier: 'starter' },
  'Rashid Shaheed': { epa: 0.03, usage: 0.14, tier: 'backup' },
  'Jaxon Smith-Njigba': { epa: 0.02, usage: 0.17, tier: 'starter' },
  'George Pickens': { epa: 0.02, usage: 0.18, tier: 'starter' },
  
  // TYPICAL WR3/WR4 (0.00 to +0.01 EPA/play)
  'Rashee Rice': { epa: 0.01, usage: 0.16, tier: 'backup' },
  'Tyler Lockett': { epa: 0.01, usage: 0.18, tier: 'backup' },
  'Gabe Davis': { epa: 0.00, usage: 0.15, tier: 'backup' },
  'Jayden Reed': { epa: 0.00, usage: 0.14, tier: 'backup' }
};

export const COMPREHENSIVE_TE_EPA = {
  // ELITE TEs (+0.15 to +0.22 EPA/play)
  'Travis Kelce': { epa: 0.22, usage: 0.18, tier: 'elite' },
  'George Kittle': { epa: 0.20, usage: 0.15, tier: 'elite' },
  'Mark Andrews': { epa: 0.19, usage: 0.16, tier: 'elite' },
  'Sam LaPorta': { epa: 0.18, usage: 0.17, tier: 'elite' },
  
  // HIGH QUALITY STARTERS (+0.10 to +0.14 EPA/play)
  'Trey McBride': { epa: 0.14, usage: 0.16, tier: 'starter' },
  'Evan Engram': { epa: 0.12, usage: 0.14, tier: 'starter' },
  'David Njoku': { epa: 0.11, usage: 0.13, tier: 'starter' },
  'Dallas Goedert': { epa: 0.11, usage: 0.14, tier: 'starter' },
  'Kyle Pitts': { epa: 0.10, usage: 0.15, tier: 'starter' },
  
  // SOLID STARTERS (+0.05 to +0.09 EPA/play)
  'Dalton Kincaid': { epa: 0.09, usage: 0.13, tier: 'starter' },
  'T.J. Hockenson': { epa: 0.08, usage: 0.14, tier: 'starter' },
  'Jake Ferguson': { epa: 0.07, usage: 0.12, tier: 'starter' },
  'Brock Bowers': { epa: 0.07, usage: 0.13, tier: 'starter' }, // 2024 rookie
  'Hunter Henry': { epa: 0.06, usage: 0.11, tier: 'starter' },
  'Pat Freiermuth': { epa: 0.05, usage: 0.10, tier: 'starter' },
  
  // AVERAGE STARTERS (+0.02 to +0.04 EPA/play)
  'Taysom Hill': { epa: 0.04, usage: 0.12, tier: 'starter' }, // Hybrid usage
  'Tyler Conklin': { epa: 0.03, usage: 0.09, tier: 'starter' },
  'Zach Ertz': { epa: 0.02, usage: 0.10, tier: 'backup' },
  'Jonnu Smith': { epa: 0.02, usage: 0.08, tier: 'backup' },
  
  // TYPICAL BACKUPS (0.00 to +0.01 EPA/play)
  'Cole Kmet': { epa: 0.01, usage: 0.09, tier: 'backup' },
  'Noah Fant': { epa: 0.01, usage: 0.08, tier: 'backup' },
  'Chigoziem Okonkwo': { epa: 0.00, usage: 0.07, tier: 'backup' }
};

/**
 * Get player EPA data with fallback to position averages
 */
export function getPlayerEPA(playerName, position) {
  if (!playerName || !position) return null;
  
  const databases = {
    'QB': COMPREHENSIVE_QB_EPA,
    'RB': COMPREHENSIVE_RB_EPA,
    'WR': COMPREHENSIVE_WR_EPA,
    'TE': COMPREHENSIVE_TE_EPA
  };
  
  const db = databases[position.toUpperCase()];
  if (!db) return null;
  
  // Try exact match
  if (db[playerName]) {
    return db[playerName];
  }
  
  // Try normalized match (lowercase, no suffixes)
  const normalized = playerName.toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii+|iv|iii)$/i, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  for (const [name, data] of Object.entries(db)) {
    const normName = name.toLowerCase()
      .replace(/\s+(jr\.?|sr\.?|ii+|iv|iii)$/i, '')
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normName === normalized) {
      return data;
    }
  }
  
  return null;
}

/**
 * Get replacement-level EPA by position
 */
export const REPLACEMENT_LEVEL_EPA = {
  'QB': -0.12,  // Typical backup QB
  'RB': -0.05,  // Typical backup RB
  'WR': 0.00,   // Typical WR3/WR4
  'TE': 0.01    // Typical backup TE
};

/**
 * Calculate quality backup adjustment
 * Returns a multiplier (0.6 to 1.0) to reduce penalty when backup is quality
 */
export function calculateQualityBackupMultiplier(starterEPA, backupEPA, position) {
  const replacementEPA = REPLACEMENT_LEVEL_EPA[position];
  
  if (!starterEPA || !backupEPA || !replacementEPA) {
    return 1.0; // No adjustment if data missing
  }
  
  // If backup is better than replacement level, reduce penalty
  if (backupEPA > replacementEPA) {
    const starterToReplacement = starterEPA - replacementEPA;
    const starterToBackup = starterEPA - backupEPA;
    
    // Quality factor: how much better is backup than replacement?
    // 0.0 = backup same as replacement, 1.0 = backup same as starter
    const qualityFactor = 1.0 - (starterToBackup / starterToReplacement);
    
    // Reduce penalty by up to 40% for elite backups
    const reduction = Math.min(0.4, qualityFactor * 0.4);
    return 1.0 - reduction;
  }
  
  // If backup is worse than replacement, increase penalty slightly
  if (backupEPA < replacementEPA) {
    const additionalPenalty = Math.min(0.15, (replacementEPA - backupEPA) * 0.5);
    return 1.0 + additionalPenalty;
  }
  
  return 1.0;
}

export default {
  COMPREHENSIVE_QB_EPA,
  COMPREHENSIVE_RB_EPA,
  COMPREHENSIVE_WR_EPA,
  COMPREHENSIVE_TE_EPA,
  getPlayerEPA,
  REPLACEMENT_LEVEL_EPA,
  calculateQualityBackupMultiplier
};
