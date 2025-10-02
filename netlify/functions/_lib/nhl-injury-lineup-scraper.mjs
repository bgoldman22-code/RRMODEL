/**
 * NHL PHASE 2B - LIVE INJURY & LINEUP INTEGRATION
 * 
 * DATA SOURCES:
 * 1. DailyFaceoff.com - Morning skate lineups, PP units, scratches
 * 2. NHL Official Injury Reports - IR, DTD, Out, Questionable
 * 3. LeftWingLock.com - Projected lineups, line changes
 * 
 * OUTPUTS:
 * - scratchRisk: Probability player is scratched (0-1)
 * - roleVolatility: Uncertainty in TOI/deployment (0-1)
 * - lineChangeRisk: Probability of line demotion (0-1)
 * - ppTimeShare: Expected PP minutes (0-4)
 * - injuryImpact: Indirect impact from teammate injuries
 */

import fetch from 'node-fetch';

/**
 * Fetch today's NHL injury report
 * Source: NHL Official API or third-party aggregator
 */
export async function fetchNHLInjuryReport() {
  try {
    // NHL Official API endpoint for injuries
    const url = 'https://api-web.nhle.com/v1/roster-season/TEAM_ABBREV';
    
    // In production, we'd loop through all teams
    // For now, return structured injury data
    
    const injuries = {
      // Format: playerId → injury status
      // Status: IR, DTD (day-to-day), Out, Questionable, Healthy
      lastUpdated: new Date().toISOString(),
      players: {}
    };
    
    // TODO: Implement actual NHL injury API scraping
    // For now, return empty structure
    
    return injuries;
    
  } catch (error) {
    console.error('❌ Error fetching NHL injury report:', error.message);
    return { lastUpdated: new Date().toISOString(), players: {} };
  }
}

/**
 * Scrape DailyFaceoff for morning skate lineups
 * Returns: Line combos, PP units, confirmed scratches
 */
export async function scrapeDailyFaceoffLineups() {
  try {
    // DailyFaceoff starting lineups page
    const url = 'https://www.dailyfaceoff.com/teams/';
    
    // This would require HTML parsing (cheerio/jsdom)
    // Structure we want:
    const lineups = {
      lastUpdated: new Date().toISOString(),
      teams: {
        // 'TOR': {
        //   forwards: {
        //     line1: ['Player A', 'Player B', 'Player C'],
        //     line2: [...],
        //     line3: [...],
        //     line4: [...]
        //   },
        //   defense: {
        //     pair1: ['Player D', 'Player E'],
        //     pair2: [...],
        //     pair3: [...]
        //   },
        //   powerplay: {
        //     unit1: ['P1', 'P2', 'P3', 'P4', 'P5'],
        //     unit2: [...]
        //   },
        //   scratches: ['Injured Player', 'Healthy Scratch']
        // }
      }
    };
    
    // TODO: Implement DailyFaceoff scraping with cheerio
    // For Phase 2B, we'll use estimated data from NHL API
    
    return lineups;
    
  } catch (error) {
    console.error('❌ Error scraping DailyFaceoff:', error.message);
    return { lastUpdated: new Date().toISOString(), teams: {} };
  }
}

/**
 * Fetch LeftWingLock projected lineups
 * More up-to-date than DailyFaceoff, includes line change tracking
 */
export async function fetchLeftWingLockProjections() {
  try {
    // LeftWingLock API (requires subscription)
    // Alternative: Scrape their public pages
    
    const projections = {
      lastUpdated: new Date().toISOString(),
      teams: {},
      lineChanges: [] // Recent line shuffles
    };
    
    // TODO: Implement LeftWingLock integration
    
    return projections;
    
  } catch (error) {
    console.error('❌ Error fetching LeftWingLock:', error.message);
    return { lastUpdated: new Date().toISOString(), teams: {}, lineChanges: [] };
  }
}

/**
 * Calculate scratch risk for a player
 * 
 * INPUTS:
 * - injuryStatus: IR/DTD/Out/Questionable/Healthy
 * - confirmedScratch: boolean (from morning skate)
 * - recentGamesPlayed: last 5 games played
 * - linePosition: 1-4 (forward lines) or 1-3 (defense pairs)
 * 
 * OUTPUTS:
 * - scratchRisk: 0-1 probability
 */
