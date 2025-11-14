#!/usr/bin/env node

/**
 * NHL 2025-26 SEASON DATA COLLECTOR
 * 
 * Fetches box scores for all games in the 2025-26 season to date.
 * Collects: SOG, TOI, goals, assists, +/-, PIM, etc. for all players.
 * 
 * Data sources:
 * - Schedule: https://api-web.nhle.com/v1/schedule/{date}
 * - Box scores: https://api-web.nhle.com/v1/gamecenter/{gameId}/boxscore
 * 
 * Output format matches historical_game_data.json structure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

// 2025-26 season dates
const SEASON_START = '2025-10-08'; // First game of 2025-26 season
const TODAY = new Date().toISOString().split('T')[0];

/**
 * Make HTTPS GET request
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Generate array of dates between start and end
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Fetch games for a specific date
 */
async function fetchGamesForDate(date) {
  const url = `${NHL_API_BASE}/score/${date}`;
  
  try {
    const data = await fetchUrl(url);
    return data.games || [];
  } catch (err) {
    console.log(`   ⚠️  Error fetching schedule for ${date}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch box score for a specific game
 */
async function fetchBoxScore(gameId) {
  const url = `${NHL_API_BASE}/gamecenter/${gameId}/boxscore`;
  
  try {
    const data = await fetchUrl(url);
    return data;
  } catch (err) {
    throw new Error(`Failed to fetch box score: ${err.message}`);
  }
}

/**
 * Extract player game data from box score
 */
function extractPlayerData(boxScore, gameDate, gameId) {
  const playerGames = [];
  
  const homeTeam = boxScore.homeTeam?.abbrev;
  const awayTeam = boxScore.awayTeam?.abbrev;
  
  if (!homeTeam || !awayTeam) {
    console.log(`   ⚠️  Missing team info for game ${gameId}`);
    return playerGames;
  }
  
  // Process each team
  const teams = [
    { team: awayTeam, opponent: homeTeam, isHome: false, data: boxScore.playerByGameStats?.awayTeam },
    { team: homeTeam, opponent: awayTeam, isHome: true, data: boxScore.playerByGameStats?.homeTeam }
  ];
  
  for (const { team, opponent, isHome, data } of teams) {
    if (!data) continue;
    
    // Process forwards and defense (skip goalies for SOG model)
    const players = [
      ...(data.forwards || []),
      ...(data.defense || [])
    ];
    
    for (const player of players) {
      // Extract time on ice
      let toi = 0;
      if (player.toi) {
        const [mins, secs] = player.toi.split(':').map(Number);
        toi = mins + (secs / 60);
      }
      
      playerGames.push({
        gameId: gameId,
        gameDate: gameDate,
        playerId: player.playerId,
        playerName: player.name?.default || 'Unknown',
        team: team,
        opponent: opponent,
        isHome: isHome,
        shots: player.sog || 0,
        goals: player.goals || 0,
        assists: player.assists || 0,
        points: player.points || 0,
        plusMinus: player.plusMinus || 0,
        pim: player.pim || 0,
        toi: toi,
        powerPlayGoals: player.powerPlayGoals || 0,
        powerPlayPoints: player.powerPlayPoints || 0,
        shorthanded: player.shorthandedGoals || 0,
        gameWinningGoals: player.gameWinningGoals || 0,
        shifts: player.shifts || 0,
        blocked: player.blockedShots || 0,
        hits: player.hits || 0,
        faceoffWinPct: player.faceoffWinningPctg || 0
      });
    }
  }
  
  return playerGames;
}

/**
 * Calculate rolling stats for a player
 */
function calculateRollingStats(allPlayerGames, currentGameDate) {
  // Group by player
  const byPlayer = {};
  
  for (const game of allPlayerGames) {
    const playerId = game.playerId;
    if (!byPlayer[playerId]) {
      byPlayer[playerId] = {
        playerName: game.playerName,
        games: []
      };
    }
    byPlayer[playerId].games.push(game);
  }
  
  // Calculate L10 stats for each player
  for (const playerId in byPlayer) {
    const playerData = byPlayer[playerId];
    
    // Sort games by date
    playerData.games.sort((a, b) => a.gameDate.localeCompare(b.gameDate));
    
    // For each game, calculate L10 stats based on PREVIOUS games
    for (let i = 0; i < playerData.games.length; i++) {
      const game = playerData.games[i];
      
      // Get previous 10 games
      const previousGames = playerData.games.slice(Math.max(0, i - 10), i);
      
      if (previousGames.length > 0) {
        const sum = (arr, key) => arr.reduce((s, g) => s + (g[key] || 0), 0);
        const avg = (arr, key) => sum(arr, key) / arr.length;
        
        game.L10_games = previousGames.length;
        game.L10_avg_sog = avg(previousGames, 'shots');
        game.L10_toi = avg(previousGames, 'toi');
        game.L10_goals = avg(previousGames, 'goals');
        game.L10_points = avg(previousGames, 'points');
        game.L10_ppg = avg(previousGames, 'powerPlayGoals');
        game.L10_shots_total = sum(previousGames, 'shots');
        
        // Last game stats
        if (previousGames.length >= 1) {
          const lastGame = previousGames[previousGames.length - 1];
          game.lastGameShots = lastGame.shots;
          game.lastGameTOI = lastGame.toi;
        }
      }
    }
  }
  
  return allPlayerGames;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       🏒 NHL 2025-26 SEASON DATA COLLECTOR                        ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const startDateArg = args.find(a => a.startsWith('--start='));
  const endDateArg = args.find(a => a.startsWith('--end='));
  const limitArg = args.find(a => a.startsWith('--limit='));
  
  const startDate = startDateArg ? startDateArg.split('=')[1] : SEASON_START;
  const endDate = endDateArg ? endDateArg.split('=')[1] : TODAY;
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  
  console.log('📅 Collection Parameters');
  console.log('═'.repeat(60));
  console.log(`Start date: ${startDate}`);
  console.log(`End date:   ${endDate}`);
  console.log(`Limit:      ${limit || 'None (collect all)'}`);
  console.log('');
  
  // Generate date range
  const dates = generateDateRange(startDate, endDate);
  const datesToProcess = limit ? dates.slice(0, limit) : dates;
  
  console.log('═'.repeat(60));
  console.log('🚀 STARTING COLLECTION');
  console.log('═'.repeat(60));
  console.log(`Processing ${datesToProcess.length} dates...`);
  console.log('');
  
  const allPlayerGames = [];
  let totalGames = 0;
  let errors = 0;
  
  for (let i = 0; i < datesToProcess.length; i++) {
    const date = datesToProcess[i];
    
    console.log(`[${i + 1}/${datesToProcess.length}] ${date}`);
    
    try {
      // Get games for this date
      const games = await fetchGamesForDate(date);
      
      if (games.length === 0) {
        console.log(`   → No games`);
        continue;
      }
      
      console.log(`   → ${games.length} games found`);
      totalGames += games.length;
      
      // Fetch box score for each game
      for (const game of games) {
        const gameId = game.id;
        const homeTeam = game.homeTeam?.abbrev;
        const awayTeam = game.awayTeam?.abbrev;
        
        try {
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const boxScore = await fetchBoxScore(gameId);
          const playerData = extractPlayerData(boxScore, date, gameId);
          
          allPlayerGames.push(...playerData);
          
          console.log(`      ✓ ${awayTeam} @ ${homeTeam}: ${playerData.length} player-games`);
          
        } catch (err) {
          errors++;
          console.log(`      ❌ ${awayTeam} @ ${homeTeam}: ${err.message}`);
        }
      }
      
      // Rate limit between dates
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err) {
      errors++;
      console.error(`   ❌ Error: ${err.message}`);
    }
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 CALCULATING ROLLING STATS');
  console.log('═'.repeat(60));
  console.log('');
  
  // Calculate L10 and other rolling stats
  const enrichedGames = calculateRollingStats(allPlayerGames, endDate);
  
  console.log(`✓ Calculated rolling stats for ${enrichedGames.length} player-games`);
  console.log('');
  
  console.log('═'.repeat(60));
  console.log('✅ COLLECTION COMPLETE');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`Dates processed:     ${datesToProcess.length}`);
  console.log(`NHL games found:     ${totalGames}`);
  console.log(`Player-games:        ${enrichedGames.length}`);
  console.log(`Errors:              ${errors}`);
  console.log('');
  
  // Save to file
  const outputPath = path.join(REPO_ROOT, 'data/nhl/season_2025-26_games.json');
  const output = {
    collectedAt: new Date().toISOString(),
    season: '2025-26',
    dateRange: {
      start: startDate,
      end: endDate
    },
    totalDates: datesToProcess.length,
    totalGames: totalGames,
    totalPlayerGames: enrichedGames.length,
    errors: errors,
    games: enrichedGames
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to: ${outputPath}`);
  console.log('');
  
  // Summary stats
  console.log('═'.repeat(60));
  console.log('📈 SUMMARY STATISTICS');
  console.log('═'.repeat(60));
  console.log('');
  
  const withL10 = enrichedGames.filter(g => g.L10_games > 0);
  console.log(`Games with L10 stats: ${withL10.length} (${(withL10.length/enrichedGames.length*100).toFixed(1)}%)`);
  
  if (enrichedGames.length > 0) {
    const avgSOG = enrichedGames.reduce((s, g) => s + g.shots, 0) / enrichedGames.length;
    const avgTOI = enrichedGames.reduce((s, g) => s + g.toi, 0) / enrichedGames.length;
    
    console.log(`Avg SOG per player:   ${avgSOG.toFixed(2)}`);
    console.log(`Avg TOI per player:   ${avgTOI.toFixed(2)} mins`);
    console.log('');
    
    console.log('Sample game:');
    const sample = enrichedGames[0];
    console.log(`  Date: ${sample.gameDate}`);
    console.log(`  Player: ${sample.playerName} (${sample.team})`);
    console.log(`  Opponent: ${sample.opponent} ${sample.isHome ? '(Home)' : '(Away)'}`);
    console.log(`  SOG: ${sample.shots} | TOI: ${sample.toi.toFixed(1)} mins`);
    if (sample.L10_avg_sog) {
      console.log(`  L10 Avg SOG: ${sample.L10_avg_sog.toFixed(2)}`);
    }
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('🎯 NEXT STEPS');
  console.log('═'.repeat(60));
  console.log('');
  console.log('1. Merge with historical data (optional):');
  console.log('   node scripts/nhl/merge-season-data.mjs');
  console.log('');
  console.log('2. Generate model predictions:');
  console.log('   node scripts/nhl/generate-zinb-test-predictions.mjs --season=2025-26');
  console.log('');
  console.log('3. Run model comparison:');
  console.log('   node scripts/nhl/model-comparison-test.mjs');
  console.log('');
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
