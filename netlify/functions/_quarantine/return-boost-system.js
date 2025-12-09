// Prior-Week Injury Snapshot & Return Boost System
// Enables week-over-week delta tracking for injury improvements
// Calculates positive impact credits for returns and upgrades

import { getStore } from '@netlify/blobs';

/**
 * RETURN BOOST COEFFICIENTS
 * Credit applied when player improves status or returns from injury
 */
const RETURN_BOOST_BASE = {
  QB: {
    'out_to_active': 2.5,        // Full return from absence
    'out_to_questionable': 1.2,  // Partial return
    'doubtful_to_active': 1.5,
    'doubtful_to_questionable': 0.6,
    'questionable_to_active': 0.4
  },
  RB: {
    'out_to_active': 1.4,
    'out_to_questionable': 0.6,
    'doubtful_to_active': 0.8,
    'doubtful_to_questionable': 0.3,
    'questionable_to_active': 0.2
  },
  WR: {
    'out_to_active': 1.2,
    'out_to_questionable': 0.5,
    'doubtful_to_active': 0.7,
    'doubtful_to_questionable': 0.25,
    'questionable_to_active': 0.15
  },
  TE: {
    'out_to_active': 0.9,
    'out_to_questionable': 0.4,
    'doubtful_to_active': 0.5,
    'doubtful_to_questionable': 0.2,
    'questionable_to_active': 0.1
  }
};

/**
 * DECAY FACTORS for extended absences
 * Reduce return boost for players out multiple weeks (rust, snap count limits)
 */
const RETURN_BOOST_DECAY = {
  1: 1.0,   // 1 week out: full boost
  2: 0.95,  // 2 weeks: slight reduction
  3: 0.85,  // 3 weeks: moderate reduction
  4: 0.75,  // 4 weeks: significant reduction
  5: 0.65,  // 5+ weeks: heavy reduction (conditioning concerns)
  6: 0.55,
  7: 0.50,
  8: 0.45   // 8+ weeks: cap at 45% (major injuries)
};

/**
 * Save current week's injury snapshot to blob storage
 */
