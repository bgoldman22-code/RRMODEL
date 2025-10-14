#!/usr/bin/env node

/**
 * NBA Vegas Lines Historical Collector
 * 
 * Collects opening and closing lines for NBA games
 * Stores line movement data for model training
 * 
 * Data captured:
 * - Opening spread/total
 * - Closing spread/total  
 * - Line movement (sharp money indicator)
 * - Consensus across books
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   📊  NBA VEGAS LINES COLLECTOR                              ║
║                                                               ║
║   Collecting historical line data for model enhancement      ║
╚═══════════════════════════════════════════════════════════════╝
`);

/**
 * Fetch current odds for NBA
 */
async function fetchCurrentOdds() {
  try {
    const url = `${BASE_URL}/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings,betmgm`;
    
    console.log('Fetching current NBA odds...');
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Fetched odds for ${data.length} games`);
    
    // Check remaining requests
    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    console.log(`📊 API Usage: ${used} used, ${remaining} remaining`);
    
    return data;
  } catch (error) {
    console.error('❌ Error fetching odds:', error.message);
    return [];
  }
}

/**
 * Process odds into structured format
 */
function processOdds(oddsData) {
  const processed = [];
  
  for (const game of oddsData) {
    const gameData = {
      gameId: game.id,
      sport: game.sport_key,
      commence_time: game.commence_time,
      home_team: game.home_team,
      away_team: game.away_team,
      bookmakers: {}
    };
    
    // Process each bookmaker
    for (const book of game.bookmakers) {
      const bookData = {
        last_update: book.last_update
      };
      
      // Spreads
      const spreadMarket = book.markets.find(m => m.key === 'spreads');
      if (spreadMarket) {
        const homeSpread = spreadMarket.outcomes.find(o => o.name === game.home_team);
        const awaySpread = spreadMarket.outcomes.find(o => o.name === game.away_team);
        
        bookData.spread = {
          home_line: homeSpread?.point || null,
          home_price: homeSpread?.price || null,
          away_line: awaySpread?.point || null,
          away_price: awaySpread?.price || null
        };
      }
      
      // Totals
      const totalMarket = book.markets.find(m => m.key === 'totals');
      if (totalMarket) {
        const over = totalMarket.outcomes.find(o => o.name === 'Over');
        const under = totalMarket.outcomes.find(o => o.name === 'Under');
        
        bookData.total = {
          line: over?.point || null,
          over_price: over?.price || null,
          under_price: under?.price || null
        };
      }
      
      gameData.bookmakers[book.key] = bookData;
    }
    
    // Calculate consensus
    const spreads = Object.values(gameData.bookmakers)
      .map(b => b.spread?.home_line)
      .filter(l => l !== null);
    
    const totals = Object.values(gameData.bookmakers)
      .map(b => b.total?.line)
      .filter(l => l !== null);
    
    gameData.consensus = {
      spread: spreads.length > 0 ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null,
      total: totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
      spread_books: spreads.length,
      total_books: totals.length
    };
    
    processed.push(gameData);
  }
  
  return processed;
}

/**
 * Load existing odds data
 */
function loadExistingOdds(season) {
  const filename = `odds_${season.replace('-', '_')}.json`;
  const filepath = path.join(__dirname, '..', 'data', 'nba', 'odds', filename);
  
  try {
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

/**
 * Save odds data
 */
function saveOdds(season, oddsData) {
  const filename = `odds_${season.replace('-', '_')}.json`;
  const dirpath = path.join(__dirname, '..', 'data', 'nba', 'odds');
  const filepath = path.join(dirpath, filename);
  
  // Create directory if needed
  fs.mkdirSync(dirpath, { recursive: true });
  
  // Load existing data
  const existing = loadExistingOdds(season);
  
  // Merge with new data (update existing games, add new ones)
  const merged = [...existing];
  
  for (const newGame of oddsData) {
    const existingIdx = merged.findIndex(g => g.gameId === newGame.gameId);
    
    if (existingIdx >= 0) {
      // Update existing game
      const existing = merged[existingIdx];
      
      // If this is earlier data, mark as opening lines
      const existingTime = new Date(existing.bookmakers[Object.keys(existing.bookmakers)[0]]?.last_update || 0);
      const newTime = new Date(newGame.bookmakers[Object.keys(newGame.bookmakers)[0]]?.last_update || 0);
      
      if (newTime < existingTime) {
        // This is opening line data
        newGame.lineType = 'opening';
        existing.opening = newGame.consensus;
      } else {
        // This is closing line data
        newGame.lineType = 'closing';
        existing.closing = newGame.consensus;
        
        // Calculate line movement
        if (existing.opening) {
          existing.lineMovement = {
            spread: existing.closing.spread - existing.opening.spread,
            total: existing.closing.total - existing.opening.total,
            spreadSteam: Math.abs(existing.closing.spread - existing.opening.spread) > 1,
            totalSteam: Math.abs(existing.closing.total - existing.opening.total) > 2
          };
        }
      }
      
      merged[existingIdx] = existing;
    } else {
      // New game
      newGame.lineType = 'snapshot';
      merged.push(newGame);
    }
  }
  
  // Save
  fs.writeFileSync(filepath, JSON.stringify(merged, null, 2));
  console.log(`💾 Saved to ${filename} (${merged.length} total games)`);
  
  return merged;
}

/**
 * Main execution
 */
async function main() {
  const season = '2024-25';
  
  // Fetch current odds
  const oddsData = await fetchCurrentOdds();
  
  if (oddsData.length === 0) {
    console.log('⚠️  No odds data available');
    return;
  }
  
  // Process odds
  const processed = processOdds(oddsData);
  
  console.log('\n📊 Processed Games:');
  processed.forEach(game => {
    console.log(`  ${game.away_team} @ ${game.home_team}`);
    console.log(`    Spread: ${game.consensus.spread?.toFixed(1) || 'N/A'} (${game.consensus.spread_books} books)`);
    console.log(`    Total: ${game.consensus.total?.toFixed(1) || 'N/A'} (${game.consensus.total_books} books)`);
  });
  
  // Save to file
  const saved = saveOdds(season, processed);
  
  console.log(`\n✅ Collection complete!`);
  console.log(`   Games with opening lines: ${saved.filter(g => g.opening).length}`);
  console.log(`   Games with closing lines: ${saved.filter(g => g.closing).length}`);
  console.log(`   Games with line movement: ${saved.filter(g => g.lineMovement).length}`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
