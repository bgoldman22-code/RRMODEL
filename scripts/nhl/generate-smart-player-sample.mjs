#!/usr/bin/env node

/**
 * SMART PLAYER SAMPLING FOR HISTORICAL ODDS
 * 
 * Instead of fetching ALL games on a few dates (expensive, clustered),
 * we sample PLAYERS across MANY dates (cheaper, more representative).
 * 
 * Strategy:
 * - Sample ~20-30 players who played frequently post-May 2023
 * - Get 20-30 games per player across different dates
 * - Total: 600-900 player-games across 100+ unique dates
 * - Cost: ~6,000-9,000 credits (6-10% of budget)
 * 
 * Benefits:
 * - Tests temporal patterns (does model improve with more data?)
 * - Diverse market conditions (different dates, opponents, situations)
 * - Better statistical validity (not clustered in time)
 * - Tests walk-forward concept properly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// Budget configuration
const CREDITS_AVAILABLE = 14060; // 15% of 93,730
const TARGET_GAMES = 700; // Conservative target (leaves buffer)
const PLAYERS_TO_SAMPLE = 25;
const GAMES_PER_PLAYER = Math.floor(TARGET_GAMES / PLAYERS_TO_SAMPLE); // ~28 games each

// Player props available after this date
const PLAYER_PROPS_START_DATE = new Date('2023-05-03T05:30:00Z');

/**
 * Load historical game data
 */
function loadHistoricalGames() {
  const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data.games || [];
}

/**
 * Filter to post-May 2023 games with player props
 */
function filterToRecentGames(games) {
  return games.filter(g => {
    const gameDate = new Date(g.gameDate);
    return gameDate >= PLAYER_PROPS_START_DATE;
  });
}

/**
 * Group games by player and calculate stats
 */
function groupByPlayer(games) {
  const playerGames = {};
  
  for (const game of games) {
    if (!playerGames[game.playerId]) {
      playerGames[game.playerId] = {
        playerId: game.playerId,
        playerName: game.playerName,
        games: [],
        totalGames: 0,
        avgShots: 0,
        dates: new Set()
      };
    }
    
    playerGames[game.playerId].games.push(game);
    playerGames[game.playerId].totalGames++;
    playerGames[game.playerId].dates.add(game.gameDate);
  }
  
  // Calculate averages
  for (const player of Object.values(playerGames)) {
    player.avgShots = player.games.reduce((sum, g) => sum + g.shots, 0) / player.totalGames;
    player.uniqueDates = player.dates.size;
    delete player.dates; // Don't need the Set anymore
  }
  
  return playerGames;
}

/**
 * Select diverse set of high-volume players
 * - Mix of positions
 * - Mix of teams
 * - High game count (reliable odds availability)
 * - Good shot volume (more interesting to predict)
 */
function selectPlayers(playerGames, count) {
  const players = Object.values(playerGames);
  
  // Filter to players with sufficient games
  const eligible = players.filter(p => 
    p.totalGames >= GAMES_PER_PLAYER * 1.5 && // Need 1.5x buffer
    p.avgShots >= 1.5 // Reasonable shot volume
  );
  
  console.log(`   Eligible players: ${eligible.length}`);
  
  // Sort by total games (most active players = best odds availability)
  eligible.sort((a, b) => b.totalGames - a.totalGames);
  
  // Take top players by game count
  const selected = eligible.slice(0, count);
  
  return selected;
}

/**
 * Sample games for each player
 * - Stratified across time (early season, mid, late)
 * - Mix of home/away
 * - Different opponents
 */
function samplePlayerGames(player, targetGames) {
  const games = player.games.sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  
  // Stratify by time period
  const gamesPerPeriod = Math.floor(targetGames / 3);
  const third = Math.floor(games.length / 3);
  
  const early = games.slice(0, third);
  const mid = games.slice(third, third * 2);
  const late = games.slice(third * 2);
  
  // Random sample from each period
  const sample = [
    ...randomSample(early, gamesPerPeriod),
    ...randomSample(mid, gamesPerPeriod),
    ...randomSample(late, targetGames - gamesPerPeriod * 2) // Get remainder from late
  ];
  
  return sample;
}

/**
 * Random sample from array
 */
function randomSample(array, count) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Main execution
 */
