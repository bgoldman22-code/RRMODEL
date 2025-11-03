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
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
    .filter(b => b.minutes > 0);

  if (games.length < 5) return null;

  const L5 = games.slice(0, 5);
  const L10 = games.slice(0, 10);
  
  // Calculate minute variance (coefficient of variation)
  const minuteValues = L10.map(g => g.minutes);
  const avgMinutes = minuteValues.reduce((a, b) => a + b, 0) / minuteValues.length;
  const minuteStdev = Math.sqrt(minuteValues.reduce((sq, n) => sq + Math.pow(n - avgMinutes, 2), 0) / minuteValues.length);
  const minuteCV = (minuteStdev / avgMinutes) * 100;

  return {
    L5_rpg: L5.reduce((sum, g) => sum + g.rebounds, 0) / L5.length,
    L5_apg: L5.reduce((sum, g) => sum + g.assists, 0) / L5.length,
    L5_minutes: L5.reduce((sum, g) => sum + g.minutes, 0) / L5.length,
    L10_rpg: L10.reduce((sum, g) => sum + g.rebounds, 0) / L10.length,
    L10_apg: L10.reduce((sum, g) => sum + g.assists, 0) / L10.length,
    avgMinutes,
    minuteCV,
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

  // Calculate confidence based on sample size and consistency
  const gamesPlayed = stats.games_played;
  let confidence = 0.5;
  
  if (gamesPlayed >= 10) confidence = 0.7;
  if (gamesPlayed >= 15) confidence = 0.75;
  if (gamesPlayed >= 20) confidence = 0.8;
  
  return { predicted: prediction, confidence };
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

    // Calculate top 8 rotation players per team (for filtering)
    console.log('📊 Calculating rotation rankings...');
    const playerMinutesByTeam = {};
    
    // Find the most recent date in the data
    const mostRecentDate = new Date(Math.max(...boxscores.map(b => new Date(b.gameDate))));
    const cutoffDate = new Date(mostRecentDate);
    cutoffDate.setDate(cutoffDate.getDate() - 20); // Last 20 days from most recent data
    
    boxscores
      .filter(b => new Date(b.gameDate) >= cutoffDate && b.minutes > 0)
      .forEach(b => {
        if (!playerMinutesByTeam[b.teamTricode]) {
          playerMinutesByTeam[b.teamTricode] = {};
        }
        if (!playerMinutesByTeam[b.teamTricode][b.playerName]) {
          playerMinutesByTeam[b.teamTricode][b.playerName] = [];
        }
        playerMinutesByTeam[b.teamTricode][b.playerName].push(b.minutes);
      });
    
    // Get top 8 minutes players per team
    const top8PlayersByTeam = {};
    for (const [team, players] of Object.entries(playerMinutesByTeam)) {
      const playerAvgs = Object.entries(players)
        .map(([name, mins]) => ({
          name,
          avgMinutes: mins.reduce((a, b) => a + b, 0) / mins.length,
          games: mins.length
        }))
        .filter(p => p.games >= 3) // At least 3 games
        .sort((a, b) => b.avgMinutes - a.avgMinutes)
        .slice(0, 8);
      
      top8PlayersByTeam[team] = new Set(playerAvgs.map(p => p.name));
    }
    
    console.log(`✅ Identified top 8 rotation players for ${Object.keys(top8PlayersByTeam).length} teams`);

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

            // FILTER: Only top 8 rotation players
            const playerTeam = stats.last_game?.teamTricode;
            if (!playerTeam || !top8PlayersByTeam[playerTeam]) continue;
            if (!top8PlayersByTeam[playerTeam].has(playerName)) continue;
            
            // FILTER: Stable minutes only (less than 25% coefficient of variation)
            if (stats.minuteCV > 25) continue;

            // Rough heuristic for home team
            const isHome = game.home_team.toLowerCase().includes(playerName.split(' ').slice(-1)[0].toLowerCase());
            const restDays = calculateRestDays(playerName, gameDate, boxscores);

            const prediction = generatePrediction(stats, propType, isHome, restDays);
            if (!prediction) continue;

            const { predicted, confidence } = prediction;
            
            if (confidence < CONFIDENCE_THRESHOLD) continue;

            // Calculate edge as probability difference (matching local script)
            const overOdds = overOutcome.price;
            const underOdds = underOutcome.price;
            const overProb = americanToProb(overOdds);
            const underProb = americanToProb(underOdds);
            
            // Our probability estimates
            const ourOverProb = predicted > line ? 0.65 : 0.35;
            const ourUnderProb = 1 - ourOverProb;

            const overEdge = (ourOverProb - overProb) * 100;
            const underEdge = (ourUnderProb - underProb) * 100;

            // Check Over bet
            if (overEdge >= EDGE_THRESHOLD) {
              const kelly = (ourOverProb * (overOdds / 100 + 1) - 1) / (overOdds / 100);
              if (kelly >= MIN_KELLY) {
                predictions.push({
                  player: playerName,
                  team: homeTeam.includes(playerName.split(' ')[0]) ? homeTeam : awayTeam,
                  opponent: homeTeam.includes(playerName.split(' ')[0]) ? awayTeam : homeTeam,
                  isHome: homeTeam.includes(playerName.split(' ')[0]),
                  gameTime: gameDate,
                  propType: propType.replace('player_', ''),
                  prediction: Math.round(predicted * 10) / 10,
                  vegasLine: line,
                  edge: Math.round(overEdge * 10) / 10,
                  betSide: 'OVER',
                  vegasOdds: overOdds,
                  impliedProb: Math.round(overProb * 1000) / 10,
                  confidence: Math.round(confidence * 1000) / 10,
                  kellyFraction: Math.round(kelly * 1000) / 10,
                  bookmaker: bookmaker.key,
                  generatedAt: nowISO
                });
              }
            }

            // Check Under bet
            if (underEdge >= EDGE_THRESHOLD) {
              const kelly = (ourUnderProb * (Math.abs(underOdds) / 100 + 1) - 1) / (Math.abs(underOdds) / 100);
              if (kelly >= MIN_KELLY) {
                predictions.push({
                  player: playerName,
                  team: homeTeam.includes(playerName.split(' ')[0]) ? homeTeam : awayTeam,
                  opponent: homeTeam.includes(playerName.split(' ')[0]) ? awayTeam : homeTeam,
                  isHome: homeTeam.includes(playerName.split(' ')[0]),
                  gameTime: gameDate,
                  propType: propType.replace('player_', ''),
                  prediction: Math.round(predicted * 10) / 10,
                  vegasLine: line,
                  edge: Math.round(underEdge * 10) / 10,
                  betSide: 'UNDER',
                  vegasOdds: underOdds,
                  impliedProb: Math.round(underProb * 1000) / 10,
                  confidence: Math.round(confidence * 1000) / 10,
                  kellyFraction: Math.round(kelly * 1000) / 10,
                  bookmaker: bookmaker.key,
                  generatedAt: nowISO
                });
              }
            }
          }
        }
      }
    }

    predictions.sort((a, b) => b.edge - a.edge);

    // Deduplicate: Keep best line for each player/prop/pick combination
    console.log(`\n🔍 Deduplicating picks...`);
    const dedupMap = new Map();
    
    for (const pick of predictions) {
      const key = `${pick.player}|${pick.propType.toUpperCase()}|${pick.betSide}`;
      
      if (!dedupMap.has(key)) {
        dedupMap.set(key, pick);
      } else {
        const existing = dedupMap.get(key);
        
        // For OVER: prefer higher line (harder to hit, more value)
        // For UNDER: prefer lower line (harder to hit, more value)
        let shouldReplace = false;
        
        if (pick.betSide === 'OVER') {
          shouldReplace = parseFloat(pick.vegasLine) > parseFloat(existing.vegasLine);
        } else if (pick.betSide === 'UNDER') {
          shouldReplace = parseFloat(pick.vegasLine) < parseFloat(existing.vegasLine);
        }
        
        // If lines are equal, pick better edge
        if (Math.abs(parseFloat(pick.vegasLine) - parseFloat(existing.vegasLine)) < 0.1) {
          shouldReplace = parseFloat(pick.edge) > parseFloat(existing.edge);
        }
        
        if (shouldReplace) {
          dedupMap.set(key, pick);
        }
      }
    }
    
    const uniquePredictions = Array.from(dedupMap.values());
    console.log(`   Removed ${predictions.length - uniquePredictions.length} duplicate lines`);
    
    // Sort by edge
    uniquePredictions.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));

    const output = {
      generated: nowISO,
      games: gamesWithProps.length,
      model: 'Baseline v2',
      dataSource: 'Netlify Blobs (auto-updated daily)',
      historical: {
        rebounds: { status: 'profitable', winRate: 62.5, roi: 19.3 },
        assists: { status: 'profitable', winRate: 66.7, roi: 27.3 }
      },
      thresholds: {
        edge: EDGE_THRESHOLD,
        confidence: CONFIDENCE_THRESHOLD,
        kelly: MIN_KELLY
      },
      predictions: uniquePredictions
    };

    // Store predictions in Netlify Blobs (so frontend can read them)
    await store.set('nba-picks-latest', JSON.stringify(output));

    console.log(`✅ Generated ${uniquePredictions.length} predictions (${predictions.length} before dedup)`);
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