export function calculateScratchRisk({
  injuryStatus = 'Healthy',
  confirmedScratch = false,
  recentGamesPlayed = 5,
  linePosition = 2,
  isGameDay = true,
  morningSkateStatus = null // 'present' | 'absent' | 'limited' | null
}) {
  
  // Confirmed scratch = 100% risk
  if (confirmedScratch) return 1.0;
  
  // Injury-based risk
  const injuryRiskMap = {
    'IR': 1.0,           // Injured Reserve = definitely out
    'Out': 0.95,         // Confirmed out
    'DTD': 0.40,         // Day-to-day = 40% scratch risk
    'Questionable': 0.25, // 25% scratch risk
    'Healthy': 0.02      // Base 2% healthy scratch risk
  };
  
  let baseRisk = injuryRiskMap[injuryStatus] || 0.02;
  
  // Morning skate status (very predictive on game day)
  if (isGameDay && morningSkateStatus) {
    if (morningSkateStatus === 'absent') {
      baseRisk = Math.max(baseRisk, 0.85); // Absent from morning skate = likely out
    } else if (morningSkateStatus === 'limited') {
      baseRisk = Math.max(baseRisk, 0.35); // Limited participation = elevated risk
    } else if (morningSkateStatus === 'present') {
      baseRisk = Math.min(baseRisk, 0.05); // Present = low risk unless injured
    }
  }
  
  // Recent playing time adjustment
  const gamesPlayedRatio = recentGamesPlayed / 5;
  if (gamesPlayedRatio < 0.6 && injuryStatus === 'Healthy') {
    // Frequent healthy scratches
    baseRisk = Math.max(baseRisk, 0.20);
  }
  
  // Line position adjustment (bottom-6 forwards more scratch risk)
  if (linePosition >= 3) {
    baseRisk += 0.03; // +3% for 3rd/4th liners
  }
  
  return Math.min(baseRisk, 1.0);
}

/**
 * Calculate role volatility (TOI uncertainty)
 * 
 * High volatility = uncertain deployment = higher projection variance
 */
export function calculateRoleVolatility({
  recentTOI = [],       // Last 10 games TOI (minutes)
  linePosition = 2,
  ppUnit = 1,           // 1 or 2 or null
  recentLineChanges = 0 // Number of line changes in last 5 games
}) {
  
  if (recentTOI.length < 3) {
    return 0.30; // High volatility for insufficient data
  }
  
  // Calculate TOI standard deviation
  const meanTOI = recentTOI.reduce((sum, toi) => sum + toi, 0) / recentTOI.length;
  const variance = recentTOI.reduce((sum, toi) => sum + Math.pow(toi - meanTOI, 2), 0) / recentTOI.length;
  const stdDev = Math.sqrt(variance);
  
  // Coefficient of variation (normalized volatility)
  const cv = stdDev / meanTOI;
  
  // Line change adjustment
  let volatility = cv;
  if (recentLineChanges >= 2) {
    volatility += 0.15; // +15% for frequent line shuffles
  }
  
  // Position stability
  if (linePosition === 1 && ppUnit === 1) {
    volatility *= 0.7; // Top line + PP1 = very stable
  } else if (linePosition >= 3) {
    volatility *= 1.3; // Bottom-6 = less stable
  }
  
  return Math.min(volatility, 1.0);
}

/**
 * Calculate line change risk (demotion probability)
 * 
 * Used for Kelly penalty: if player might get demoted, reduce stake
 */
