// netlify/functions/_lib/injury-duration-tracker.js
// Track how long players have been out for residual decay calculations

import { INJURY_CONFIG } from './injury-system-config.js';

/**
 * Injury Duration Tracker
 * Tracks when players first went on injury list to calculate weeks out
 */

import { promises as fs } from 'fs';
import path from 'path';

// File to store injury history
const INJURY_HISTORY_FILE = 'data/nfl/injuries/injury-duration-history.json';

// Current injury tracking data
let injuryHistory = {};

/**
 * Load existing injury duration history
 */
async function loadInjuryHistory() {
  try {
    const historyPath = path.join(process.cwd(), INJURY_HISTORY_FILE);
    const data = await fs.readFile(historyPath, 'utf8');
    injuryHistory = JSON.parse(data);
    console.log(`📊 Loaded injury history for ${Object.keys(injuryHistory).length} players`);
  } catch (error) {
    console.log('📊 No existing injury history found, starting fresh');
    injuryHistory = {};
  }
}

/**
 * Save injury duration history
 */
async function saveInjuryHistory() {
  try {
    const historyPath = path.join(process.cwd(), INJURY_HISTORY_FILE);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    
    // Add metadata
    const dataToSave = {
      metadata: {
        last_updated: new Date().toISOString(),
        total_players_tracked: Object.keys(injuryHistory).length,
        version: '1.0'
      },
      players: injuryHistory
    };
    
    await fs.writeFile(historyPath, JSON.stringify(dataToSave, null, 2));
    console.log(`💾 Saved injury history for ${Object.keys(injuryHistory).length} players`);
  } catch (error) {
    console.error('❌ Failed to save injury history:', error);
  }
}

/**
 * Update injury tracking for current week
 * @param {Object} currentInjuries - Current injury data from ESPN
 * @param {number} currentWeek - Current NFL week
 * @param {number} currentSeason - Current NFL season
 */
export async function updateInjuryDurations(currentInjuries, currentWeek = 4, currentSeason = 2025) {
  await loadInjuryHistory();
  
  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const injuryKey = `${currentSeason}_W${currentWeek}`;
  
  console.log(`🔄 Updating injury durations for ${injuryKey}...`);
  
  let newInjuries = 0;
  let returningPlayers = 0;
  let continuingInjuries = 0;
  
  // Process current injuries
  if (currentInjuries && currentInjuries.teams) {
    for (const [team, teamData] of Object.entries(currentInjuries.teams)) {
      // Process all injury types
      const injuryTypes = ['rb_injuries', 'wr_injuries', 'te_injuries'];
      
      for (const injuryType of injuryTypes) {
        const injuries = teamData[injuryType] || [];
        
        for (const injury of injuries) {
          if (!injury.name || injury.status === 'active') continue;
          
          const playerKey = `${injury.name}_${team}`;
          
          // Initialize player if not tracked
          if (!injuryHistory[playerKey]) {
            injuryHistory[playerKey] = {
              name: injury.name,
              team: team,
              position: injury.position || injuryType.replace('_injuries', '').toUpperCase(),
              first_injured: injuryKey,
              first_injured_date: currentDate,
              injury_history: []
            };
            newInjuries++;
          }
          
          // Add current status
          const currentEntry = {
            week: injuryKey,
            date: currentDate,
            status: injury.status,
            injury_type: injury.injury || 'unknown'
          };
          
          // Check if this is a new entry
          const lastEntry = injuryHistory[playerKey].injury_history[injuryHistory[playerKey].injury_history.length - 1];
          if (!lastEntry || lastEntry.week !== injuryKey) {
            injuryHistory[playerKey].injury_history.push(currentEntry);
            continuingInjuries++;
          }
        }
      }
      
      // Check for QB injuries
      if (teamData.qb_status && teamData.qb_status !== 'active' && teamData.qb_name) {
        const playerKey = `${teamData.qb_name}_${team}`;
        
        if (!injuryHistory[playerKey]) {
          injuryHistory[playerKey] = {
            name: teamData.qb_name,
            team: team,
            position: 'QB',
            first_injured: injuryKey,
            first_injured_date: currentDate,
            injury_history: []
          };
          newInjuries++;
        }
        
        const currentEntry = {
          week: injuryKey,
          date: currentDate,
          status: teamData.qb_status,
          injury_type: 'unknown'
        };
        
        const lastEntry = injuryHistory[playerKey].injury_history[injuryHistory[playerKey].injury_history.length - 1];
        if (!lastEntry || lastEntry.week !== injuryKey) {
          injuryHistory[playerKey].injury_history.push(currentEntry);
          continuingInjuries++;
        }
      }
    }
  }
  
  await saveInjuryHistory();
  
  console.log(`✅ Injury duration tracking updated:`);
  console.log(`   📈 New injuries tracked: ${newInjuries}`);
  console.log(`   🔄 Continuing injuries: ${continuingInjuries}`);
  console.log(`   📊 Total players in history: ${Object.keys(injuryHistory).length}`);
  
  return {
    newInjuries,
    continuingInjuries,
    totalTracked: Object.keys(injuryHistory).length
  };
}

