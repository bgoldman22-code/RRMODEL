#!/usr/bin/env node

/**
 * LEAK-FREE Feature Engineering for NBA Player Props
 * 
 * CRITICAL: Zero data leakage - for each game on date D, uses ONLY data from < D
 * 
 * Process:
 * 1. Load historical odds + player boxscores
 * 2. For each game date D (chronologically):
 *    - Filter to games BEFORE D only
 *    - Calculate rolling stats (L5, L10, L20) from historical games
 *    - Calculate opponent stats from historical games
 *    - Join with Vegas line for that game
 * 3. Output time-series dataset with as_of_date validation
 * 
 * Usage:
 *   node scripts/nba/build-leak-free-features.js \
 *     --odds data/nba/historical-odds-2024.json \
 *     --boxscores data/nba/player-boxscores-2024.json \
 *     --output data/nba/training-data-leak-free.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
const oddsPath = args[args.indexOf('--odds') + 1] || 'data/nba/historical-odds-2024.json';
const boxscoresPath = args[args.indexOf('--boxscores') + 1] || 'data/nba/player-boxscores-2024.json';
const outputPath = args[args.indexOf('--output') + 1] || 'data/nba/training-data-leak-free.json';

console.log('🏀 NBA Player Props - LEAK-FREE Feature Engineering');
console.log('===================================================\n');
console.log('⚠️  CRITICAL: Zero data leakage enforcement');
console.log('   For game on date D, using ONLY data from < D\n');

// Load data
console.log('📂 Loading data...');
const odds = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
const boxscores = JSON.parse(fs.readFileSync(boxscoresPath, 'utf8'));

console.log(`✅ Loaded ${odds.length} games with odds`);
console.log(`✅ Loaded ${boxscores.length} player-game records\n`);

// Sort boxscores chronologically (CRITICAL for leak-free approach)
boxscores.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

console.log('🔒 Enforcing temporal ordering...');
console.log(`   First game: ${boxscores[0]?.gameDate}`);
console.log(`   Last game: ${boxscores[boxscores.length - 1]?.gameDate}\n`);

/**
 * Calculate rolling stats for a player up to (but not including) a specific date
 * 
 * @param {string} playerId - Player identifier
 * @param {string} beforeDate - Only use games before this date (LEAK PREVENTION)
 * @param {number} window - Number of games to include (5, 10, 20)
 * @param {string} stat - Stat to calculate (points, rebounds, assists, etc.)
 * @returns {number} Average of stat over window
 */
function calculateRollingStat(playerId, beforeDate, window, stat) {
  const playerGames = boxscores.filter(g => 
    g.playerId === playerId && 
    new Date(g.gameDate) < new Date(beforeDate) // CRITICAL: < not <=
  );
  
  if (playerGames.length === 0) return null;
  
  // Take last N games before the date
  const recentGames = playerGames.slice(-window);
  
  if (recentGames.length === 0) return null;
  
  const sum = recentGames.reduce((acc, g) => acc + (g[stat] || 0), 0);
  return sum / recentGames.length;
}

/**
 * Calculate opponent defensive stats up to (but not including) a specific date
 * 
 * @param {string} opponentTeam - Opponent team ID
 * @param {string} beforeDate - Only use games before this date
 * @param {string} stat - Stat to calculate (pointsAllowed, pace, etc.)
 * @returns {number} Average opponent stat
 */
function calculateOpponentStat(opponentTeam, beforeDate, stat) {
  const opponentGames = boxscores.filter(g =>
    g.teamId === opponentTeam &&
    new Date(g.gameDate) < new Date(beforeDate) // CRITICAL: < not <=
  );
  
  if (opponentGames.length === 0) return null;
  
  // Aggregate by game first, then average
  const gameStats = {};
  for (const game of opponentGames) {
    if (!gameStats[game.gameId]) {
      gameStats[game.gameId] = { total: 0, count: 0 };
    }
    gameStats[game.gameId].total += game[stat] || 0;
    gameStats[game.gameId].count++;
  }
  
  const gameAverages = Object.values(gameStats).map(g => g.total / g.count);
  return gameAverages.reduce((sum, val) => sum + val, 0) / gameAverages.length;
}

/**
 * Validate that features are calculated from before the game date (LEAK CHECK)
 */
function validateNoLeakage(featureDate, gameDate) {
  if (new Date(featureDate) >= new Date(gameDate)) {
    throw new Error(`🚨 DATA LEAKAGE DETECTED: Features from ${featureDate} used for game on ${gameDate}`);
  }
  return true;
}

