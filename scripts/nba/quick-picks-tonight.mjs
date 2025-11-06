#!/usr/bin/env node
/**
 * SIMPLE NBA Props Generator
 * 
 * Uses Vegas lines as baseline + simple adjustments
 * No historical boxscores needed - just tonight's prop odds
 * 
 * Usage: ODDS_API_KEY=xxx node scripts/nba/quick-picks-tonight.mjs
 */

import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const API_KEY = process.env.ODDS_API_KEY || process.env.THEODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us';
const BOOKMAKERS = 'draftkings,fanduel,betmgm';
const ODDS_FORMAT = 'american';

const EDGE_THRESHOLD = 5.0; // Higher threshold since we're using simpler model
const MIN_KELLY = 0.015;

function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🏀 QUICK NBA Props - Tonight');
  console.log('='.repeat(60));
  
  if (!API_KEY) {
    console.error('\n❌ ODDS_API_KEY or THEODDS_API_KEY environment variable required');
    process.exit(1);
  }

  // Fetch upcoming games
  console.log('\n📅 Fetching tonight\'s games...');
  const gamesUrl = `${BASE_URL}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&oddsFormat=${ODDS_FORMAT}`;
  const response = await fetch(gamesUrl);
  const allGames = await response.json();

  if (!response.ok) {
    throw new Error(`API error: ${response.status} - ${JSON.stringify(allGames)}`);
  }

  // Filter to games within 24 hours
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const todaysGames = allGames.filter(game => {
    const gameTime = new Date(game.commence_time);
    return gameTime <= twentyFourHoursFromNow && gameTime > now;
  });

  console.log(`   ✅ ${todaysGames.length} games within next 24 hours`);

  // Fetch player props for each game
  console.log('\n📊 Fetching player props...');
  const allProps = [];
  
  for (const game of todaysGames) {
    console.log(`\n   ${game.away_team} @ ${game.home_team}...`);
    
    for (const market of ['player_rebounds', 'player_assists']) {
      const propsUrl = `${BASE_URL}/sports/${SPORT}/events/${game.id}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${market}&bookmakers=${BOOKMAKERS}&oddsFormat=${ODDS_FORMAT}`;
      
      await sleep(1200); // Rate limit
      
      try {
        const propsResponse = await fetch(propsUrl);
        const propsData = await propsResponse.json();
        
        if (!propsResponse.ok) {
          console.log(`      ⚠️  ${market}: API error ${propsResponse.status}`);
          continue;
        }
        
        if (propsData.bookmakers && propsData.bookmakers.length > 0) {
          // Collect all props with multiple books
          const propsByPlayer = new Map();
          
          for (const book of propsData.bookmakers) {
            for (const mkt of book.markets) {
              for (const outcome of mkt.outcomes) {
                const key = `${outcome.description}|${outcome.point}`;
                
                if (!propsByPlayer.has(key)) {
                  propsByPlayer.set(key, {
                    player: outcome.description,
                    line: outcome.point,
                    prop: market.replace('player_', ''),
                    game: `${game.away_team} @ ${game.home_team}`,
                    gameTime: game.commence_time,
                    books: []
                  });
                }
                
                propsByPlayer.get(key).books.push({
                  book: book.title,
                  side: outcome.name,
                  odds: outcome.price
                });
              }
            }
          }
          
          // Convert to array
          for (const prop of propsByPlayer.values()) {
            allProps.push(prop);
          }
          
          console.log(`      ✅ ${market}: ${propsByPlayer.size} unique lines`);
        } else {
          console.log(`      ⚠️  ${market}: no data`);
        }
      } catch (error) {
        console.log(`      ❌ ${market}: ${error.message}`);
      }
    }
  }

  console.log(`\n✅ Collected ${allProps.length} prop lines`);

  // Analyze each prop for value
  console.log('\n🔍 Finding value bets...');
  const picks = [];
  
  for (const prop of allProps) {
    // Find best odds for over and under
    const overBooks = prop.books.filter(b => b.side === 'Over');
    const underBooks = prop.books.filter(b => b.side === 'Under');
    
    if (overBooks.length === 0 || underBooks.length === 0) continue;
    
    // Get best odds
    const bestOver = overBooks.reduce((best, b) => b.odds > best.odds ? b : best);
    const bestUnder = underBooks.reduce((best, b) => b.odds > best.odds ? b : best);
    
    // Calculate market probabilities
    const overProb = americanToProb(bestOver.odds);
    const underProb = americanToProb(bestUnder.odds);
    const totalProb = overProb + underProb;
    const vig = (totalProb - 1) * 100;
    
    // Devig to get fair probabilities
    const fairOverProb = overProb / totalProb;
    const fairUnderProb = underProb / totalProb;
    
    // Simple model: Look for mispriced lines based on odds discrepancies
    // If one side has significantly better odds, that's our signal
    const overValue = bestOver.odds > -110 ? fairOverProb - overProb : 0;
    const underValue = bestUnder.odds > -110 ? fairUnderProb - underProb : 0;
    
    // Also check for line shopping opportunities (multiple books with different prices)
    const overOddsRange = Math.max(...overBooks.map(b => b.odds)) - Math.min(...overBooks.map(b => b.odds));
    const underOddsRange = Math.max(...underBooks.map(b => b.odds)) - Math.min(...underBooks.map(b => b.odds));
    
    // Flag high-value props (low vig + good odds)
    if (vig < 10 && (bestOver.odds >= -105 || bestUnder.odds >= -105)) {
      // This is a sharp line - look for slight edge
      
      if (bestOver.odds >= -105) {
        const edge = ((fairOverProb - overProb) * 100);
        if (edge >= EDGE_THRESHOLD) {
          const kelly = (fairOverProb * (bestOver.odds / 100 + 1) - 1) / (bestOver.odds / 100);
          if (kelly >= MIN_KELLY) {
            picks.push({
              player: prop.player,
              prop: prop.prop,
              line: prop.line,
              pick: 'Over',
              odds: bestOver.odds,
              edge: edge.toFixed(1),
              fairProb: (fairOverProb * 100).toFixed(1),
              kelly: (kelly * 100).toFixed(1),
              units: Math.min(3, Math.max(0.5, kelly * 10)).toFixed(1),
              vig: vig.toFixed(1),
              book: bestOver.book,
              booksAvailable: overBooks.length,
              game: prop.game,
              gameTime: new Date(prop.gameTime).toLocaleString('en-US', { timeZone: 'America/New_York' })
            });
          }
        }
      }
      
      if (bestUnder.odds >= -105) {
        const edge = ((fairUnderProb - underProb) * 100);
        if (edge >= EDGE_THRESHOLD) {
          const kelly = (fairUnderProb * (Math.abs(bestUnder.odds) / 100 + 1) - 1) / (Math.abs(bestUnder.odds) / 100);
          if (kelly >= MIN_KELLY) {
            picks.push({
              player: prop.player,
              prop: prop.prop,
              line: prop.line,
              pick: 'Under',
              odds: bestUnder.odds,
              edge: edge.toFixed(1),
              fairProb: (fairUnderProb * 100).toFixed(1),
              kelly: (kelly * 100).toFixed(1),
              units: Math.min(3, Math.max(0.5, kelly * 10)).toFixed(1),
              vig: vig.toFixed(1),
              book: bestUnder.book,
              booksAvailable: underBooks.length,
              game: prop.game,
              gameTime: new Date(prop.gameTime).toLocaleString('en-US', { timeZone: 'America/New_York' })
            });
          }
        }
      }
    }
  }

  // Sort by edge
  picks.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));

  console.log(`\n🎯 Found ${picks.length} value bets (${EDGE_THRESHOLD}%+ edge)`);

  if (picks.length === 0) {
    console.log('\n⚠️  No picks meet the edge threshold tonight.');
    console.log('   This is normal - we only bet when there\'s clear value.');
    return;
  }

  // Export to CSV
  const csv = [
    'Player,Prop,Line,Pick,Odds,Edge%,FairProb%,Kelly%,Units,Vig%,Book,BooksAvail,Game,Time',
    ...picks.map(p => 
      `${p.player},${p.prop},${p.line},${p.pick},${p.odds},${p.edge},${p.fairProb},${p.kelly},${p.units},${p.vig},${p.book},${p.booksAvailable},"${p.game}",${p.gameTime}`
    )
  ].join('\n');

  const today = new Date().toISOString().split('T')[0];
  const downloadsPath = join(homedir(), 'Downloads', `nba-props-${today}.csv`);
  await writeFile(downloadsPath, csv);

  // Also export JSON
  const jsonOutput = {
    generated: new Date().toISOString(),
    model: 'Simple Market-Based (No Historical Data)',
    thresholds: {
      edge: EDGE_THRESHOLD,
      kelly: MIN_KELLY
    },
    games: todaysGames.length,
    picks,
    summary: {
      totalPicks: picks.length,
      avgEdge: (picks.reduce((sum, p) => sum + parseFloat(p.edge), 0) / picks.length).toFixed(1),
      avgVig: (picks.reduce((sum, p) => sum + parseFloat(p.vig), 0) / picks.length).toFixed(1),
      totalUnits: picks.reduce((sum, p) => sum + parseFloat(p.units), 0).toFixed(1)
    }
  };

  const jsonPath = join(homedir(), 'Downloads', `nba-props-${today}.json`);
  await writeFile(jsonPath, JSON.stringify(jsonOutput, null, 2));

  console.log(`\n✅ CSV exported to: ${downloadsPath}`);
  console.log(`✅ JSON exported to: ${jsonPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Total Picks: ${picks.length}`);
  console.log(`   Avg Edge: ${jsonOutput.summary.avgEdge}%`);
  console.log(`   Avg Vig: ${jsonOutput.summary.avgVig}%`);
  console.log(`   Total Units: ${jsonOutput.summary.totalUnits}U`);
  
  console.log(`\n📊 Top 5 Picks:`);
  picks.slice(0, 5).forEach((p, i) => {
    console.log(`${i+1}. ${p.player} ${p.prop} ${p.pick} ${p.line} @ ${p.odds} (${p.edge}% edge, ${p.units}U)`);
  });
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
