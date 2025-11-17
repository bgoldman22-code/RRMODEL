#!/usr/bin/env node

/**
 * Validate EPA Scaling Factor
 * 
 * This script:
 * 1. Analyzes stats_team_week to compute actual baseGamePlays distribution
 * 2. Compares to training data total plays
 * 3. Derives precise SCALE_GAME_PLAYS constant
 * 4. Validates feature distributions
 */

import fs from 'fs/promises';
import https from 'https';

const TRAINING_FILE = './nfl-model-v3/data/nflverse/game_aggregates_2025.json';
const STATS_TEAM_URL = 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv';

// Fetch CSV data
async function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
  });
}

// Parse CSV to objects
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i]?.trim() || '';
    });
    return obj;
  });
}

async function main() {
  console.log('🏈 NFL V5 EPA Scaling Factor Validation\n');
  console.log('='.repeat(70));
  
  // 1. Load training data
  console.log('\n📚 Loading training data...');
  const trainingData = JSON.parse(await fs.readFile(TRAINING_FILE, 'utf-8'));
  const historical2025 = trainingData.filter(g => 
    g.season === '2025' && parseInt(g.week) <= 11
  );
  
  const trainingPlaysMean = historical2025.reduce((sum, g) => sum + g.plays, 0) / historical2025.length;
  const trainingEpaSumMean = historical2025.reduce((sum, g) => 
    sum + (g.home_epa_per_play + g.away_epa_per_play), 0
  ) / historical2025.length;
  
  console.log(`  Games: ${historical2025.length}`);
  console.log(`  Mean Total Plays: ${trainingPlaysMean.toFixed(2)}`);
  console.log(`  Mean EPA Sum: ${trainingEpaSumMean.toFixed(4)}`);
  
  // 2. Fetch and analyze stats_team data
  console.log('\n📊 Fetching stats_team_week_2025.csv...');
  const csvData = await fetchCSV(STATS_TEAM_URL);
  const statsTeam = parseCSV(csvData);
  
  console.log(`  Total rows: ${statsTeam.length}`);
  
  // Filter to 2025 regular season, weeks 1-11
  const stats2025 = statsTeam.filter(s => 
    s.season === '2025' && 
    parseInt(s.week) <= 11 && 
    s.season_type === 'REG'
  );
  
  console.log(`  2025 Weeks 1-11: ${stats2025.length} team-weeks`);
  
  // 3. Group by game and compute baseGamePlays
  console.log('\n🔢 Computing baseGamePlays per game...');
  
  const gameMap = new Map();
  
  for (const s of stats2025) {
    const gameKey = `${s.week}_${s.team}_${s.opponent_team}`;
    const reverseKey = `${s.week}_${s.opponent_team}_${s.team}`;
    
    // Skip if we already processed this game from the other team's perspective
    if (gameMap.has(reverseKey)) continue;
    
    const offensivePlays = Number(s.attempts || 0) + Number(s.carries || 0);
    
    // Find opponent's data
    const opponent = stats2025.find(o => 
      o.week === s.week && 
      o.team === s.opponent_team && 
      o.opponent_team === s.team
    );
    
    if (opponent) {
      const opponentOffensivePlays = Number(opponent.attempts || 0) + Number(opponent.carries || 0);
      const baseGamePlays = offensivePlays + opponentOffensivePlays;
      
      gameMap.set(gameKey, {
        week: s.week,
        team1: s.team,
        team2: s.opponent_team,
        team1_plays: offensivePlays,
        team2_plays: opponentOffensivePlays,
        baseGamePlays: baseGamePlays
      });
    }
  }
  
  const games = Array.from(gameMap.values());
  console.log(`  Matched games: ${games.length}`);
  
  if (games.length === 0) {
    console.error('❌ No games matched! Check data format.');
    process.exit(1);
  }
  
  // 4. Compute statistics
  const baseGamePlaysValues = games.map(g => g.baseGamePlays);
  const baseGamePlaysMean = baseGamePlaysValues.reduce((a, b) => a + b, 0) / baseGamePlaysValues.length;
  const baseGamePlaysMedian = baseGamePlaysValues.sort((a, b) => a - b)[Math.floor(baseGamePlaysValues.length / 2)];
  const baseGamePlaysMin = Math.min(...baseGamePlaysValues);
  const baseGamePlaysMax = Math.max(...baseGamePlaysValues);
  
  console.log('\n📈 BaseGamePlays Distribution (Offensive Plays Sum):');
  console.log(`  Mean: ${baseGamePlaysMean.toFixed(2)}`);
  console.log(`  Median: ${baseGamePlaysMedian.toFixed(2)}`);
  console.log(`  Min: ${baseGamePlaysMin}`);
  console.log(`  Max: ${baseGamePlaysMax}`);
  console.log(`  Range: ${baseGamePlaysMin}-${baseGamePlaysMax}`);
  
  // 5. Derive precise scaling factor
  const SCALE_GAME_PLAYS = trainingPlaysMean / baseGamePlaysMean;
  
  console.log('\n🎯 DERIVED SCALING FACTOR:');
  console.log('  Formula: SCALE_GAME_PLAYS = trainingPlaysMean / baseGamePlaysMean');
  console.log(`  Calculation: ${trainingPlaysMean.toFixed(2)} / ${baseGamePlaysMean.toFixed(2)}`);
  console.log(`  SCALE_GAME_PLAYS = ${SCALE_GAME_PLAYS.toFixed(4)}`);
  
  // 6. Validate scaled distribution
  const scaledGamePlays = baseGamePlaysValues.map(b => b * SCALE_GAME_PLAYS);
  const scaledMean = scaledGamePlays.reduce((a, b) => a + b, 0) / scaledGamePlays.length;
  const scaledMedian = scaledGamePlays.sort((a, b) => a - b)[Math.floor(scaledGamePlays.length / 2)];
  
  console.log('\n✅ VALIDATION (After Scaling):');
  console.log(`  Scaled Mean: ${scaledMean.toFixed(2)} (target: ${trainingPlaysMean.toFixed(2)})`);
  console.log(`  Difference: ${Math.abs(scaledMean - trainingPlaysMean).toFixed(2)} plays`);
  console.log(`  Error: ${((Math.abs(scaledMean - trainingPlaysMean) / trainingPlaysMean) * 100).toFixed(2)}%`);
  
  // 7. Sample games comparison
  console.log('\n📋 SAMPLE GAMES (First 5):');
  console.log('  Week  Teams              Base    Scaled  Training-Target');
  console.log('  ' + '-'.repeat(65));
  
  for (let i = 0; i < Math.min(5, games.length); i++) {
    const g = games[i];
    const scaled = g.baseGamePlays * SCALE_GAME_PLAYS;
    console.log(`  ${g.week.padStart(4)}  ${g.team1}-${g.team2}  ${g.baseGamePlays.toString().padStart(6)}  ${scaled.toFixed(1).padStart(6)}  ${trainingPlaysMean.toFixed(1)}`);
  }
  
  // 8. Recommendation
  console.log('\n' + '='.repeat(70));
  console.log('📝 RECOMMENDATION FOR nfl-v5-live.mjs:\n');
  console.log('Update line ~118 to:');
  console.log(`const SCALE_GAME_PLAYS = ${SCALE_GAME_PLAYS.toFixed(4)};  // ${trainingPlaysMean.toFixed(2)} / ${baseGamePlaysMean.toFixed(2)}`);
  console.log('\nThis ensures gamePlaysEst matches training distribution exactly.');
  console.log('='.repeat(70) + '\n');
  
  // 9. Write constants file
  const constantsFile = {
    derived_at: new Date().toISOString(),
    training_data: {
      games_count: historical2025.length,
      plays_mean: trainingPlaysMean,
      epa_sum_mean: trainingEpaSumMean
    },
    stats_team_data: {
      games_count: games.length,
      base_game_plays_mean: baseGamePlaysMean,
      base_game_plays_median: baseGamePlaysMedian,
      base_game_plays_min: baseGamePlaysMin,
      base_game_plays_max: baseGamePlaysMax
    },
    scaling_factor: {
      SCALE_GAME_PLAYS: SCALE_GAME_PLAYS,
      formula: 'trainingPlaysMean / baseGamePlaysMean',
      validation_error_percent: ((Math.abs(scaledMean - trainingPlaysMean) / trainingPlaysMean) * 100)
    }
  };
  
  await fs.writeFile(
    './nfl-v5-epa-scaling-constants.json',
    JSON.stringify(constantsFile, null, 2)
  );
  
  console.log('✅ Constants saved to: nfl-v5-epa-scaling-constants.json\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