function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       🎯 SMART PLAYER SAMPLING FOR HISTORICAL ODDS                 ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  console.log('📊 Budget & Strategy:');
  console.log(`   Available credits: ${CREDITS_AVAILABLE.toLocaleString()}`);
  console.log(`   Target games: ${TARGET_GAMES}`);
  console.log(`   Players to sample: ${PLAYERS_TO_SAMPLE}`);
  console.log(`   Games per player: ${GAMES_PER_PLAYER}`);
  console.log('');
  
  console.log('📂 Loading historical game data...');
  const allGames = loadHistoricalGames();
  console.log(`   Total games: ${allGames.length.toLocaleString()}`);
  
  const recentGames = filterToRecentGames(allGames);
  console.log(`   Post-May 2023: ${recentGames.length.toLocaleString()}`);
  console.log('');
  
  console.log('👥 Analyzing players...');
  const playerGames = groupByPlayer(recentGames);
  console.log(`   Unique players: ${Object.keys(playerGames).length.toLocaleString()}`);
  
  const selectedPlayers = selectPlayers(playerGames, PLAYERS_TO_SAMPLE);
  console.log(`   Selected: ${selectedPlayers.length} high-volume players`);
  console.log('');
  
  console.log('🎲 Sampling games from each player...');
  const allSampledGames = [];
  const gamesByDate = {};
  const playerSummaries = [];
  
  for (const player of selectedPlayers) {
    const sampledGames = samplePlayerGames(player, GAMES_PER_PLAYER);
    allSampledGames.push(...sampledGames);
    
    // Track unique dates
    for (const game of sampledGames) {
      if (!gamesByDate[game.gameDate]) {
        gamesByDate[game.gameDate] = [];
      }
      gamesByDate[game.gameDate].push(game);
    }
    
    playerSummaries.push({
      playerId: player.playerId,
      playerName: player.playerName,
      gamesInDataset: player.totalGames,
      gamesSampled: sampledGames.length,
      avgShots: player.avgShots.toFixed(2),
      dateRange: {
        first: sampledGames[0].gameDate,
        last: sampledGames[sampledGames.length - 1].gameDate
      }
    });
    
    console.log(`   ${player.playerName.padEnd(25)} ${sampledGames.length} games (${player.avgShots.toFixed(1)} shots/game)`);
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 SAMPLE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const uniqueDates = Object.keys(gamesByDate).sort();
  const totalGames = allSampledGames.length;
  const estimatedCost = totalGames * 10; // 10 credits per game
  
  console.log(`Total games sampled:     ${totalGames.toLocaleString()}`);
  console.log(`Unique dates:            ${uniqueDates.length}`);
  console.log(`Date range:              ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);
  console.log(`Avg games per date:      ${(totalGames / uniqueDates.length).toFixed(1)}`);
  console.log('');
  console.log(`Estimated cost:          ${estimatedCost.toLocaleString()} credits`);
  console.log(`Percent of budget:       ${(estimatedCost / CREDITS_AVAILABLE * 100).toFixed(1)}%`);
  console.log(`Credits remaining:       ${(CREDITS_AVAILABLE - estimatedCost).toLocaleString()}`);
  console.log('');
  
  // Save sample
  const output = {
    strategy: "smart_player_sampling",
    generatedAt: new Date().toISOString(),
    budget: {
      available: CREDITS_AVAILABLE,
      targetGames: TARGET_GAMES,
      estimatedCost: estimatedCost,
      percentUsed: (estimatedCost / CREDITS_AVAILABLE * 100).toFixed(1) + "%"
    },
    sampling: {
      playersSelected: PLAYERS_TO_SAMPLE,
      gamesPerPlayer: GAMES_PER_PLAYER,
      totalGames: totalGames,
      uniqueDates: uniqueDates.length,
      avgGamesPerDate: (totalGames / uniqueDates.length).toFixed(1)
    },
    players: playerSummaries,
    dates: uniqueDates.map(date => ({
      date: date,
      games: gamesByDate[date].length
    })),
    games: allSampledGames.map(g => ({
      gameDate: g.gameDate,
      playerId: g.playerId,
      playerName: g.playerName,
      team: g.team,
      opponent: g.opponent,
      isHome: g.isHome,
      actualShots: g.shots
    }))
  };
  
  const outputPath = path.join(REPO_ROOT, 'data/nhl/smart_player_sample.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`💾 Saved to: ${outputPath}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('1. Review the sample:');
  console.log('   cat data/nhl/smart_player_sample.json | jq \'.sampling\'');
  console.log('');
  console.log('2. Test with 2 dates first (validate pipeline):');
  console.log('   THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs --sample=smart_player_sample.json --limit=2 --execute');
  console.log('');
  console.log('3. Run full sample:');
  console.log('   THEODDS_API_KEY=your_key node scripts/nhl/fetch-historical-odds-v2.mjs --sample=smart_player_sample.json --execute');
  console.log('');
}

main();
