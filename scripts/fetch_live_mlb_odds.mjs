#!/usr/bin/env node
/**
 * Fetch Live MLB HR Odds
 * 
 * Fetches today's HR odds from TheOddsAPI (FanDuel)
 * Saves to: data/mlb_live/odds/YYYY-MM-DD.json
 * 
 * Usage: node scripts/fetch_live_mlb_odds.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const CONFIG = {
  ODDS_API_KEY: process.env.ODDS_API_KEY || 'YOUR_API_KEY',
  ODDS_API_BASE: 'https://api.the-odds-api.com/v4',
  OUTPUT_DIR: path.join(PROJECT_ROOT, 'data', 'mlb_live', 'odds'),
  MIN_ODDS: 2.5,  // +150 American
  MAX_ODDS: 10.0, // +900 American
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Fetch live MLB HR odds from TheOddsAPI
 */
async function fetchLiveOdds() {
  try {
    console.log('🎲 Fetching live MLB HR odds from TheOddsAPI...\n');
    
    const url = `${CONFIG.ODDS_API_BASE}/sports/baseball_mlb/odds`;
    const params = {
      apiKey: CONFIG.ODDS_API_KEY,
      regions: 'us',
      markets: 'batter_home_runs',
      oddsFormat: 'decimal',
      bookmakers: 'fanduel'
    };
    
    const response = await axios.get(url, { params });
    
    if (!response.data || response.data.length === 0) {
      console.log('⚠️  No games found - MLB season may be inactive');
      return null;
    }
    
    console.log(`✅ Found ${response.data.length} games`);
    
    // Process odds data
    const gamesWithOdds = [];
    let totalPlayers = 0;
    
    for (const event of response.data) {
      const gameData = {
        id: event.id,
        sport_key: event.sport_key,
        commence_time: event.commence_time,
        home_team: event.home_team,
        away_team: event.away_team,
        bookmakers: []
      };
      
      for (const bookmaker of event.bookmakers || []) {
        if (bookmaker.key !== 'fanduel') continue;
        
        const bookmakerData = {
          key: bookmaker.key,
          title: bookmaker.title,
          last_update: bookmaker.last_update,
          markets: []
        };
        
        for (const market of bookmaker.markets || []) {
          if (market.key !== 'batter_home_runs') continue;
          
          const marketData = {
            key: market.key,
            last_update: market.last_update,
            outcomes: []
          };
          
          for (const outcome of market.outcomes || []) {
            if (outcome.name === 'Over' && outcome.point === 0.5) {
              // Filter by odds range
              if (outcome.price >= CONFIG.MIN_ODDS && outcome.price <= CONFIG.MAX_ODDS) {
                marketData.outcomes.push({
                  name: outcome.name,
                  description: outcome.description,
                  price: outcome.price,
                  point: outcome.point
                });
                totalPlayers++;
              }
            }
          }
          
          if (marketData.outcomes.length > 0) {
            bookmakerData.markets.push(marketData);
          }
        }
        
        if (bookmakerData.markets.length > 0) {
          gameData.bookmakers.push(bookmakerData);
        }
      }
      
      if (gameData.bookmakers.length > 0) {
        gamesWithOdds.push(gameData);
      }
    }
    
    console.log(`✅ Found odds for ${totalPlayers} players across ${gamesWithOdds.length} games`);
    
    return {
      date: getTodayDate(),
      timestamp: new Date().toISOString(),
      games_count: gamesWithOdds.length,
      players_count: totalPlayers,
      games: gamesWithOdds
    };
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ API Key invalid or missing. Set ODDS_API_KEY environment variable.');
    } else if (error.response?.status === 429) {
      console.error('❌ Rate limit exceeded. Wait before trying again.');
    } else {
      console.error('❌ Error fetching odds:', error.message);
    }
    throw error;
  }
}

/**
 * Save odds data to file
 */
function saveOdds(oddsData) {
  const date = oddsData.date;
  const filepath = path.join(CONFIG.OUTPUT_DIR, `${date}.json`);
  
  fs.writeFileSync(filepath, JSON.stringify(oddsData, null, 2));
  console.log(`\n💾 Saved to: ${filepath}`);
  
  return filepath;
}

/**
 * Main execution
 */
async function main() {
  try {
    const oddsData = await fetchLiveOdds();
    
    if (!oddsData) {
      console.log('ℹ️  No odds data to save (off-season or no games today)');
      return;
    }
    
    const filepath = saveOdds(oddsData);
    
    console.log('\n✅ Live odds fetch complete!');
    console.log(`📊 ${oddsData.games_count} games, ${oddsData.players_count} players`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fetchLiveOdds };