export async function savePriorWeekSnapshot(weekNumber, injuries, year = 2025) {
  try {
    const store = getStore('nfl-injury-snapshots');
    const key = `week-${weekNumber}-${year}`;
    
    // Simplify structure for comparison (just player status)
    const snapshot = {
      week: weekNumber,
      year,
      asOf: new Date().toISOString(),
      teams: {}
    };
    
    for (const [teamCode, teamData] of Object.entries(injuries.teams || {})) {
      snapshot.teams[teamCode] = {
        players: {}
      };
      
      // Extract key fields for each injured player
      if (Array.isArray(teamData.injuries)) {
        teamData.injuries.forEach(inj => {
          const key = `${inj.position}_${inj.playerName}`;
          snapshot.teams[teamCode].players[key] = {
            playerName: inj.playerName,
            position: inj.position,
            status: inj.status,
            weeksOut: inj.weeksOut || 0
          };
        });
      }
      
      // Legacy fields
      if (teamData.qb_name) {
        const key = `QB_${teamData.qb_name}`;
        snapshot.teams[teamCode].players[key] = {
          playerName: teamData.qb_name,
          position: 'QB',
          status: teamData.qb_status,
          weeksOut: 0
        };
      }
    }
    
    await store.setJSON(key, snapshot);
    console.log(`✅ Saved injury snapshot for Week ${weekNumber}`);
    
    return { success: true, key };
  } catch (error) {
    console.error(`❌ Failed to save snapshot: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Load prior week's injury snapshot
 */
export async function loadPriorWeekSnapshot(weekNumber, year = 2025) {
  try {
    const store = getStore('nfl-injury-snapshots');
    const key = `week-${weekNumber}-${year}`;
    
    const snapshot = await store.get(key, { type: 'json' });
    
    if (!snapshot) {
      console.warn(`⚠️ No prior snapshot found for Week ${weekNumber}`);
      return null;
    }
    
    console.log(`✅ Loaded prior snapshot for Week ${weekNumber}`);
    return snapshot;
  } catch (error) {
    console.warn(`⚠️ Failed to load prior snapshot: ${error.message}`);
    return null;
  }
}

/**
 * Calculate return boost for a player based on status improvement
 */
export function calculateReturnBoost(player, priorStatus, currentStatus, weeksOut = 0) {
  const position = player.position || 'RB'; // Fallback
  const posBoosts = RETURN_BOOST_BASE[position] || RETURN_BOOST_BASE['RB'];
  
  // Normalize statuses
  const prior = (priorStatus || '').toLowerCase();
  const current = (currentStatus || '').toLowerCase();
  
  // Build transition key
  const transition = `${prior}_to_${current}`;
  
  // Get base boost
  let boost = posBoosts[transition] || 0;
  
  if (boost === 0) {
    return {
      boost: 0,
      transition,
      reason: 'no_meaningful_improvement'
    };
  }
  
  // Apply decay for extended absences
  const weeksOutClamped = Math.min(8, Math.max(1, weeksOut || 1));
  const decayFactor = RETURN_BOOST_DECAY[weeksOutClamped] || 0.45;
  
  const adjustedBoost = boost * decayFactor;
  
  return {
    boost: adjustedBoost,
    baseBoost: boost,
    decayFactor,
    weeksOut: weeksOutClamped,
    transition,
    reason: `${prior} → ${current} after ${weeksOutClamped}w`
  };
}

/**
 * Detect return boosts for a team by comparing current vs prior week
 */
export async function detectReturnBoosts(teamCode, currentInjuries, weekNumber, year = 2025) {
  const priorSnapshot = await loadPriorWeekSnapshot(weekNumber - 1, year);
  
  if (!priorSnapshot || !priorSnapshot.teams[teamCode]) {
    return {
      boosts: [],
      totalBoost: 0,
      hasPriorData: false
    };
  }
  
  const priorPlayers = priorSnapshot.teams[teamCode].players || {};
  const currentTeam = currentInjuries.teams?.[teamCode] || {};
  const boosts = [];
  let totalBoost = 0;
  
  // Check each player from prior week
  for (const [playerKey, priorData] of Object.entries(priorPlayers)) {
    const { playerName, position, status: priorStatus, weeksOut: priorWeeksOut } = priorData;
    
    // Find current status
    let currentStatus = 'active'; // Assume active if not in current injury list
    let currentWeeksOut = 0;
    
    // Check if player still injured
    if (Array.isArray(currentTeam.injuries)) {
      const currentInj = currentTeam.injuries.find(
        inj => inj.playerName === playerName && inj.position === position
      );
      
      if (currentInj) {
        currentStatus = currentInj.status;
        currentWeeksOut = currentInj.weeksOut || 0;
      }
    }
    
    // Check legacy QB field
    if (position === 'QB' && currentTeam.qb_name === playerName) {
      currentStatus = currentTeam.qb_status || 'active';
    }
    
    // Calculate boost if improved
    if (priorStatus !== currentStatus) {
      const boostData = calculateReturnBoost(
        { position, playerName },
        priorStatus,
        currentStatus,
        priorWeeksOut || currentWeeksOut
      );
      
      if (boostData.boost > 0) {
        boosts.push({
          playerName,
          position,
          priorStatus,
          currentStatus,
          ...boostData
        });
        
        totalBoost += boostData.boost;
      }
    }
  }
  
  return {
    boosts,
    totalBoost,
    hasPriorData: true,
    priorWeek: weekNumber - 1
  };
}

/**
 * Get all return boosts for current week (used during predictions)
 */
export async function getAllReturnBoosts(currentInjuries, weekNumber, year = 2025) {
  const allBoosts = {};
  
  for (const teamCode of Object.keys(currentInjuries.teams || {})) {
    const teamBoosts = await detectReturnBoosts(teamCode, currentInjuries, weekNumber, year);
    
    if (teamBoosts.boosts.length > 0) {
      allBoosts[teamCode] = teamBoosts;
    }
  }
  
  return allBoosts;
}

export default {
  savePriorWeekSnapshot,
  loadPriorWeekSnapshot,
  calculateReturnBoost,
  detectReturnBoosts,
  getAllReturnBoosts,
  RETURN_BOOST_BASE,
  RETURN_BOOST_DECAY
};
