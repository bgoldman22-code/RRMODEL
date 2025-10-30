/**
 * SIMPLE ANYTIME TD API WITH MODEL EDGE CALCULATION
 * Fetches odds from The Odds API and calculates edge using our model
 */

import fs from 'fs/promises';

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Use existing ODDS_API_KEY environment variable
const ODDS_API_KEY = process.env.ODDS_API_KEY;

// Team abbreviation mapping
const TEAM_ABBREV_MAP = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
  "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
  "Seattle Seahawks": "SEA", "San Francisco 49ers": "SF", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
};

// Load player data from R pipeline
async function loadPlayerData() {
  try {
    const data = await fs.readFile('public/nfl-anytime-td-player-data.json', 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('⚠️ Could not load player data, edge calculation will be limited:', error.message);
    return { players: [] };
  }
}

// Simple model probability calculation (inline version to avoid import issues)
function calculateModelProbability(player, opponent) {
  const { position, team, depth_chart_position, key_factors } = player;
  
  // Position baselines
  const BASELINES = {
    'RB': depth_chart_position === 1 ? 0.52 : 0.28,
    'WR': depth_chart_position === 1 ? 0.42 : depth_chart_position === 2 ? 0.28 : 0.16,
    'TE': depth_chart_position === 1 ? 0.36 : 0.14,
    'QB': 0.15
  };
  
  // Team quality multipliers
  const TEAM_QUALITY = {
    'KC': 1.35, 'BUF': 1.32, 'SF': 1.28, 'MIA': 1.26, 'DAL': 1.24, 'PHI': 1.22,
    'DET': 1.20, 'BAL': 1.18, 'CIN': 1.15, 'LAC': 1.12, 'MIN': 1.10, 'HOU': 1.08,
    'GB': 1.05, 'LAR': 1.02, 'SEA': 1.00, 'ATL': 0.98, 'TB': 0.96, 'JAX': 0.92,
    'NO': 0.90, 'IND': 0.88, 'NYJ': 0.85, 'PIT': 0.83, 'CLE': 0.80, 'TEN': 0.78,
    'LV': 0.75, 'DEN': 0.73, 'WAS': 0.72, 'CHI': 0.70, 'NE': 0.68, 'NYG': 0.65,
    'CAR': 0.63, 'ARI': 0.60
  };
  
  // Defensive matchup (easier/harder vs position)
  const DEFENSIVE_MATCHUP = {
    'RB': { 'CAR': 1.35, 'ARI': 1.30, 'NYG': 1.28, 'DET': 0.55, 'PHI': 0.60, 'KC': 0.58 },
    'WR': { 'LV': 1.35, 'CAR': 1.32, 'TEN': 1.28, 'DET': 0.55, 'PHI': 0.58, 'KC': 0.60 },
    'TE': { 'ARI': 1.35, 'LV': 1.32, 'CAR': 1.28, 'DET': 0.55, 'PHI': 0.58, 'KC': 0.60 }
  };
  
  const baseline = BASELINES[position] || 0.12;
  const teamFactor = TEAM_QUALITY[team] || 1.0;
  const defenseFactor = (DEFENSIVE_MATCHUP[position] && DEFENSIVE_MATCHUP[position][opponent]) || 1.0;
  const snapFactor = (key_factors?.snap_percentage || 75) / 75;
  
  return Math.min(0.95, baseline * teamFactor * defenseFactor * snapFactor);
}

export async function handler(event) {
  // Validate API key is present
  if (!ODDS_API_KEY) {
    console.error('❌ ODDS_API_KEY not set in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'API key not configured'
      })
    };
  }
  
  try {
    console.log('🏈 Simple Anytime TD API called');
    
    // Load player data for model predictions
    const playerData = await loadPlayerData();
    console.log(`📊 Loaded ${playerData.players?.length || 0} players from R pipeline`);
    
    // Create player lookup for faster matching
    const playerLookup = {};
    for (const p of playerData.players || []) {
      const key = `${p.player_display_name}_${p.team}`.toLowerCase();
      playerLookup[key] = p;
    }
    
    // Get all NFL events
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${ODDS_API_KEY}`;
    const eventsRes = await fetch(eventsUrl);
    const events = await eventsRes.json();
    
    console.log(`Found ${events.length} NFL events`);
    
    const allPlayers = [];
    
    // For each event, get player TD odds (ALL Week 9 games)
    for (const event of events) {
      console.log(`Fetching odds for ${event.away_team} @ ${event.home_team}`);
      
      const homeTeam = TEAM_ABBREV_MAP[event.home_team] || event.home_team;
      const awayTeam = TEAM_ABBREV_MAP[event.away_team] || event.away_team;
      
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?markets=player_anytime_td&regions=us&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm&apiKey=${ODDS_API_KEY}`;
      const oddsRes = await fetch(oddsUrl);
      const oddsData = await oddsRes.json();
      
      // Process each bookmaker's odds
      const playerOdds = {};
      for (const bookmaker of oddsData.bookmakers || []) {
        const market = bookmaker.markets?.find(m => m.key === 'player_anytime_td');
        if (!market) continue;
        
        for (const outcome of market.outcomes || []) {
          const playerName = outcome.description;
          if (!playerOdds[playerName]) {
            playerOdds[playerName] = {
              name: playerName,
              allOdds: [],
              bookmakers: []
            };
          }
          playerOdds[playerName].allOdds.push(outcome.price);
          playerOdds[playerName].bookmakers.push(bookmaker.key);
        }
      }
      
      // Convert to array and add game context
      for (const player of Object.values(playerOdds)) {
        // Get unique bookmaker count and best odds
        const uniqueBooks = [...new Set(player.bookmakers)].length;
        
        // Best odds: for negative odds (favorites), least negative is best
        // for positive odds (underdogs), most positive is best
        // Math.max works for both! -210 > -230, and +150 > +120
        const bestOdds = Math.max(...player.allOdds);
        
        // Calculate implied probability from American odds
        let impliedProb = 0;
        if (bestOdds > 0) {
          impliedProb = 100 / (bestOdds + 100);
        } else if (bestOdds < 0) {
          impliedProb = Math.abs(bestOdds) / (Math.abs(bestOdds) + 100);
        }
        
        if (uniqueBooks >= 1) {  // Show players with 1+ books (changed from 2+)
          // Try to find player in R data to get model prediction
          let modelProb = null;
          let edge = null;
          let playerTeam = null;
          let opponent = null;
          
          // Try to match player to R data
          for (const team of [homeTeam, awayTeam]) {
            const lookupKey = `${player.name}_${team}`.toLowerCase();
            const matchedPlayer = playerLookup[lookupKey];
            
            if (matchedPlayer) {
              playerTeam = team;
              opponent = team === homeTeam ? awayTeam : homeTeam;
              
              // Calculate model probability using inline function
              try {
                modelProb = calculateModelProbability(matchedPlayer, opponent);
                edge = modelProb - impliedProb;
              } catch (err) {
                console.warn(`⚠️ Could not calculate model prob for ${player.name}:`, err.message);
              }
              break;
            }
          }
          
          allPlayers.push({
            name: player.name,
            game: `${event.away_team} @ ${event.home_team}`,
            team: playerTeam,
            bestOdds: bestOdds,
            books_count: uniqueBooks,
            odds_qualified: true,
            implied_probability: impliedProb,
            model_probability: modelProb,
            edge: edge,
            commence_time: event.commence_time
          });
        }
      }
    }
    
    // Sort by edge first (if available), then by implied probability
    allPlayers.sort((a, b) => {
      if (a.edge !== null && b.edge !== null) {
        return b.edge - a.edge; // Highest edge first
      }
      if (a.edge !== null) return -1; // Players with edge before those without
      if (b.edge !== null) return 1;
      return b.implied_probability - a.implied_probability; // Fall back to implied prob
    });
    
    console.log(`Returning ${allPlayers.length} qualified players`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        success: true,
        count: allPlayers.length,
        players: allPlayers,
        generated_at: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}

function oddsToProb(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}
