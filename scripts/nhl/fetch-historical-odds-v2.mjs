#!/usr/bin/env node

/**
 * NHL HISTORICAL ODDS FETCHER V2
 * 
 * Properly implements TheOddsAPI historical odds endpoints:
 * 1. GET /v4/historical/sports/icehockey_nhl/events?date=... (get event IDs)
 * 2. GET /v4/historical/sports/icehockey_nhl/events/{eventId}/odds?date=... (get player props)
 * 
 * Key learnings:
 * - Player props available after 2023-05-03T05:30:00Z
 * - Must fetch each game individually (10 credits per game)
 * - Cannot bulk fetch player props like h2h/spreads/totals
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { NHL_TEAM_MAPPING } from './team-mapping.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// API Configuration
const API_KEY = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Historical player props available after this date
const PLAYER_PROPS_START_DATE = new Date('2023-05-03T05:30:00Z');

/**
 * Make HTTP GET request and return parsed JSON
 */
function apiRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Extract usage headers
        const remaining = res.headers['x-requests-remaining'];
        const used = res.headers['x-requests-used'];
        const lastCost = res.headers['x-requests-last'];
        
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve({
              data: parsed,
              credits: { remaining, used, lastCost }
            });
          } catch (err) {
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        } else {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch historical event IDs for a specific date
 * Cost: 1 credit
 */
async function fetchHistoricalEvents(dateISO) {
  const url = `${BASE_URL}/historical/sports/icehockey_nhl/events?` +
    `apiKey=${API_KEY}&` +
    `date=${dateISO}`;
  
  const response = await apiRequest(url);
  return {
    timestamp: response.data.timestamp,
    events: response.data.data || [],
    credits: response.credits
  };
}

/**
 * Fetch historical odds for a specific event
 * Cost: 10 credits per event per market per region (1 market × 1 region = 10)
 */
async function fetchHistoricalEventOdds(eventId, dateISO) {
  const url = `${BASE_URL}/historical/sports/icehockey_nhl/events/${eventId}/odds?` +
    `apiKey=${API_KEY}&` +
    `regions=us&` +
    `markets=player_shots_on_goal&` +
    `date=${dateISO}`;
  
  const response = await apiRequest(url);
  return {
    timestamp: response.data.timestamp,
    event: response.data.data || null,
    credits: response.credits
  };
}

/**
 * Load our historical game data
 */
function loadHistoricalGames() {
  const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data.games || [];
}

/**
 * Load sample if provided
 * Supports two formats:
 * 1. Date-based: { dates: [{date: "2023-10-10", ...}] }
 * 2. Player-based: { games: [{gameDate: "2023-10-10", playerId: ..., ...}] }
 */
function loadSample(filename) {
  if (!filename) return null;
  
  const samplePath = path.join(REPO_ROOT, 'data/nhl', filename);
  if (!fs.existsSync(samplePath)) {
    console.error(`❌ Sample file not found: ${samplePath}`);
    process.exit(1);
  }
  
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  
  // Check format: player-based or date-based
  if (sample.games && Array.isArray(sample.games)) {
    // Player-based format: return the games directly
    return { format: 'player-based', games: sample.games };
  } else if (sample.dates && Array.isArray(sample.dates)) {
    // Date-based format: return dates
    return { format: 'date-based', dates: sample.dates.map(d => d.date) };
  }
  
  return null;
}

/**
 * Filter games to recent dates with player props available
 */
function filterToRecentDates(games, sample = null) {
  console.log('📊 Filtering games...');
  console.log(`   Total games: ${games.length.toLocaleString()}`);
  
  // If sample provides games directly (player-based sampling), use those
  if (sample && sample.format === 'player-based') {
    console.log(`   Using player-based sample: ${sample.games.length.toLocaleString()} games`);
    // Match sample games to full dataset to get complete data
    const sampleSet = new Set(sample.games.map(g => `${g.gameDate}-${g.playerId}`));
    const filtered = games.filter(g => sampleSet.has(`${g.gameDate}-${g.playerId}`));
    console.log(`   Matched: ${filtered.length.toLocaleString()} games`);
    
    // Group by date
    const gamesByDate = {};
    filtered.forEach(g => {
      if (!gamesByDate[g.gameDate]) gamesByDate[g.gameDate] = [];
      gamesByDate[g.gameDate].push(g);
    });
    
    const dates = Object.keys(gamesByDate).sort();
    console.log(`   Unique dates: ${dates.length.toLocaleString()}`);
    console.log(`   Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    
    return { filtered, gamesByDate, dates };
  }
  
  // Otherwise, filter by date range and/or date list
  let filtered = games.filter(g => {
    const gameDate = new Date(g.gameDate);
    return gameDate >= PLAYER_PROPS_START_DATE;
  });
  
  console.log(`   Post-May 2023: ${filtered.length.toLocaleString()} games`);
  
  // Apply date-based sample filter if provided
  if (sample && sample.format === 'date-based' && sample.dates && sample.dates.length > 0) {
    filtered = filtered.filter(g => sample.dates.includes(g.gameDate));
    console.log(`   Sampled dates: ${filtered.length.toLocaleString()} games`);
  }
  
  // Group by date
  const gamesByDate = {};
  filtered.forEach(g => {
    if (!gamesByDate[g.gameDate]) gamesByDate[g.gameDate] = [];
    gamesByDate[g.gameDate].push(g);
  });
  
  const dates = Object.keys(gamesByDate).sort();
  console.log(`   Unique dates: ${dates.length.toLocaleString()}`);
  console.log(`   Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  
  return { filtered, gamesByDate, dates };
}

/**
 * Extract player prop odds from bookmaker data
 */
function extractPlayerOdds(event, playerName) {
  const playerOdds = [];
  
  if (!event || !event.bookmakers) return playerOdds;
  
  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets?.find(m => m.key === 'player_shots_on_goal');
    if (!market || !market.outcomes) continue;
    
    // Find this player's over/under
    const playerOutcomes = market.outcomes.filter(o => 
      o.description && o.description.toLowerCase() === playerName.toLowerCase()
    );
    
    if (playerOutcomes.length >= 2) {
      const over = playerOutcomes.find(o => o.name === 'Over');
      const under = playerOutcomes.find(o => o.name === 'Under');
      
      if (over && under && over.point === under.point) {
        playerOdds.push({
          bookmaker: bookmaker.key,
          line: over.point,
          overPrice: over.price,
          underPrice: under.price,
          lastUpdate: market.last_update
        });
      }
    }
  }
  
  return playerOdds;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       📊 NHL HISTORICAL ODDS FETCHER V2                            ║');
  console.log('║       (Properly Implemented with TheOddsAPI Guidance)              ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check API key
  if (!API_KEY) {
    console.error('❌ API key not found. Set THEODDS_API_KEY environment variable.');
    process.exit(1);
  }
  
  console.log(`🔐 API Key: ${API_KEY.substring(0, 8)}...`);
  console.log('');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const sampleArg = args.find(a => a.startsWith('--sample='));
  const sampleFile = sampleArg ? sampleArg.split('=')[1] : null;
  const outputArg = args.find(a => a.startsWith('--output='));
  const outputPathOverride = outputArg ? outputArg.split('=')[1] : null;
  const summaryArg = args.find(a => a.startsWith('--summary='));
  const summaryPathOverride = summaryArg ? summaryArg.split('=')[1] : null;
  const capArg = args.find(a => a.startsWith('--creditCap='));
  const creditCap = capArg ? parseInt(capArg.split('=')[1]) : null;
  
  // Load data
  console.log('📂 Loading historical game data...');
  const allGames = loadHistoricalGames();
  const sample = sampleFile ? loadSample(sampleFile) : null;
  
  if (sample) {
    console.log(`   Using sample: ${sampleFile}`);
    if (sample.format === 'player-based') {
      console.log(`   Format: Player-based (${sample.games.length} games)`);
    } else {
      console.log(`   Format: Date-based (${sample.dates.length} dates)`);
    }
  }
  
  const { filtered, gamesByDate, dates } = filterToRecentDates(allGames, sample);
  console.log('');
  
  // Calculate expected cost
  const totalGames = filtered.length;
  const totalDates = dates.length;
  const eventsPerDate = totalGames / totalDates;
  const estimatedCost = totalDates * 1 + totalGames * 10; // 1 per date + 10 per game
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 COST ESTIMATE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Total dates:         ${totalDates.toLocaleString()}`);
  console.log(`Total games:         ${totalGames.toLocaleString()}`);
  console.log(`Games per date:      ~${Math.round(eventsPerDate)}`);
  console.log('');
  console.log(`Cost per date:       1 credit (fetch event IDs)`);
  console.log(`Cost per game:       10 credits (fetch player props)`);
  console.log(`Total estimated:     ${estimatedCost.toLocaleString()} credits`);
  console.log('');
  
  if (!execute) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🚀 TO PROCEED:');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Full dataset (all post-May 2023):');
    console.log('  THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs --execute');
    console.log('');
    console.log('With sample file:');
    console.log('  THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs --sample=phase1_sample_dates.json --execute');
    console.log('');
    console.log('Test with 2 dates only:');
    console.log('  THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs --sample=phase1_sample_dates.json --limit=2 --execute');
    console.log('');
    return;
  }
  
  // EXECUTE
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 FETCHING HISTORICAL ODDS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const datesToFetch = limit ? dates.slice(0, limit) : dates;
  console.log(`Processing ${datesToFetch.length} dates...`);
  console.log('');
  
  const results = [];
  let totalCreditsUsed = 0;
  let errors = 0;
  
  for (let i = 0; i < datesToFetch.length; i++) {
    const date = datesToFetch[i];
    const gamesOnDate = gamesByDate[date];
    
    console.log(`[${i + 1}/${datesToFetch.length}] ${date} (${gamesOnDate.length} games)`);
    
    try {
      // Step 1: Fetch event IDs for this date (1 credit)
      const dateISO = `${date}T12:00:00Z`; // Use noon on the date
  const eventsResponse = await fetchHistoricalEvents(dateISO);
      
      console.log(`   → Events API: ${eventsResponse.events.length} events found (${eventsResponse.credits.lastCost} credits)`);
      totalCreditsUsed += parseInt(eventsResponse.credits.lastCost || 1);
      if (creditCap && totalCreditsUsed >= creditCap) {
        console.log(`   ⛔ Credit cap reached (used=${totalCreditsUsed}). Stopping.`);
        break;
      }
      
      // Step 2: Fetch odds for each event (10 credits each)
      for (const event of eventsResponse.events) {
        try {
          // Match games in our dataset to TheOddsAPI events
          // Our data uses abbreviations (SJS), TheOddsAPI uses full names (San Jose Sharks)
          const homeTeam = event.home_team;
          const awayTeam = event.away_team;
          
          // Find all our player-games for this NHL game
          const gameMatches = gamesOnDate.filter(g => {
            const ourTeamFull = NHL_TEAM_MAPPING[g.team];
            const ourOppFull = NHL_TEAM_MAPPING[g.opponent];
            
            return (ourTeamFull === homeTeam || ourTeamFull === awayTeam) &&
                   (ourOppFull === homeTeam || ourOppFull === awayTeam);
          });
          
          // Skip this event if we don't have any player-games for it
          if (gameMatches.length === 0) {
            continue;
          }
          
          // Fetch odds for this event
          const oddsResponse = await fetchHistoricalEventOdds(event.id, dateISO);
          
          // Extract player props for each of our players
          for (const game of gameMatches) {
            const playerOdds = extractPlayerOdds(oddsResponse.event, game.playerName);
            
            results.push({
              date: date,
              gameDate: game.gameDate,
              playerId: game.playerId,
              playerName: game.playerName,
              team: game.team,
              opponent: game.opponent,
              isHome: game.isHome,
              actualShots: game.shots,
              oddsAvailable: playerOdds.length > 0,
              oddsCount: playerOdds.length,
              odds: playerOdds,
              eventId: event.id,
              timestamp: oddsResponse.timestamp
            });
          }
          
          totalCreditsUsed += parseInt(oddsResponse.credits.lastCost || 10);
          if (creditCap && totalCreditsUsed >= creditCap) {
            console.log(`   ⛔ Credit cap reached after event ${event.id} (used=${totalCreditsUsed}). Stopping.`);
            break;
          }
          
          // Rate limiting: 100ms between event requests
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (err) {
          errors++;
          console.log(`   ⚠️  Failed to fetch odds for event ${event.id}: ${err.message}`);
        }
      }
      
  console.log(`   ✓ Completed (${eventsResponse.credits.remaining} credits remaining)`);
      
      // Rate limiting: 1 second between date requests
      if (i < datesToFetch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (err) {
      errors++;
      console.error(`   ❌ Error processing ${date}: ${err.message}`);
    }
    if (creditCap && totalCreditsUsed >= creditCap) break;
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ FETCH COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Dates processed:     ${datesToFetch.length}`);
  console.log(`Player-games found:  ${results.length.toLocaleString()}`);
  console.log(`With odds:           ${results.filter(r => r.oddsAvailable).length.toLocaleString()}`);
  console.log(`Without odds:        ${results.filter(r => !r.oddsAvailable).length.toLocaleString()}`);
  console.log(`Errors:              ${errors}`);
  console.log(`Credits used:        ${totalCreditsUsed.toLocaleString()}`);
  console.log('');
  
  // Save results
  const outputPath = outputPathOverride || path.join(REPO_ROOT, 'data/nhl/historical_odds_data_v2.json');
  const output = {
    fetchedAt: new Date().toISOString(),
    playerPropsStartDate: PLAYER_PROPS_START_DATE.toISOString(),
    totalDates: datesToFetch.length,
    totalGames: results.length,
    gamesWithOdds: results.filter(r => r.oddsAvailable).length,
    creditsUsed: totalCreditsUsed,
    errors: errors,
    data: results
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to: ${outputPath}`);
  console.log('');
  
  // Save summary
  const summaryPath = summaryPathOverride || path.join(REPO_ROOT, 'data/nhl/historical_odds_summary.json');
  const summary = {
    fetchedAt: output.fetchedAt,
    dates: datesToFetch.length,
    games: results.length,
    gamesWithOdds: output.gamesWithOdds,
    creditsUsed: totalCreditsUsed,
    errors: errors,
    oddsAvailabilityRate: (output.gamesWithOdds / results.length * 100).toFixed(1) + '%',
    sampleGames: results.slice(0, 10)
  };
  
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📋 Summary saved to: ${summaryPath}`);
  console.log('');
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