export function calculateLineChangeRisk({
  currentLine = 2,
  recentPerformance = 0,  // +/- recent games
  teamWinStreak = 0,      // Winning teams change lines less
  recentLineChanges = 0,
  coachTendency = 'stable' // 'stable' | 'tinkerer'
}) {
  
  let baseRisk = 0.05; // 5% base line change risk
  
  // Recent performance impact
  if (recentPerformance < -3) {
    baseRisk += 0.15; // Poor performance = demotion risk
  }
  
  // Team success reduces changes
  if (teamWinStreak >= 3) {
    baseRisk *= 0.5; // "Don't fix what isn't broken"
  }
  
  // Recent line changes = more likely to continue
  if (recentLineChanges >= 2) {
    baseRisk += 0.20;
  }
  
  // Coach tendency
  if (coachTendency === 'tinkerer') {
    baseRisk += 0.10; // Some coaches shuffle constantly
  }
  
  // Top line players rarely get demoted
  if (currentLine === 1) {
    baseRisk *= 0.3;
  }
  
  return Math.min(baseRisk, 0.50);
}

/**
 * Calculate PP time share (expected PP minutes)
 * 
 * Critical for SOG projections - PP shots are highest EV
 */
export function calculatePPTimeShare({
  ppUnit = null,        // 1, 2, or null
  teamPPOpportunities = 3.2, // League average
  pp1Duration = 1.5,    // Minutes per PP for unit 1
  pp2Duration = 0.5     // Minutes per PP for unit 2
}) {
  
  if (ppUnit === null) {
    return 0; // Not on PP = 0 minutes
  }
  
  if (ppUnit === 1) {
    return teamPPOpportunities * pp1Duration; // ~4.8 PP minutes
  }
  
  if (ppUnit === 2) {
    return teamPPOpportunities * pp2Duration; // ~1.6 PP minutes
  }
  
  return 0;
}

/**
 * Calculate indirect injury impact
 * 
 * If star players are injured, TOI redistributes to others
 * Example: Matthews out → Marner/Nylander get more shots
 */
export function calculateInjuryImpact({
  playerId,
  teamRoster = [],
  injuries = {},        // Map of injured player IDs → injury status
  playerSOGShare = 0.15 // This player's % of team shots
}) {
  
  // Find injured teammates
  const injuredTeammates = teamRoster.filter(p => 
    p.playerId !== playerId && 
    injuries[p.playerId] && 
    ['IR', 'Out', 'DTD'].includes(injuries[p.playerId].status)
  );
  
  if (injuredTeammates.length === 0) {
    return 1.0; // No impact (multiplier)
  }
  
  // Calculate total SOG share of injured players
  let injuredSOGShare = 0;
  for (const injured of injuredTeammates) {
    injuredSOGShare += injured.sogShare || 0.10;
  }
  
  // Redistribute to healthy players proportionally
  // If 20% of team shots are lost to injury, and you normally have 15% share,
  // you might gain 15% of that 20% = +3% absolute = 18% total = 1.20x multiplier
  
  const redistributionFactor = injuredSOGShare / (1 - injuredSOGShare);
  const playerGain = playerSOGShare * redistributionFactor;
  
  const multiplier = 1 + playerGain;
  
  // Cap at reasonable limits
  return Math.min(Math.max(multiplier, 0.8), 1.5);
}

/**
 * MASTER FUNCTION: Get all injury/lineup factors for a player
 */
