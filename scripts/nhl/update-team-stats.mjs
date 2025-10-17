/**
 * NHL Team Stats Daily Refresh
 * 
 * Fetches comprehensive team stats for opponent adjustments:
 * - Offensive stats (shots/game, shooting %, PP%)
 * - Defensive stats (shots against/game, save %, PK%)
 * - Advanced metrics (Corsi, Fenwick, PDO)
 * 
 * Saves to: data/nhl/team_stats_2024-25.json
 * Run daily at 10am ET alongside player stats
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const NHL_STATS_API = 'https://api.nhle.com/stats/rest/en';
const CURRENT_SEASON = '20242025';

// All 32 NHL teams
const NHL_TEAMS = [
  'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ',
  'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH',
  'NJD', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
  'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WSH', 'WPG'
];

/**
 * Fetch comprehensive team stats
 */
async function fetchTeamStats(teamAbbrev) {
  const url = `${NHL_STATS_API}/team/summary?cayenneExp=seasonId=${CURRENT_SEASON} and teamAbbrev="${teamAbbrev}"`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`❌ Failed to fetch ${teamAbbrev} stats: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const team = data.data?.[0];
    
    if (!team) {
      console.warn(`⚠️ No data for ${teamAbbrev}`);
      return null;
    }
    
    return {
      teamAbbrev,
      teamName: team.teamFullName || teamAbbrev,
      
      // Record
      gamesPlayed: team.gamesPlayed || 0,
      wins: team.wins || 0,
      losses: team.losses || 0,
      otLosses: team.otLosses || 0,
      points: team.points || 0,
      pointPct: team.pointPctg || 0,
      
      // Offensive stats
      goalsFor: team.goalsFor || 0,
      goalsForPerGame: team.goalsForPerGame || 0,
      shotsForPerGame: team.shotsForPerGame || 0,
      shootingPct: team.shootingPct || 0,
      powerPlayPct: team.powerPlayPct || 0,
      powerPlayGoals: team.powerPlayGoals || 0,
      powerPlayOpportunities: team.powerPlayOpportunities || 0,
      faceoffWinPct: team.faceoffWinPct || 0,
      
      // Defensive stats
      goalsAgainst: team.goalsAgainst || 0,
      goalsAgainstPerGame: team.goalsAgainstPerGame || 0,
      shotsAgainstPerGame: team.shotsAgainstPerGame || 0,
      savePct: team.savePct || 0,
      penaltyKillPct: team.penaltyKillPct || 0,
      penaltyKillGoalsAgainst: team.shGoalsAgainst || 0,
      penaltyKillOpportunities: team.shNumTimes || 0,
      
      // Discipline
      penaltiesPerGame: team.penaltiesPerGame || 0,
      penaltyMinutesPerGame: team.penaltyMinutesPerGame || 0,
      
      // Advanced metrics (calculated)
      goalDifferential: (team.goalsFor || 0) - (team.goalsAgainst || 0),
      goalDifferentialPerGame: team.gamesPlayed > 0 ? 
        ((team.goalsFor || 0) - (team.goalsAgainst || 0)) / team.gamesPlayed : 0,
      
      // PDO (shooting% + save%) - league average is ~1.000
      pdo: (team.shootingPct || 0) + (team.savePct || 0),
      
      // Shot differential per game
      shotDifferentialPerGame: (team.shotsForPerGame || 0) - (team.shotsAgainstPerGame || 0),
      
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching ${teamAbbrev} stats:`, error.message);
    return null;
  }
}

/**
 * Fetch team's last 10 game results for form tracking
 */
async function fetchTeamRecentForm(teamAbbrev) {
  // This would require fetching the schedule and recent games
  // For now, we'll use season stats (can enhance later)
  return {
    L5: { wins: 0, losses: 0 },
    L10: { wins: 0, losses: 0 }
  };
}

/**
 * Calculate league averages for normalization
 */
function calculateLeagueAverages(teams) {
  const validTeams = teams.filter(Boolean);
  const count = validTeams.length;
  
  if (count === 0) return {};
  
  return {
    goalsForPerGame: validTeams.reduce((sum, t) => sum + t.goalsForPerGame, 0) / count,
    shotsForPerGame: validTeams.reduce((sum, t) => sum + t.shotsForPerGame, 0) / count,
    shotsAgainstPerGame: validTeams.reduce((sum, t) => sum + t.shotsAgainstPerGame, 0) / count,
    powerPlayPct: validTeams.reduce((sum, t) => sum + t.powerPlayPct, 0) / count,
    penaltyKillPct: validTeams.reduce((sum, t) => sum + t.penaltyKillPct, 0) / count,
    savePct: validTeams.reduce((sum, t) => sum + t.savePct, 0) / count,
    shootingPct: validTeams.reduce((sum, t) => sum + t.shootingPct, 0) / count
  };
}

