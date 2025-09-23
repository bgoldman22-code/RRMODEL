// netlify/functions/soccer-data-pipeline.js
// Basic soccer data pipeline using TheSportsDB API (free tier)
// Fetches team stats, fixtures, and recent form data for BTTS predictions

const LEAGUES_API_MAP = {
  'premier-league': {
    id: '4328',
    api_id: '133604', // TheSportsDB League ID for Premier League
    name: 'English Premier League'
  },
  'bundesliga': {
    id: '4331', 
    api_id: '133618', // TheSportsDB League ID for Bundesliga
    name: 'German Bundesliga'
  },
  'champions-league': {
    id: '4480',
    api_id: '133636', // TheSportsDB League ID for Champions League
    name: 'UEFA Champions League'
  }
};

// TheSportsDB API endpoints (free tier)
const SPORTS_DB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

async function fetchLeagueTable(leagueApiId, season = '2024-25') {
  try {
    const url = `${SPORTS_DB_BASE}/lookuptable.php?l=${leagueApiId}&s=${season}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch league table: ${response.status}`);
    }
    
    const data = await response.json();
    return data.table || [];
  } catch (error) {
    console.error('Error fetching league table:', error);
    return [];
  }
}

async function fetchTeamStats(teamName, season = '2024') {
  try {
    // Search for team by name
    const searchUrl = `${SPORTS_DB_BASE}/searchteams.php?t=${encodeURIComponent(teamName)}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (!searchData.teams || searchData.teams.length === 0) {
      return null;
    }
    
    const team = searchData.teams[0];
    
    // Get team's recent fixtures (last 15 games)
    const fixturesUrl = `${SPORTS_DB_BASE}/eventslast.php?id=${team.idTeam}`;
    const fixturesResponse = await fetch(fixturesUrl);
    const fixturesData = await fixturesResponse.json();
    
    const recentGames = fixturesData.results || [];
    
    // Calculate BTTS stats from recent games
    let homeGames = 0, awayGames = 0;
    let homeGoalsScored = 0, homeGoalsConceded = 0;
    let awayGoalsScored = 0, awayGoalsConceded = 0;
    let homeBTTS = 0, awayBTTS = 0;
    
    recentGames.forEach(game => {
      const homeScore = parseInt(game.intHomeScore) || 0;
      const awayScore = parseInt(game.intAwayScore) || 0;
      const bothScored = homeScore > 0 && awayScore > 0;
      
      if (game.strHomeTeam === team.strTeam) {
        // Playing at home
        homeGames++;
        homeGoalsScored += homeScore;
        homeGoalsConceded += awayScore;
        if (bothScored) homeBTTS++;
      } else if (game.strAwayTeam === team.strTeam) {
        // Playing away
        awayGames++;
        awayGoalsScored += awayScore;
        awayGoalsConceded += homeScore;
        if (bothScored) awayBTTS++;
      }
    });
    
    return {
      name: team.strTeam,
      games_home: homeGames,
      games_away: awayGames,
      goals_scored_home: homeGoalsScored,
      goals_conceded_home: homeGoalsConceded,
      goals_scored_away: awayGoalsScored,
      goals_conceded_away: awayGoalsConceded,
      btts_rate_home: homeGames > 0 ? homeBTTS / homeGames : 0.5,
      btts_rate_away: awayGames > 0 ? awayBTTS / awayGames : 0.5,
      form_last_5: recentGames.slice(0, 5).map(g => {
        const isHome = g.strHomeTeam === team.strTeam;
        const teamScore = isHome ? parseInt(g.intHomeScore) : parseInt(g.intAwayScore);
        const oppScore = isHome ? parseInt(g.intAwayScore) : parseInt(g.intHomeScore);
        return teamScore > oppScore ? 'W' : teamScore === oppScore ? 'D' : 'L';
      })
    };
  } catch (error) {
    console.error(`Error fetching team stats for ${teamName}:`, error);
    return null;
  }
}

async function fetchUpcomingFixtures(leagueApiId, limit = 10) {
  try {
    const url = `${SPORTS_DB_BASE}/eventsnextleague.php?id=${leagueApiId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch fixtures: ${response.status}`);
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    return events.slice(0, limit).map(event => ({
      id: event.idEvent,
      home_team: event.strHomeTeam,
      away_team: event.strAwayTeam,
      kickoff: event.strTimestamp ? new Date(event.strTimestamp).toISOString() : null,
      venue: event.strVenue,
      round: event.intRound,
      season: event.strSeason
    }));
  } catch (error) {
    console.error('Error fetching upcoming fixtures:', error);
    return [];
  }
}

// Netlify function handler
exports.handler = async (event, context) => {
  try {
    const { league = 'premier-league', operation = 'fixtures', team } = event.queryStringParameters || {};
    
    const leagueConfig = LEAGUES_API_MAP[league];
    if (!leagueConfig) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid league',
          available: Object.keys(LEAGUES_API_MAP)
        })
      };
    }

    let result = {};

    switch (operation) {
      case 'fixtures':
        const fixtures = await fetchUpcomingFixtures(leagueConfig.api_id, 15);
        result = {
          league: leagueConfig.name,
          fixtures: fixtures,
          count: fixtures.length
        };
        break;

      case 'team':
        if (!team) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Team name required for team stats' })
          };
        }
        const teamStats = await fetchTeamStats(team);
        result = {
          team: team,
          stats: teamStats,
          league: leagueConfig.name
        };
        break;

      case 'table':
        const table = await fetchLeagueTable(leagueConfig.api_id);
        result = {
          league: leagueConfig.name,
          table: table,
          updated: new Date().toISOString()
        };
        break;

      default:
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Invalid operation',
            available: ['fixtures', 'team', 'table']
          })
        };
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ...result,
        metadata: {
          generated_at: new Date().toISOString(),
          source: 'TheSportsDB API (free tier)',
          cache_duration: '15 minutes'
        }
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Data pipeline failed',
        details: error.message
      })
    };
  }
};