export async function getPlayerInjuryLineupFactors({
  playerId,
  playerName,
  teamAbbrev,
  position,
  gameDate = new Date()
}) {
  
  try {
    // Fetch all data sources
    const [injuries, dailyFaceoff, leftWingLock] = await Promise.all([
      fetchNHLInjuryReport(),
      scrapeDailyFaceoffLineups(),
      fetchLeftWingLockProjections()
    ]);
    
    // Get player-specific data
    const playerInjury = injuries.players[playerId];
    const teamLineup = dailyFaceoff.teams[teamAbbrev] || {};
    const teamProjection = leftWingLock.teams[teamAbbrev] || {};
    
    // Determine if player is scratched
    const confirmedScratch = teamLineup.scratches?.includes(playerName) || false;
    
    // Find player's line position
    let linePosition = 2; // Default
    let ppUnit = null;
    
    if (teamLineup.forwards) {
      for (let i = 1; i <= 4; i++) {
        const line = teamLineup.forwards[`line${i}`] || [];
        if (line.includes(playerName)) {
          linePosition = i;
          break;
        }
      }
    }
    
    if (teamLineup.powerplay) {
      if (teamLineup.powerplay.unit1?.includes(playerName)) ppUnit = 1;
      else if (teamLineup.powerplay.unit2?.includes(playerName)) ppUnit = 2;
    }
    
    // Calculate all factors
    const scratchRisk = calculateScratchRisk({
      injuryStatus: playerInjury?.status || 'Healthy',
      confirmedScratch,
      linePosition,
      isGameDay: isToday(gameDate),
      morningSkateStatus: playerInjury?.morningSkate || null
    });
    
    const roleVolatility = calculateRoleVolatility({
      recentTOI: [], // TODO: Fetch from NHL API
      linePosition,
      ppUnit,
      recentLineChanges: teamProjection.lineChanges?.filter(lc => 
        lc.playersAffected?.includes(playerName)
      ).length || 0
    });
    
    const lineChangeRisk = calculateLineChangeRisk({
      currentLine: linePosition,
      recentLineChanges: teamProjection.lineChanges?.filter(lc => 
        lc.playersAffected?.includes(playerName)
      ).length || 0
    });
    
    const ppTimeShare = calculatePPTimeShare({
      ppUnit
    });
    
    const injuryImpact = calculateInjuryImpact({
      playerId,
      teamRoster: [], // TODO: Get from roster API
      injuries: injuries.players,
      playerSOGShare: 0.15 // TODO: Calculate from historical data
    });
    
    return {
      scratchRisk,
      roleVolatility,
      lineChangeRisk,
      ppTimeShare,
      injuryImpact,
      linePosition,
      ppUnit,
      confirmedScratch,
      injuryStatus: playerInjury?.status || 'Healthy',
      dataQuality: {
        injuryReportAge: injuries.lastUpdated,
        lineupConfidence: confirmedScratch || ppUnit !== null ? 'high' : 'medium',
        source: 'Phase2B-Live'
      }
    };
    
  } catch (error) {
    console.error(`❌ Error getting injury/lineup factors for ${playerName}:`, error.message);
    
    // Return conservative defaults on error
    return {
      scratchRisk: 0.10,
      roleVolatility: 0.20,
      lineChangeRisk: 0.10,
      ppTimeShare: 1.0,
      injuryImpact: 1.0,
      linePosition: 2,
      ppUnit: null,
      confirmedScratch: false,
      injuryStatus: 'Unknown',
      dataQuality: {
        injuryReportAge: null,
        lineupConfidence: 'low',
        source: 'Phase2B-Fallback'
      }
    };
  }
}

/**
 * Utility: Check if date is today
 */
function isToday(date) {
  const today = new Date();
  const checkDate = new Date(date);
  
  return checkDate.getDate() === today.getDate() &&
         checkDate.getMonth() === today.getMonth() &&
         checkDate.getFullYear() === today.getFullYear();
}

/**
 * EXPORT: Get batch injury/lineup data for all players
 * More efficient than individual calls
 */
export async function getBatchInjuryLineupFactors(players) {
  // Fetch data once for all players
  const [injuries, dailyFaceoff, leftWingLock] = await Promise.all([
    fetchNHLInjuryReport(),
    scrapeDailyFaceoffLineups(),
    fetchLeftWingLockProjections()
  ]);
  
  const results = {};
  
  for (const player of players) {
    try {
      // Process each player with shared data
      const teamLineup = dailyFaceoff.teams[player.teamAbbrev] || {};
      const confirmedScratch = teamLineup.scratches?.includes(player.playerName) || false;
      
      results[player.playerId] = {
        scratchRisk: calculateScratchRisk({
          injuryStatus: injuries.players[player.playerId]?.status || 'Healthy',
          confirmedScratch
        }),
        roleVolatility: 0.15, // Default for now
        lineChangeRisk: 0.08,
        ppTimeShare: 1.5,
        injuryImpact: 1.0,
        dataQuality: {
          source: 'Phase2B-Batch',
          lineupConfidence: confirmedScratch ? 'high' : 'medium'
        }
      };
    } catch (error) {
      results[player.playerId] = {
        scratchRisk: 0.10,
        roleVolatility: 0.20,
        lineChangeRisk: 0.10,
        ppTimeShare: 1.0,
        injuryImpact: 1.0
      };
    }
  }
  
  return results;
}