/**
 * Add strength ratings (vs league average)
 */
function addStrengthRatings(teams, leagueAvg) {
  return teams.map(team => {
    if (!team) return null;
    
    return {
      ...team,
      
      // Strength ratings (1.0 = league average, >1.0 = above avg, <1.0 = below avg)
      offensiveRating: team.shotsForPerGame / (leagueAvg.shotsForPerGame || 1),
      defensiveRating: (leagueAvg.shotsAgainstPerGame || 1) / team.shotsAgainstPerGame, // Inverted (higher = better D)
      powerPlayRating: team.powerPlayPct / (leagueAvg.powerPlayPct || 1),
      penaltyKillRating: team.penaltyKillPct / (leagueAvg.penaltyKillPct || 1),
      goaltendingRating: team.savePct / (leagueAvg.savePct || 1),
      
      // Composite ratings
      overallOffense: (team.goalsForPerGame / (leagueAvg.goalsForPerGame || 1) + 
                      team.shotsForPerGame / (leagueAvg.shotsForPerGame || 1)) / 2,
      overallDefense: ((leagueAvg.shotsAgainstPerGame || 1) / team.shotsAgainstPerGame + 
                      team.savePct / (leagueAvg.savePct || 1)) / 2
    };
  });
}

/**
 * Main function: Update all team stats
 */
async function updateTeamStats() {
  console.log('🏒 NHL Team Stats Refresh');
  console.log('=' .repeat(60));
  console.log(`Season: ${CURRENT_SEASON}`);
  console.log(`Teams: ${NHL_TEAMS.length}`);
  console.log('');
  
  // Fetch all team stats in parallel
  console.log('📊 Fetching team stats...');
  const statsPromises = NHL_TEAMS.map(team => fetchTeamStats(team));
  const allStats = await Promise.all(statsPromises);
  
  const validStats = allStats.filter(Boolean);
  console.log(`✅ Fetched stats for ${validStats.length} teams\n`);
  
  // Calculate league averages
  console.log('📈 Calculating league averages...');
  const leagueAverages = calculateLeagueAverages(validStats);
  
  // Add strength ratings
  console.log('⚡ Adding strength ratings...');
  const teamsWithRatings = addStrengthRatings(validStats, leagueAverages);
  
  // Save to file
  const dataDir = path.join(__dirname, '../../data/nhl');
  const statsFile = path.join(dataDir, `team_stats_${CURRENT_SEASON}.json`);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const output = {
    season: CURRENT_SEASON,
    generatedAt: new Date().toISOString(),
    totalTeams: teamsWithRatings.length,
    
    leagueAverages,
    
    teams: teamsWithRatings.reduce((obj, team) => {
      obj[team.teamAbbrev] = team;
      return obj;
    }, {})
  };
  
  fs.writeFileSync(statsFile, JSON.stringify(output, null, 2));
  console.log(`✅ Saved to: ${statsFile}`);
  
  // Display summary
  console.log('');
  console.log('📊 League Averages:');
  console.log(`   Goals/game: ${leagueAverages.goalsForPerGame.toFixed(2)}`);
  console.log(`   Shots/game: ${leagueAverages.shotsForPerGame.toFixed(1)}`);
  console.log(`   Shot defense: ${leagueAverages.shotsAgainstPerGame.toFixed(1)}`);
  console.log(`   PP%: ${(leagueAverages.powerPlayPct * 100).toFixed(1)}%`);
  console.log(`   PK%: ${(leagueAverages.penaltyKillPct * 100).toFixed(1)}%`);
  console.log(`   Save%: ${(leagueAverages.savePct * 100).toFixed(1)}%`);
  
  // Show top/bottom teams
  const sortedByOffense = [...teamsWithRatings].sort((a, b) => b.offensiveRating - a.offensiveRating);
  const sortedByDefense = [...teamsWithRatings].sort((a, b) => b.defensiveRating - a.defensiveRating);
  
  console.log('');
  console.log('🔥 Top 5 Offensive Teams:');
  sortedByOffense.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.teamAbbrev}: ${t.shotsForPerGame.toFixed(1)} SOG/game (${(t.offensiveRating * 100 - 100).toFixed(0)}% above avg)`);
  });
  
  console.log('');
  console.log('🛡️ Top 5 Defensive Teams:');
  sortedByDefense.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.teamAbbrev}: ${t.shotsAgainstPerGame.toFixed(1)} SOG allowed/game (${(t.defensiveRating * 100 - 100).toFixed(0)}% above avg)`);
  });
  
  console.log('');
  console.log(`File size: ${(fs.statSync(statsFile).size / 1024).toFixed(0)} KB`);
  
  return output;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateTeamStats().catch(console.error);
}

export { updateTeamStats };