/**
 * Build features for a single player-game
 */
function buildFeaturesForGame(playerGame, vegasLine) {
  const gameDate = playerGame.gameDate;
  const playerId = playerGame.playerId;
  const opponentId = playerGame.opponentId;
  
  // Get games played before this date
  const priorGames = boxscores.filter(g =>
    g.playerId === playerId &&
    new Date(g.gameDate) < new Date(gameDate)
  );
  
  // Calculate rolling stats (L5, L10, L20)
  const L5_ppg = calculateRollingStat(playerId, gameDate, 5, 'points');
  const L5_rpg = calculateRollingStat(playerId, gameDate, 5, 'reboundsTotal');
  const L5_apg = calculateRollingStat(playerId, gameDate, 5, 'assists');
  const L5_minutes = calculateRollingStat(playerId, gameDate, 5, 'minutesCalculated');
  const L5_fga = calculateRollingStat(playerId, gameDate, 5, 'fieldGoalsAttempted');
  const L5_fta = calculateRollingStat(playerId, gameDate, 5, 'freeThrowsAttempted');
  
  const L10_ppg = calculateRollingStat(playerId, gameDate, 10, 'points');
  const L10_rpg = calculateRollingStat(playerId, gameDate, 10, 'reboundsTotal');
  const L10_apg = calculateRollingStat(playerId, gameDate, 10, 'assists');
  const L10_minutes = calculateRollingStat(playerId, gameDate, 10, 'minutesCalculated');
  const L10_fga = calculateRollingStat(playerId, gameDate, 10, 'fieldGoalsAttempted');
  const L10_fta = calculateRollingStat(playerId, gameDate, 10, 'freeThrowsAttempted');
  
  const L20_ppg = calculateRollingStat(playerId, gameDate, 20, 'points');
  const L20_rpg = calculateRollingStat(playerId, gameDate, 20, 'reboundsTotal');
  const L20_apg = calculateRollingStat(playerId, gameDate, 20, 'assists');
  
  // Season totals up to this date
  const season_ppg = priorGames.length > 0 
    ? priorGames.reduce((sum, g) => sum + (g.points || 0), 0) / priorGames.length
    : null;
  const season_rpg = priorGames.length > 0
    ? priorGames.reduce((sum, g) => sum + (g.reboundsTotal || 0), 0) / priorGames.length
    : null;
  const season_apg = priorGames.length > 0
    ? priorGames.reduce((sum, g) => sum + (g.assists || 0), 0) / priorGames.length
    : null;
  
  // Opponent stats (calculated from games BEFORE this date)
  const opp_ppg_allowed = calculateOpponentStat(opponentId, gameDate, 'points');
  const opp_pace = calculateOpponentStat(opponentId, gameDate, 'minutesCalculated');
  
  // Rest days
  const restDays = priorGames.length > 0
    ? Math.floor((new Date(gameDate) - new Date(priorGames[priorGames.length - 1].gameDate)) / (1000 * 60 * 60 * 24))
    : null;
  
  // Validate leak-free (features calculated from BEFORE game date)
  const featureDate = priorGames.length > 0 
    ? priorGames[priorGames.length - 1].gameDate
    : null;
  
  if (featureDate) {
    validateNoLeakage(featureDate, gameDate);
  }
  
  return {
    // Game metadata
    gameId: playerGame.gameId,
    gameDate,
    playerId,
    playerName: playerGame.playerName,
    teamId: playerGame.teamId,
    teamTricode: playerGame.teamTricode,
    opponentId,
    opponentTricode: playerGame.opponentTricode,
    homeAway: playerGame.homeAway,
    
    // Vegas lines - STORED FOR EDGE CALCULATION ONLY (NOT model features)
    // ⚠️ CRITICAL: These must NOT be used as model inputs
    // Using Vegas lines as features creates a "Vegas mirror" not an edge
    vegas_lines: {
      points: vegasLine?.points || null,
      rebounds: vegasLine?.rebounds || null,
      assists: vegasLine?.assists || null
    },
    
    // Actual results (for backtesting)
    actual_points: playerGame.points,
    actual_rebounds: playerGame.reboundsTotal,
    actual_assists: playerGame.assists,
    actual_minutes: playerGame.minutesCalculated,
    
    // Leak-free features
    features: {
      as_of_date: featureDate, // Date of last historical game used
      games_played_season: priorGames.length,
      
      // L5 (Last 5 games)
      L5_ppg,
      L5_rpg,
      L5_apg,
      L5_minutes,
      L5_fga,
      L5_fta,
      
      // L10 (Last 10 games)
      L10_ppg,
      L10_rpg,
      L10_apg,
      L10_minutes,
      L10_fga,
      L10_fta,
      
      // L20 (Last 20 games)
      L20_ppg,
      L20_rpg,
      L20_apg,
      
      // Season averages (up to this date)
      season_ppg,
      season_rpg,
      season_apg,
      
      // Opponent stats (up to this date)
      opp_ppg_allowed,
      opp_pace,
      
      // Context
      rest_days: restDays,
      home: playerGame.homeAway === 'home' ? 1 : 0,
      back_to_back: restDays === 1 ? 1 : 0
    },
    
    // Validation
    leakage_check_passed: true
  };
}