/**
 * Calculate weeks out for a specific player
 * @param {string} playerName - Player name
 * @param {string} team - Team code
 * @param {number} currentWeek - Current week
 * @param {number} currentSeason - Current season
 * @returns {number} Number of weeks the player has been out
 */
export function getWeeksOut(playerName, team, currentWeek = 4, currentSeason = 2025) {
  const playerKey = `${playerName}_${team}`;
  const player = injuryHistory[playerKey];
  
  if (!player) {
    return 0; // Player not in injury history
  }
  
  // Calculate weeks since first injury
  const firstInjuredWeek = parseInt(player.first_injured.split('W')[1]);
  const firstInjuredSeason = parseInt(player.first_injured.split('_')[0]);
  
  if (firstInjuredSeason < currentSeason) {
    // Handle cross-season injuries (rare, but possible)
    const weeksInPreviousSeason = 18 - firstInjuredWeek; // Assume 18-week season
    const weeksInCurrentSeason = currentWeek;
    return weeksInPreviousSeason + weeksInCurrentSeason;
  } else if (firstInjuredSeason === currentSeason) {
    return Math.max(0, currentWeek - firstInjuredWeek);
  }
  
  return 0;
}

/**
 * Apply residual decay to injury impact based on weeks out
 * @param {number} rawImpact - Original injury impact
 * @param {number} weeksOut - Number of weeks player has been out
 * @param {string} position - Player position for position-specific tau
 * @returns {number} Adjusted impact with residual decay
 */
export function applyResidualDecay(rawImpact, weeksOut, position = 'WR') {
  if (weeksOut <= 0) {
    return rawImpact; // No decay for new injuries
  }
  
  // Use position-specific time constants from centralized config
  let tau;
  if (position === 'QB') {
    tau = INJURY_CONFIG.TAU_QB_GAMES;
  } else if (['OL', 'OT', 'OG', 'C'].includes(position)) {
    tau = INJURY_CONFIG.TAU_OLINE_GAMES;
  } else if (['CB', 'S', 'LB', 'DL', 'DE', 'DT'].includes(position)) {
    tau = INJURY_CONFIG.TAU_DEFENSE_GAMES;
  } else {
    tau = INJURY_CONFIG.TAU_NON_QB_GAMES; // RB, WR, TE default
  }
  
  // Exponential decay: impact × exp(-weeks_out / τ)
  const decayFactor = Math.exp(-weeksOut / tau);
  const adjustedImpact = rawImpact * decayFactor;
  
  console.log(`🔄 Residual decay applied (${position}): ${rawImpact.toFixed(2)} × exp(-${weeksOut}/${tau}) = ${adjustedImpact.toFixed(2)}`);
  
  return adjustedImpact;
}

/**
 * Get injury duration summary for debugging
 */
export async function getInjuryDurationSummary() {
  await loadInjuryHistory();
  
  const summary = {
    total_players: Object.keys(injuryHistory).length,
    long_term_injuries: [],
    recent_injuries: [],
    by_position: {}
  };
  
  for (const [playerKey, player] of Object.entries(injuryHistory)) {
    const weeksOut = getWeeksOut(player.name, player.team);
    
    if (weeksOut >= 3) {
      summary.long_term_injuries.push({
        name: player.name,
        team: player.team,
        position: player.position,
        weeks_out: weeksOut,
        first_injured: player.first_injured
      });
    } else if (weeksOut <= 1) {
      summary.recent_injuries.push({
        name: player.name,
        team: player.team,
        position: player.position,
        weeks_out: weeksOut
      });
    }
    
    // Count by position
    const pos = player.position;
    summary.by_position[pos] = (summary.by_position[pos] || 0) + 1;
  }
  
  return summary;
}

/**
 * Initialize injury duration tracking (call once at startup)
 */
export async function initializeInjuryDurationTracking(currentInjuries) {
  console.log('🚀 Initializing injury duration tracking...');
  await updateInjuryDurations(currentInjuries);
  return true;
}