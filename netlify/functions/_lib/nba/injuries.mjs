/**
 * NBA Injury Tracker - Real-time injury data
 * 
 * Sources:
 * - ESPN Injuries API
 * - NBA Official Injury Report
 * - RotoWire (if API key available)
 */

const ESPN_INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const NBA_OFFICIAL = 'https://official.nba.com/nba-injury-report-2024-25-season/';

/**
 * Fetch current injuries from ESPN
 */
export async function fetchInjuries() {
  try {
    console.log('[Injuries] Fetching from ESPN...');
    
    const response = await fetch(ESPN_INJURIES);
    const data = await response.json();
    
    const injuries = [];
    
    // ESPN API changed structure: data.injuries[] instead of data.teams[]
    for (const team of data.injuries || []) {
      const teamAbbr = team.displayName?.includes(' ') 
        ? team.displayName.split(' ').pop().substring(0, 3).toUpperCase() 
        : null;
      
      for (const injury of team.injuries || []) {
        injuries.push({
          playerId: injury.athlete?.id,
          playerName: injury.athlete?.displayName,
          team: injury.athlete?.team?.abbreviation || teamAbbr,
          teamId: injury.athlete?.team?.id,
          position: injury.athlete?.position?.abbreviation,
          status: injury.status, // 'Out', 'Questionable', 'Doubtful', 'Day-To-Day'
          type: injury.type?.description || injury.type, // 'Injury', 'Illness', 'Personal', 'Rest'
          description: injury.longComment || injury.shortComment,
          date: injury.date,
          dateModified: injury.dateModified,
          
          // Impact assessment
          impact: assessInjuryImpact(injury),
          severity: categorizeStatus(injury.status)
        });
      }
    }
    
    console.log(`[Injuries] ✅ Found ${injuries.length} active injuries`);
    
    return injuries;
    
  } catch (error) {
    console.error('[Injuries] Error fetching:', error);
    return [];
  }
}

/**
 * Get injuries for specific team
 */
export async function getTeamInjuries(teamAbbr) {
  const allInjuries = await fetchInjuries();
  return allInjuries.filter(i => i.team === teamAbbr);
}

/**
 * Get injuries for specific player
 */
export async function getPlayerInjury(playerName) {
  const allInjuries = await fetchInjuries();
  return allInjuries.find(i => 
    i.playerName.toLowerCase().includes(playerName.toLowerCase())
  );
}

/**
 * Assess impact of injury on team
 */
function assessInjuryImpact(injury) {
  const player = injury.athlete;
  const status = injury.status;
  
  // High impact: Out, key positions, stars
  if (status === 'Out') {
    if (['PG', 'SG', 'SF'].includes(player?.position?.abbreviation)) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }
  
  if (status === 'Questionable' || status === 'Doubtful') {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

/**
 * Categorize injury severity
 */
function categorizeStatus(status) {
  switch (status) {
    case 'Out':
      return 5; // Most severe
    case 'Doubtful':
      return 4;
    case 'Questionable':
      return 3;
    case 'Probable':
      return 2;
    case 'Day-To-Day':
      return 1;
    default:
      return 0;
  }
}

/**
 * Calculate team injury impact score
 */
export async function calculateTeamInjuryScore(teamAbbr) {
  const injuries = await getTeamInjuries(teamAbbr);
  
  if (injuries.length === 0) {
    return { score: 0, impact: 'NONE', count: 0 };
  }
  
  // Weight by severity
  const score = injuries.reduce((sum, inj) => sum + inj.severity, 0);
  
  let impact;
  if (score >= 10) impact = 'SEVERE';
  else if (score >= 6) impact = 'HIGH';
  else if (score >= 3) impact = 'MODERATE';
  else impact = 'LOW';
  
  return {
    score,
    impact,
    count: injuries.length,
    details: injuries.map(i => ({
      player: i.playerName,
      status: i.status,
      impact: i.impact
    }))
  };
}

/**
 * Get injury report summary for game
 */
export async function getGameInjuryReport(homeTeam, awayTeam) {
  console.log(`[Injuries] Getting report for ${awayTeam} @ ${homeTeam}`);
  
  const [homeScore, awayScore] = await Promise.all([
    calculateTeamInjuryScore(homeTeam),
    calculateTeamInjuryScore(awayTeam)
  ]);
  
  return {
    homeTeam: {
      ...homeScore,
      advantage: homeScore.score < awayScore.score ? 'YES' : 'NO'
    },
    awayTeam: {
      ...awayScore,
      advantage: awayScore.score < homeScore.score ? 'YES' : 'NO'
    },
    differential: awayScore.score - homeScore.score, // Positive = home advantage
    summary: generateInjurySummary(homeScore, awayScore, homeTeam, awayTeam)
  };
}

/**
 * Generate human-readable injury summary
 */
function generateInjurySummary(homeScore, awayScore, homeTeam, awayTeam) {
  if (homeScore.count === 0 && awayScore.count === 0) {
    return `Both teams relatively healthy`;
  }
  
  if (homeScore.impact === 'SEVERE' || awayScore.impact === 'SEVERE') {
    const affected = homeScore.impact === 'SEVERE' ? homeTeam : awayTeam;
    return `⚠️ ${affected} severely impacted by injuries`;
  }
  
  if (Math.abs(homeScore.score - awayScore.score) >= 3) {
    const advantage = homeScore.score < awayScore.score ? homeTeam : awayTeam;
    return `${advantage} has health advantage`;
  }
  
  return `Both teams dealing with similar injury concerns`;
}

export default {
  fetchInjuries,
  getTeamInjuries,
  getPlayerInjury,
  calculateTeamInjuryScore,
  getGameInjuryReport
};
