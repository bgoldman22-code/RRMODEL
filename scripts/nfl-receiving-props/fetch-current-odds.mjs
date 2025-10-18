#!/usr/bin/env node

/**
 * Fetch real-time odds for NFL receiving props from The Odds API
 * 
 * Markets: player_receptions, player_reception_yds (FIXED: was player_receiving_yards)
 * 
 * Output: JSON file with current odds for all available props
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
const SPORT = 'americanfootball_nfl';
const REGIONS = 'us';
const MARKETS = 'player_receptions,player_reception_yds'; // FIXED: Use correct market keys
const ODDS_FORMAT = 'american';

if (!API_KEY) {
  console.error('❌ Error: THEODDS_API_KEY environment variable not set');
  process.exit(1);
}

/**
 * Convert American odds to implied probability
 */
function americanToProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Fetch current NFL games
 */
async function fetchNFLGames() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/events?apiKey=${API_KEY}`;
  
  console.log('📡 Fetching NFL games...');
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch games: ${response.statusText}`);
  }
  
  const games = await response.json();
  console.log(`✅ Found ${games.length} upcoming NFL games\n`);
  
  return games;
}

/**
 * Fetch player props for a specific game
 */
async function fetchPlayerProps(gameId) {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${gameId}/odds?` +
    `apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=${ODDS_FORMAT}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch props for game ${gameId}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Parse player props from API response
 */
function parsePlayerProps(gameData) {
  const props = [];
  
  if (!gameData.bookmakers || gameData.bookmakers.length === 0) {
    return props;
  }
  
  for (const bookmaker of gameData.bookmakers) {
    for (const market of bookmaker.markets || []) {
      const marketType = market.key; // 'player_receptions' or 'player_reception_yds'
      
      for (const outcome of market.outcomes || []) {
        const playerName = outcome.description;
        const line = outcome.point;
        const side = outcome.name; // 'Over' or 'Under'
        const odds = outcome.price;
        const impliedProb = americanToProb(odds);
        
        props.push({
          game_id: gameData.id,
          home_team: gameData.home_team,
          away_team: gameData.away_team,
          commence_time: gameData.commence_time,
          bookmaker: bookmaker.key,
          market: marketType,
          player: playerName,
          line: line,
          side: side.toLowerCase(),
          odds: odds,
          implied_prob: impliedProb
        });
      }
    }
  }
  
  return props;
}

/**
 * Get best odds (highest implied prob = best value for bettor)
 */
function getBestOdds(allProps) {
  const bestOdds = {};
  
  for (const prop of allProps) {
    const key = `${prop.player}|${prop.market}|${prop.line}|${prop.side}`;
    
    if (!bestOdds[key] || prop.odds > bestOdds[key].odds) {
      bestOdds[key] = prop;
    }
  }
  
  return Object.values(bestOdds);
}

/**
 * Main function
 */
async function main() {
  console.log('🏈 NFL RECEIVING PROPS - ODDS FETCHER\n');
  console.log('=====================================\n');
  
  try {
    // Fetch games
    const games = await fetchNFLGames();
    
    if (games.length === 0) {
      console.log('⚠️  No upcoming NFL games found');
      return;
    }
    
    // Fetch props for each game
    const allProps = [];
    
    for (const game of games.slice(0, 5)) { // Limit to 5 games to conserve API calls
      console.log(`📊 Fetching props for ${game.away_team} @ ${game.home_team}...`);
      
      try {
        const gameData = await fetchPlayerProps(game.id);
        const props = parsePlayerProps(gameData);
        allProps.push(...props);
        console.log(`   Found ${props.length} prop markets\n`);
        
        // Rate limit: 0.5 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
      }
    }
    
    // Get best odds
    const bestOdds = getBestOdds(allProps);
    
    console.log(`\n✅ SUMMARY:\n`);
    console.log(`   Total props: ${allProps.length}`);
    console.log(`   Unique markets: ${bestOdds.length}`);
    console.log(`   Bookmakers: ${new Set(allProps.map(p => p.bookmaker)).size}\n`);
    
    // Group by market
    const receptions = bestOdds.filter(p => p.market === 'player_receptions');
    const yards = bestOdds.filter(p => p.market === 'player_reception_yds'); // FIXED
    
    console.log(`📦 BY MARKET:\n`);
    console.log(`   Receptions: ${receptions.length} props`);
    console.log(`   Receiving Yards: ${yards.length} props\n`);
    
    // Save to file
    const outputDir = 'data/nfl_receiving_props';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, 'current_odds.json');
    fs.writeFileSync(outputFile, JSON.stringify({
      fetched_at: new Date().toISOString(),
      total_props: allProps.length,
      best_odds: bestOdds,
      all_props: allProps
    }, null, 2));
    
    console.log(`💾 Saved to ${outputFile}\n`);
    
    // Show sample
    console.log('📋 SAMPLE PROPS:\n');
    const sample = bestOdds.slice(0, 10);
    for (const prop of sample) {
      const probPct = (prop.implied_prob * 100).toFixed(1);
      console.log(`   ${prop.player} ${prop.market.replace('player_', '')} ${prop.side} ${prop.line}`);
      console.log(`   ${prop.odds > 0 ? '+' : ''}${prop.odds} (${probPct}% implied) - ${prop.bookmaker}\n`);
    }
    
    console.log('✅ COMPLETE!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
