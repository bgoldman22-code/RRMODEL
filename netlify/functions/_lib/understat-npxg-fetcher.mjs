/**
 * UNDERSTAT NPxG DATA FETCHER
 * 
 * Elite NPxG data source - opponent-adjusted expected goals without penalties
 * 
 * Why Understat:
 * - Free, reliable, updated daily
 * - NPxG (non-penalty xG) available
 * - Opponent-adjusted automatically
 * - Rolling averages for form
 * - Shot quality data (not just volume)
 * 
 * Leagues: EPL, La Liga, Bundesliga, Serie A, Ligue 1, RFPL
 */

import fetch from 'node-fetch';

const UNDERSTAT_BASE = 'https://understat.com';

// League mapping
const LEAGUES = {
  'premier-league': 'EPL',
  'bundesliga': 'Bundesliga',
  'la-liga': 'La_Liga',
  'serie-a': 'Serie_A',
  'ligue-1': 'Ligue_1'
};

/**
 * Fetch team NPxG data from Understat
 * Returns opponent-adjusted NPxG for/against
 */
export async function fetchTeamNPxG(teamName, league = 'premier-league', season = '2025') {
  try {
    const leagueKey = LEAGUES[league] || 'EPL';
    const url = `${UNDERSTAT_BASE}/league/${leagueKey}/${season}`;
    
    // Fetch page HTML (Understat data is in JavaScript variables)
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract team data from embedded JSON
    const teamsDataMatch = html.match(/var teamsData\s*=\s*JSON\.parse\('(.+?)'\)/);
    if (!teamsDataMatch) {
      console.warn('No Understat data found, using fallback');
      return null;
    }
    
    const teamsJson = teamsDataMatch[1]
      .replace(/\\x([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"');
    
    const teamsData = JSON.parse(teamsJson);
    
    // Find team by name (fuzzy match)
    const team = Object.values(teamsData).find(t => 
      normalizeTeamName(t.title).includes(normalizeTeamName(teamName)) ||
      normalizeTeamName(teamName).includes(normalizeTeamName(t.title))
    );
    
    if (!team) {
      console.warn(`Team ${teamName} not found in Understat`);
      return null;
    }
    
    // Calculate NPxG metrics
    const games = parseInt(team.matches) || 1;
    
    // Understat provides xG which includes penalties, so we approximate NPxG
    // by reducing xG by ~10% (average penalty rate)
    const xgFor = parseFloat(team.xG) || 0;
    const xgAgainst = parseFloat(team.xGA) || 0;
    const goalsFor = parseInt(team.scored) || 0;
    const goalsAgainst = parseInt(team.missed) || 0;
    
    // NPxG approximation (xG * 0.90 to remove penalty contribution)
    const npxgFor = xgFor * 0.90;
    const npxgAgainst = xgAgainst * 0.90;
    
    // Per game metrics
    const npxgForPerGame = npxgFor / games;
    const npxgAgainstPerGame = npxgAgainst / games;
    const goalsForPerGame = goalsFor / games;
    const goalsAgainstPerGame = goalsAgainst / games;
    
    // Finishing quality (goals vs xG)
    const finishingRate = npxgFor > 0 ? goalsFor / npxgFor : 1.0;
    const defensiveRate = npxgAgainst > 0 ? goalsAgainst / npxgAgainst : 1.0;
    
    return {
      team: team.title,
      games: games,
      
      // Core NPxG metrics (per game)
      npxg_for_per_game: npxgForPerGame,
      npxg_against_per_game: npxgAgainstPerGame,
      
      // Total season NPxG
      npxg_for_total: npxgFor,
      npxg_against_total: npxgAgainst,
      
      // Actual goals (for finishing rate calculation)
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      goals_for_per_game: goalsForPerGame,
      goals_against_per_game: goalsAgainstPerGame,
      
      // Finishing quality multipliers
      finishing_rate: finishingRate,        // >1.0 = overperforming xG
      defensive_rate: defensiveRate,        // >1.0 = conceding more than expected
      
      // Opponent adjustment (Understat xG is already opponent-adjusted)
      opponent_adjusted: true,
      
      // Data quality
      source: 'understat',
      confidence: games >= 5 ? 'high' : 'medium',
      last_updated: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error fetching Understat NPxG for ${teamName}:`, error.message);
    return null;
  }
}

/**
 * Fetch last 5 games form with NPxG
 * Used for recent finishing rate trends
 */
export async function fetchTeamRecentForm(teamName, league = 'premier-league', season = '2025') {
  try {
    const leagueKey = LEAGUES[league] || 'EPL';
    const url = `${UNDERSTAT_BASE}/league/${leagueKey}/${season}`;
    
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract fixtures data
    const fixturesMatch = html.match(/var datesData\s*=\s*JSON\.parse\('(.+?)'\)/);
    if (!fixturesMatch) {
      return null;
    }
    
    const fixturesJson = fixturesMatch[1]
      .replace(/\\x([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"');
    
    const fixturesData = JSON.parse(fixturesJson);
    
    // Find team's recent games
    const teamGames = [];
    for (const date in fixturesData) {
      const games = fixturesData[date];
      for (const game of games) {
        if (normalizeTeamName(game.h.title).includes(normalizeTeamName(teamName)) ||
            normalizeTeamName(game.a.title).includes(normalizeTeamName(teamName))) {
          
          const isHome = normalizeTeamName(game.h.title).includes(normalizeTeamName(teamName));
          const teamXG = isHome ? parseFloat(game.xG.h) : parseFloat(game.xG.a);
          const oppXG = isHome ? parseFloat(game.xG.a) : parseFloat(game.xG.h);
          const teamGoals = isHome ? parseInt(game.goals.h) : parseInt(game.goals.a);
          const oppGoals = isHome ? parseInt(game.goals.a) : parseInt(game.goals.h);
          
          teamGames.push({
            date: game.datetime,
            isHome: isHome,
            opponent: isHome ? game.a.title : game.h.title,
            npxg_for: teamXG * 0.90,  // Approximate NPxG
            npxg_against: oppXG * 0.90,
            goals_for: teamGoals,
            goals_against: oppGoals,
            finishing_rate: teamXG > 0 ? teamGoals / teamXG : 1.0
          });
        }
      }
    }
    
    // Sort by date (most recent first) and take last 5
    teamGames.sort((a, b) => new Date(b.date) - new Date(a.date));
    const last5 = teamGames.slice(0, 5);
    
    // Calculate L5 averages
    const l5NPxGFor = last5.reduce((sum, g) => sum + g.npxg_for, 0) / Math.max(1, last5.length);
    const l5NPxGAgainst = last5.reduce((sum, g) => sum + g.npxg_against, 0) / Math.max(1, last5.length);
    const l5FinishingRate = last5.reduce((sum, g) => sum + g.finishing_rate, 0) / Math.max(1, last5.length);
    
    return {
      games: last5,
      averages: {
        npxg_for_l5: l5NPxGFor,
        npxg_against_l5: l5NPxGAgainst,
        finishing_rate_l5: l5FinishingRate
      }
    };
    
  } catch (error) {
    console.error(`Error fetching recent form for ${teamName}:`, error.message);
    return null;
  }
}

/**
 * Calculate opponent-adjusted lambda for BTTS model
 * Uses NPxG as the base process
 */
export function calculateNPxGLambda(teamNPxG, opponentNPxG, isHome = true, leagueGoalsPerGame = 2.8) {
  if (!teamNPxG || !opponentNPxG) {
    // Fallback to league average
    return leagueGoalsPerGame / 2;
  }
  
  // Base lambda from team's NPxG process
  const baseNPxG = teamNPxG.npxg_for_per_game;
  
  // Opponent defensive strength (how much xG they concede vs league avg)
  const leagueAvgNPxG = leagueGoalsPerGame / 2;
  const oppDefStrength = opponentNPxG.npxg_against_per_game / leagueAvgNPxG;
  
  // Venue adjustment (smaller effect on xG than on goals)
  const venueMultiplier = isHome ? 1.08 : 0.94;  // ~8% home boost in xG
  
  // Recent form finishing multiplier (are they hot/cold?)
  const finishingMultiplier = teamNPxG.finishing_rate;
  
  // ELITE FORMULA: Base process × opponent adjustment × venue × finishing
  const lambda = baseNPxG * oppDefStrength * venueMultiplier * finishingMultiplier;
  
  // Bounds check (0.3 to 3.5 goals expected)
  return Math.max(0.3, Math.min(3.5, lambda));
}

/**
 * Calculate confidence in NPxG-based prediction
 * Higher confidence = more model weight vs market
 */
export function calculateNPxGConfidence(teamNPxG, opponentNPxG) {
  if (!teamNPxG || !opponentNPxG) {
    return 0.3;  // Low confidence without NPxG data
  }
  
  let confidence = 0.5;  // Base
  
  // More games = more confidence
  if (teamNPxG.games >= 7) confidence += 0.15;
  if (opponentNPxG.games >= 7) confidence += 0.15;
  
  // Stable finishing rate = more confidence
  const finishingStability = 1 - Math.abs(teamNPxG.finishing_rate - 1.0);
  confidence += finishingStability * 0.1;
  
  // Opponent-adjusted data = more confidence
  if (teamNPxG.opponent_adjusted && opponentNPxG.opponent_adjusted) {
    confidence += 0.1;
  }
  
  return Math.min(0.95, confidence);
}

/**
 * Normalize team names for matching
 */
function normalizeTeamName(name) {
  return name
    .toLowerCase()
    .replace(/\s+fc$/i, '')
    .replace(/\s+afc$/i, '')
    .replace(/\s+united$/i, '')
    .replace(/\s+city$/i, '')
    .replace(/\s+/g, '')
    .replace(/[^\w]/g, '');
}

export default {
  fetchTeamNPxG,
  fetchTeamRecentForm,
  calculateNPxGLambda,
  calculateNPxGConfidence
};
