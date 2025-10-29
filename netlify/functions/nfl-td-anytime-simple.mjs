/**
 * SIMPLE ANYTIME TD API WITH MODEL EDGE CALCULATION
 * Fetches odds from The Odds API and calculates edge using our model
 */

import { buildSimpleTDProbability } from './nfl-td-comprehensive-predictions/td-odds-first-engine.mjs';
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
        const bestOdds = Math.max(...player.allOdds);
        const impliedProb = oddsToProb(bestOdds);
        
        if (uniqueBooks >= 2) {  // Only players with 2+ books
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
              
              // Calculate model probability using our engine
              try {
                const tdProbs = buildSimpleTDProbability(
                  { position: matchedPlayer.position, team: playerTeam },
                  matchedPlayer.depth_chart_position || 1,
                  { status: 'active', snap_pct: matchedPlayer.key_factors?.snap_percentage || 75 },
                  opponent
                );
                modelProb = tdProbs.anytime;
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