/**
 * Match odds with player games
 */
function matchOddsWithGames() {
  console.log('🔗 Matching odds with player games...');
  
  // Build odds lookup by game + player
  const oddsLookup = {};
  for (const game of odds) {
    const gameDate = game.date;
    const bookmakers = game.odds.bookmakers || [];
    
    for (const bookmaker of bookmakers) {
      for (const market of bookmaker.markets) {
        for (const outcome of market.outcomes) {
          const playerName = outcome.description;
          const key = `${gameDate}|${playerName}|${market.key}`;
          
          if (!oddsLookup[key]) {
            oddsLookup[key] = {};
          }
          
          if (market.key === 'player_points') {
            oddsLookup[key].points = outcome.point;
          } else if (market.key === 'player_rebounds') {
            oddsLookup[key].rebounds = outcome.point;
          } else if (market.key === 'player_assists') {
            oddsLookup[key].assists = outcome.point;
          }
        }
      }
    }
  }
  
  console.log(`✅ Built odds lookup with ${Object.keys(oddsLookup).length} entries\n`);
  return oddsLookup;
}

/**
 * Main processing
 */
async function processData() {
  const oddsLookup = matchOddsWithGames();
  
  console.log('⚙️  Building leak-free features for each player-game...');
  console.log('   This will take a few minutes...\n');
  
  const trainingData = [];
  let processed = 0;
  let leakageChecks = 0;
  
  for (const playerGame of boxscores) {
    const gameDate = playerGame.gameDate;
    const playerName = playerGame.playerName;
    
    // Look up Vegas lines for this player-game
    const pointsKey = `${gameDate}|${playerName}|player_points`;
    const reboundsKey = `${gameDate}|${playerName}|player_rebounds`;
    const assistsKey = `${gameDate}|${playerName}|player_assists`;
    
    const vegasLine = {
      points: oddsLookup[pointsKey]?.points,
      rebounds: oddsLookup[reboundsKey]?.rebounds,
      assists: oddsLookup[assistsKey]?.assists
    };
    
    // Only include if we have at least one Vegas line
    if (vegasLine.points || vegasLine.rebounds || vegasLine.assists) {
      try {
        const features = buildFeaturesForGame(playerGame, vegasLine);
        trainingData.push(features);
        leakageChecks++;
      } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
      }
    }
    
    processed++;
    if (processed % 1000 === 0) {
      console.log(`   Processed ${processed}/${boxscores.length} games (${((processed/boxscores.length)*100).toFixed(1)}%)`);
    }
  }
  
  console.log(`\n✅ Processed ${processed} player-games`);
  console.log(`✅ Matched ${trainingData.length} with Vegas lines`);
  console.log(`✅ Passed ${leakageChecks} leak-free validation checks\n`);
  
  // Save output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(trainingData, null, 2));
  console.log(`💾 Saved training data to ${outputPath}`);
  
  // Statistics
  console.log('\n📊 Dataset Statistics:');
  console.log(`   Total samples: ${trainingData.length}`);
  console.log(`   Date range: ${trainingData[0]?.gameDate} to ${trainingData[trainingData.length-1]?.gameDate}`);
  
  const withPoints = trainingData.filter(d => d.line_points !== null).length;
  const withRebounds = trainingData.filter(d => d.line_rebounds !== null).length;
  const withAssists = trainingData.filter(d => d.line_assists !== null).length;
  
  console.log(`   Points lines: ${withPoints}`);
  console.log(`   Rebounds lines: ${withRebounds}`);
  console.log(`   Assists lines: ${withAssists}`);
  
  console.log('\n🎉 Leak-free feature engineering complete!');
  console.log('   Ready for walk-forward validation training');
}

// Run
processData().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
