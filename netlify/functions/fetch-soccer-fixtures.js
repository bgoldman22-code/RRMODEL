// netlify/functions/fetch-soccer-fixtures.js
// Live soccer fixtures API for BTTS predictions

const API_KEY = process.env.FOOTBALL_API_KEY || 'demo'; // You'll need to set this
const BASE_URL = 'https://api.football-data.org/v4';

// League ID mappings for football-data.org
const LEAGUE_MAPPINGS = {
  'premier-league': { id: 'PL', name: 'Premier League' },
  'champions-league': { id: 'CL', name: 'UEFA Champions League' },
  'bundesliga': { id: 'BL1', name: 'Bundesliga' }
};

// Alternative free API endpoints (no key required)
const FREE_APIS = {
  'thesportsdb': 'https://www.thesportsdb.com/api/v1/json/3',
  'football': 'https://api.football-data.org/v4' // Has free tier
};

async function fetchCurrentFixtures(league, days = 7) {
  try {
    // Get fixtures for next 7 days
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);
    
    const leagueMapping = LEAGUE_MAPPINGS[league];
    if (!leagueMapping) {
      throw new Error(`Unknown league: ${league}`);
    }

    // Try football-data.org first (free tier: 10 requests/minute)
    const url = `${BASE_URL}/competitions/${leagueMapping.id}/matches?dateFrom=${today.toISOString().split('T')[0]}&dateTo=${endDate.toISOString().split('T')[0]}`;
    
    console.log(`Fetching fixtures from: ${url}`);
    
    const headers = {
      'X-Auth-Token': API_KEY
    };
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Transform to our format
    return data.matches?.map(match => ({
      id: `${league}-${match.id}`,
      home_team: match.homeTeam.name,
      away_team: match.awayTeam.name,
      league: league,
      kickoff: match.utcDate,
      venue: match.venue || `${match.homeTeam.name} Stadium`,
      status: match.status,
      matchday: match.matchday,
      // Mock odds for now - would need separate odds API
      odds: generateMockOdds(match.homeTeam.name, match.awayTeam.name)
    })) || [];

  } catch (error) {
    console.error(`Failed to fetch fixtures for ${league}:`, error);
    
    // Fallback to current mock data with proper dates
    return getFallbackFixtures(league);
  }
}

function generateMockOdds(homeTeam, awayTeam) {
  // Generate realistic BTTS odds based on team names (simple heuristic)
  const attackingTeams = ['Liverpool', 'Manchester City', 'Bayern Munich', 'Barcelona', 'Real Madrid', 'Arsenal'];
  const defensiveTeams = ['Atletico Madrid', 'Juventus', 'Chelsea'];
  
  let baseYesOdds = 1.75; // Default
  
  const homeAttacking = attackingTeams.some(team => homeTeam.includes(team));
  const awayAttacking = attackingTeams.some(team => awayTeam.includes(team));
  const homeDefensive = defensiveTeams.some(team => homeTeam.includes(team));
  const awayDefensive = defensiveTeams.some(team => awayTeam.includes(team));
  
  if (homeAttacking && awayAttacking) {
    baseYesOdds = 1.50; // Both attacking = likely BTTS
  } else if (homeDefensive || awayDefensive) {
    baseYesOdds = 2.20; // Defensive teams = less likely BTTS
  }
  
  // Add some randomness
  const variation = (Math.random() - 0.5) * 0.3;
  const yesOdds = Math.max(1.30, Math.min(3.00, baseYesOdds + variation));
  
  // Calculate corresponding No odds to maintain ~5% overround
  const yesImplied = 1 / yesOdds;
  const targetOverround = 1.05;
  const noImplied = targetOverround - yesImplied;
  const noOdds = Math.max(1.20, 1 / noImplied);
  
  return {
    btts_yes: Math.round(yesOdds * 100) / 100,
    btts_no: Math.round(noOdds * 100) / 100,
    bookmaker: ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars'][Math.floor(Math.random() * 4)]
  };
}

function getFallbackFixtures(league) {
  const today = new Date();
  const thisWeekend = new Date();
  thisWeekend.setDate(today.getDate() + (6 - today.getDay())); // Next Saturday
  
  const fixtures = {
    'premier-league': [
      {
        id: 'pl-001',
        home_team: 'Arsenal',
        away_team: 'Manchester City',
        league: 'premier-league',
        kickoff: new Date(thisWeekend.getTime() + 16.5 * 3600000).toISOString(), // Saturday 4:30pm
        venue: 'Emirates Stadium',
        status: 'SCHEDULED',
        matchday: 6,
        odds: { btts_yes: 1.75, btts_no: 2.10, bookmaker: 'FanDuel' }
      },
      {
        id: 'pl-002',
        home_team: 'Liverpool',
        away_team: 'Manchester United',
        league: 'premier-league',
        kickoff: new Date(thisWeekend.getTime() + 24 * 3600000 + 14 * 3600000).toISOString(), // Sunday 2pm
        venue: 'Anfield',
        status: 'SCHEDULED',
        matchday: 6,
        odds: { btts_yes: 1.65, btts_no: 2.25, bookmaker: 'DraftKings' }
      }
    ],
    'bundesliga': [
      {
        id: 'bun-001',
        home_team: 'Bayern Munich',
        away_team: 'Borussia Dortmund',
        league: 'bundesliga',
        kickoff: new Date(thisWeekend.getTime() + 17.5 * 3600000).toISOString(), // Saturday 5:30pm
        venue: 'Allianz Arena',
        status: 'SCHEDULED',
        matchday: 5,
        odds: { btts_yes: 1.55, btts_no: 2.45, bookmaker: 'BetMGM' }
      }
    ],
    'champions-league': [
      {
        id: 'ucl-001',
        home_team: 'Barcelona',
        away_team: 'PSG',
        league: 'champions-league',
        kickoff: new Date(thisWeekend.getTime() + 3 * 24 * 3600000 + 19 * 3600000).toISOString(), // Tuesday 7pm
        venue: 'Camp Nou',
        status: 'SCHEDULED',
        matchday: 2,
        odds: { btts_yes: 1.70, btts_no: 2.15, bookmaker: 'BetMGM' }
      }
    ]
  };
  
  return fixtures[league] || [];
}

// Export for use in main BTTS function
exports.handler = async (event, context) => {
  const { league = 'premier-league', days = 7 } = event.queryStringParameters || {};
  
  try {
    const fixtures = await fetchCurrentFixtures(league, parseInt(days));
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        league,
        fixtures,
        count: fixtures.length,
        fetched_at: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch fixtures',
        details: error.message
      })
    };
  }
};

// Export the function for internal use
exports.fetchCurrentFixtures = fetchCurrentFixtures;