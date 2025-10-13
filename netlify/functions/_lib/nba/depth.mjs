/**
 * NBA Depth Charts & Rosters - Real-time lineup data
 * 
 * Tracks:
 * - Starting lineups
 * - Rotation players
 * - Backup depth
 * - Recent lineup changes
 * - Playing time trends
 */

const ESPN_TEAM_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams';

/**
 * Fetch team roster with depth chart positions
 */
export async function fetchTeamRoster(teamAbbr, teamId) {
  try {
    console.log(`[Roster] Fetching ${teamAbbr} roster...`);
    
    const url = `${ESPN_TEAM_BASE}/${teamId}/roster`;
    const response = await fetch(url);
    const data = await response.json();
    
    const roster = [];
    
    for (const athlete of data.athletes || []) {
      const player = athlete.athlete;
      
      roster.push({
        id: player.id,
        name: player.displayName,
        firstName: player.firstName,
        lastName: player.lastName,
        jersey: player.jersey,
        position: player.position?.abbreviation,
        positionName: player.position?.displayName,
        height: player.height,
        weight: player.weight,
        age: player.age,
        experience: player.experience?.years || 0,
        
        // Playing time (from stats if available)
        minutesPerGame: player.statistics?.[0]?.splits?.[0]?.stat?.avgMinutes || 0,
        
        // Depth chart position (1=starter, 2=first backup, etc.)
        depthOrder: athlete.position?.position || 99,
        
        // Status
        status: player.status?.type || 'active',
        
        // Headshot
        headshot: player.headshot?.href
      });
    }
    
    // Sort by depth chart
    roster.sort((a, b) => {
      if (a.position === b.position) {
        return a.depthOrder - b.depthOrder;
      }
      return a.position.localeCompare(b.position);
    });
    
    console.log(`[Roster] ✅ Loaded ${roster.length} players for ${teamAbbr}`);
    
    return roster;
    
  } catch (error) {
    console.error(`[Roster] Error fetching ${teamAbbr}:`, error);
    return [];
  }
}

/**
 * Get starting lineup for team
 */
export async function getStartingLineup(teamAbbr, teamId) {
  const roster = await fetchTeamRoster(teamAbbr, teamId);
  
  // Starters are typically top 5 by minutes played
  return roster
    .filter(p => p.minutesPerGame > 20)
    .slice(0, 5);
}

/**
 * Get rotation players (6-10)
 */
export async function getRotationPlayers(teamAbbr, teamId) {
  const roster = await fetchTeamRoster(teamAbbr, teamId);
  
  return roster
    .filter(p => p.minutesPerGame >= 15 && p.minutesPerGame <= 25)
    .slice(0, 5);
}

/**
 * Get bench depth
 */
export async function getBenchDepth(teamAbbr, teamId) {
  const roster = await fetchTeamRoster(teamAbbr, teamId);
  
  return roster.filter(p => p.minutesPerGame < 15);
}

/**
 * Calculate team depth quality score
 */
export async function calculateDepthScore(teamAbbr, teamId) {
  const roster = await fetchTeamRoster(teamAbbr, teamId);
  
  // Count players by minutes
  const starters = roster.filter(p => p.minutesPerGame > 25).length;
  const rotation = roster.filter(p => p.minutesPerGame >= 15 && p.minutesPerGame <= 25).length;
  const bench = roster.filter(p => p.minutesPerGame >= 10 && p.minutesPerGame < 15).length;
  
  // Ideal: 5 starters, 3-4 rotation, 3-4 bench
  let score = 0;
  
  // Starters (ideal: 5)
  score += Math.min(starters, 5) * 3;
  
  // Rotation (ideal: 3-4)
  score += Math.min(rotation, 4) * 2;
  
  // Bench (ideal: 3-4)
  score += Math.min(bench, 4) * 1;
  
  // Normalize to 0-100
  const normalized = Math.min((score / 25) * 100, 100);
  
  let quality;
  if (normalized >= 80) quality = 'ELITE';
  else if (normalized >= 65) quality = 'GOOD';
  else if (normalized >= 50) quality = 'AVERAGE';
  else quality = 'THIN';
  
  return {
    score: normalized,
    quality,
    starters,
    rotation,
    bench,
    totalRotation: starters + rotation
  };
}

/**
 * Compare depth between two teams
 */
