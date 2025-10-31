/**
 * Netlify Scheduled Function - Daily NBA Predictions Generator
 * 
 * Runs daily at 7:00 AM Eastern Time
 * Schedule: 0 11 * * * (11am UTC = 7am EDT, 6am EST after Nov 3)
 * 
 * Generates predictions for games starting within next 18 hours
 * 
 * Data Source: Netlify Blobs (updated daily at 10am UTC by update-boxscores-daily.mjs)
 * - Always fresh: includes last night's games
 * - No rebuilds: data updates independently from code
 * 
 * Environment Variables Required:
 * - ODDS_API_KEY: TheOddsAPI key (set in Netlify dashboard)
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';

// Configuration
const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us';
const BOOKMAKERS = 'draftkings,fanduel';
const ODDS_FORMAT = 'american';

// Betting thresholds
const EDGE_THRESHOLD = 4.0;
const CONFIDENCE_THRESHOLD = 0.60;
const MIN_KELLY = 0.01;

// Utility functions
function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate player statistics from boxscores
function calculatePlayerStats(boxscores, playerName, asOfDate) {
  const games = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(asOfDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.date))
    .filter(b => b.minutes > 0);

  if (games.length < 5) return null;

  const L5 = games.slice(0, 5);
  const L10 = games.slice(0, 10);

  return {
    L5_rpg: L5.reduce((sum, g) => sum + g.rebounds, 0) / L5.length,
    L5_apg: L5.reduce((sum, g) => sum + g.assists, 0) / L5.length,
    L5_minutes: L5.reduce((sum, g) => sum + g.minutes, 0) / L5.length,
    L10_rpg: L10.reduce((sum, g) => sum + g.rebounds, 0) / L10.length,
    L10_apg: L10.reduce((sum, g) => sum + g.assists, 0) / L10.length,
    L10_minutes: L10.reduce((sum, g) => sum + g.minutes, 0) / L10.length,
    season_rpg: games.reduce((sum, g) => sum + g.rebounds, 0) / games.length,
    season_apg: games.reduce((sum, g) => sum + g.assists, 0) / games.length,
    games_played: games.length,
    last_game: games[0]
  };
}

// Generate prediction using baseline v2
function generatePrediction(stats, propType, isHome, restDays) {
  if (!stats) return null;

  let base, seasonAvg;
  
  if (propType === 'player_rebounds') {
    base = stats.L5_rpg;
    seasonAvg = stats.season_rpg;
  } else if (propType === 'player_assists') {
    base = stats.L5_apg;
    seasonAvg = stats.season_apg;
  } else {
    return null;
  }

  let prediction = base;

  // Trend adjustment
  if (seasonAvg > 0) {
    const trend = base / seasonAvg;
    if (trend > 1.15) prediction *= 1.05;
    else if (trend < 0.85) prediction *= 0.95;
  }

  // Minutes adjustment
  const minutesTrend = stats.L5_minutes / stats.L10_minutes;
  if (minutesTrend > 1.1) prediction *= 1.03;
  else if (minutesTrend < 0.9) prediction *= 0.97;

  // Home court
  if (isHome) {
    prediction *= (propType === 'player_rebounds' ? 1.02 : 1.03);
  }

  // Rest days
  if (restDays === 0) {
    prediction *= 0.97;
  } else if (restDays >= 3) {
    prediction *= 1.01;
  }

  return prediction;
}

// Calculate rest days
function calculateRestDays(playerName, gameDate, boxscores) {
  const prevGames = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(gameDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.date));
  
  if (prevGames.length === 0) return 2;
  
  const lastGame = new Date(prevGames[0].date);
  const days = Math.floor((new Date(gameDate) - lastGame) / (1000 * 60 * 60 * 24));
  return days;
}

export default async (req, context) => {
  console.log('🏀 NBA Daily Predictions - Starting...');
  
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'ODDS_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Load boxscores from Netlify Blobs (updated daily at 10am UTC)
    console.log('📥 Loading boxscores from Netlify Blobs...');
    const store = getStore('nba-data');
    
    // Read both blobs (no decompression needed - Netlify handles it automatically)
    const [historicalData, currentData] = await Promise.all([
      store.get('player-boxscores-historical', { type: 'json' }),
      store.get('player-boxscores-current', { type: 'json' })
    ]);
    
    if (!historicalData || !currentData) {
      throw new Error('No boxscores found in Netlify Blobs. Run seed-blobs-locally first.');
    }
    
    // Merge both datasets
    const boxscores = [...historicalData, ...currentData];
    
    console.log(`✅ Loaded ${boxscores.length} boxscore entries from Blobs (${historicalData.length} historical + ${currentData.length} current)`);

    // Fetch upcoming games
    const gamesUrl = `${BASE_URL}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&oddsFormat=${ODDS_FORMAT}`;
    const response = await fetch(gamesUrl);
    const allGames = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Filter to games within 18 hours
    const now = new Date();
    const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
    const todaysGames = allGames.filter(game => {
      const gameTime = new Date(game.commence_time);
      return gameTime <= eighteenHoursFromNow;
    });
    
    console.log(`📅 ${todaysGames.length} games within next 18 hours`);

    // Fetch player props for each game
    const gamesWithProps = [];
    for (const game of todaysGames) {
      const gameProps = { ...game, bookmakers: [] };
      
      for (const market of ['player_rebounds', 'player_assists']) {
        const propsUrl = `${BASE_URL}/sports/${SPORT}/events/${game.id}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${market}&bookmakers=${BOOKMAKERS}&oddsFormat=${ODDS_FORMAT}`;
        
        await sleep(1000);
        
        const propsResponse = await fetch(propsUrl);
        const propsData = await propsResponse.json();
        
        if (propsResponse.ok && propsData.bookmakers?.length > 0) {
          gameProps.bookmakers.push(...propsData.bookmakers);
        }
      }
      
      if (gameProps.bookmakers.length > 0) {
        gamesWithProps.push(gameProps);
      }
    }

    console.log(`✅ ${gamesWithProps.length} games with player props`);

    // Generate predictions
    const predictions = [];
    const nowISO = new Date().toISOString();

    for (const game of gamesWithProps) {
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const gameDate = game.commence_time;

      for (const bookmaker of game.bookmakers) {
        for (const market of bookmaker.markets) {
          const propType = market.key;
          
          if (!['player_rebounds', 'player_assists'].includes(propType)) continue;

          for (const outcome of market.outcomes) {
            const playerName = outcome.description;
            const line = outcome.point;
            
            // Get both sides
            const overOutcome = market.outcomes.find(o => o.description === playerName && o.name === 'Over');
            const underOutcome = market.outcomes.find(o => o.description === playerName && o.name === 'Under');
            
            if (!overOutcome || !underOutcome) continue;

            const stats = calculatePlayerStats(boxscores, playerName, gameDate);
            if (!stats || stats.games_played < 5) continue;

            // Rough heuristic for home team
            const isHome = game.home_team.toLowerCase().includes(playerName.split(' ').slice(-1)[0].toLowerCase());
            const restDays = calculateRestDays(playerName, gameDate, boxscores);

            const prediction = generatePrediction(stats, propType, isHome, restDays);
            if (!prediction) continue;

            // Calculate edges
            const overEdge = prediction - line;
            const underEdge = line - prediction;

            let betSide, edge, vegasOdds, impliedProb;
            if (Math.abs(overEdge) > Math.abs(underEdge)) {
              betSide = 'OVER';
              edge = overEdge;
              vegasOdds = overOutcome.price;
              impliedProb = americanToProb(overOutcome.price);
            } else {
              betSide = 'UNDER';
              edge = underEdge;
              vegasOdds = underOutcome.price;
              impliedProb = americanToProb(underOutcome.price);
            }

            const confidence = betSide === 'OVER' 
              ? Math.min(0.95, prediction / (line + 5)) 
              : Math.min(0.95, (line - prediction + 5) / line);

            const kellyFraction = confidence > impliedProb 
              ? (confidence - impliedProb) / (1 - impliedProb) 
              : 0;

            // Filter by thresholds
            if (Math.abs(edge) < EDGE_THRESHOLD || confidence < CONFIDENCE_THRESHOLD || kellyFraction < MIN_KELLY) {
              continue;
            }

            predictions.push({
              player: playerName,
              team: isHome ? homeTeam : awayTeam,
              opponent: isHome ? awayTeam : homeTeam,
              isHome,
              gameTime: gameDate,
              propType: propType.replace('player_', ''),
              prediction: Math.round(prediction * 10) / 10,
              vegasLine: line,
              edge: Math.round(edge * 10) / 10,
              betSide,
              vegasOdds,
              impliedProb: Math.round(impliedProb * 1000) / 10,
              confidence: Math.round(confidence * 1000) / 10,
              kellyFraction: Math.round(kellyFraction * 1000) / 10,
              bookmaker: bookmaker.key,
              generatedAt: nowISO
            });
          }
        }
      }
    }

    predictions.sort((a, b) => b.edge - a.edge);

    // Build output
    const output = {
      generated: nowISO,
      count: predictions.length,
      models: {
        rebounds: { status: 'profitable', winRate: 62.5, roi: 19.3 },
        assists: { status: 'profitable', winRate: 66.7, roi: 27.3 }
      },
      thresholds: {
        edge: EDGE_THRESHOLD,
        confidence: CONFIDENCE_THRESHOLD,
        kelly: MIN_KELLY
      },
      predictions
    };

    // Store predictions in Netlify Blobs (so frontend can read them)
    await store.set('nba-picks-latest', JSON.stringify(output));

    console.log(`✅ Generated ${predictions.length} predictions`);
    console.log(`📦 Stored in Blobs: nba-picks-latest`);
    console.log('🏴‍☠️ YOUR FAMILY DEPENDS ON THESE BETS!');

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: "0 11 * * *"  // Daily at 11:00 AM UTC (7:00 AM EDT / 6:00 AM EST after Nov 3)
};