export async function compareDepth(homeTeam, homeId, awayTeam, awayId) {
  console.log(`[Depth] Comparing ${awayTeam} @ ${homeTeam}`);
  
  const [homeDepth, awayDepth] = await Promise.all([
    calculateDepthScore(homeTeam, homeId),
    calculateDepthScore(awayTeam, awayId)
  ]);
  
  return {
    homeTeam: {
      ...homeDepth,
      advantage: homeDepth.score > awayDepth.score ? 'YES' : 'NO'
    },
    awayTeam: {
      ...awayDepth,
      advantage: awayDepth.score > homeDepth.score ? 'YES' : 'NO'
    },
    differential: homeDepth.score - awayDepth.score,
    summary: generateDepthSummary(homeDepth, awayDepth, homeTeam, awayTeam)
  };
}

/**
 * Generate depth comparison summary
 */
function generateDepthSummary(homeDepth, awayDepth, homeTeam, awayTeam) {
  const diff = Math.abs(homeDepth.score - awayDepth.score);
  
  if (diff < 10) {
    return `Both teams have similar depth quality`;
  }
  
  const advantage = homeDepth.score > awayDepth.score ? homeTeam : awayTeam;
  const advantageScore = homeDepth.score > awayDepth.score ? homeDepth : awayDepth;
  
  return `${advantage} has ${advantageScore.quality.toLowerCase()} depth advantage (${diff.toFixed(0)} pts)`;
}

/**
 * Get projected lineup for upcoming game
 */
export async function getProjectedLineup(teamAbbr, teamId, injuries = []) {
  const starters = await getStartingLineup(teamAbbr, teamId);
  const rotation = await getRotationPlayers(teamAbbr, teamId);
  
  // Filter out injured players
  const injuredNames = injuries.map(i => i.playerName);
  
  const availableStarters = starters.filter(p => 
    !injuredNames.includes(p.name)
  );
  
  const availableRotation = rotation.filter(p =>
    !injuredNames.includes(p.name)
  );
  
  return {
    starters: availableStarters,
    rotation: availableRotation,
    injuredOut: injuries.filter(i => i.status === 'Out').map(i => i.playerName),
    questionable: injuries.filter(i => i.status === 'Questionable').map(i => i.playerName),
    impactLevel: injuries.length > 0 ? 'MODERATE' : 'NONE'
  };
}

/**
 * Get positional depth chart
 */
export async function getPositionalDepth(teamAbbr, teamId) {
  const roster = await fetchTeamRoster(teamAbbr, teamId);
  
  const positions = {
    PG: [],
    SG: [],
    SF: [],
    PF: [],
    C: []
  };
  
  for (const player of roster) {
    const pos = player.position;
    if (positions[pos]) {
      positions[pos].push({
        name: player.name,
        minutes: player.minutesPerGame,
        experience: player.experience,
        depthOrder: player.depthOrder
      });
    }
  }
  
  // Sort each position by minutes
  for (const pos in positions) {
    positions[pos].sort((a, b) => b.minutes - a.minutes);
  }
  
  return positions;
}

/**
 * Assess impact of missing player
 */
export async function assessPlayerImpact(playerName, teamAbbr, teamId) {
  const roster = await fetchTeamRoster(teamAbbr, teamId);
  const player = roster.find(p => p.name === playerName);
  
  if (!player) {
    return { impact: 'UNKNOWN', score: 0 };
  }
  
  let impactScore = 0;
  
  // Minutes played (0-40 → 0-10 points)
  impactScore += (player.minutesPerGame / 40) * 10;
  
  // Depth order (1=starter, 5 points; 2=first backup, 3 points, etc.)
  if (player.depthOrder === 1) impactScore += 5;
  else if (player.depthOrder === 2) impactScore += 3;
  else if (player.depthOrder === 3) impactScore += 1;
  
  let impact;
  if (impactScore >= 12) impact = 'CRITICAL';
  else if (impactScore >= 8) impact = 'HIGH';
  else if (impactScore >= 5) impact = 'MODERATE';
  else impact = 'LOW';
  
  return {
    impact,
    score: impactScore,
    player: {
      name: player.name,
      position: player.position,
      minutesPerGame: player.minutesPerGame,
      depthOrder: player.depthOrder
    }
  };
}

export default {
  fetchTeamRoster,
  getStartingLineup,
  getRotationPlayers,
  getBenchDepth,
  calculateDepthScore,
  compareDepth,
  getProjectedLineup,
  getPositionalDepth,
  assessPlayerImpact
};
