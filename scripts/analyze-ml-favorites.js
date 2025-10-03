#!/usr/bin/env node

import fs from 'fs/promises';

const csv = await fs.readFile('backtest-results/nfl-2024-unified-predictions.csv', 'utf-8');
const lines = csv.split('\n').slice(1).filter(l => l.trim());

let mlBets = 0;
let mlWins = 0;
let mlLosses = 0;

// Track favorites vs underdogs
let favoritePicks = 0;
let underdogPicks = 0;
let favoritesWon = 0;
let underdogsWon = 0;
let pickEmPicks = 0;
let pickEmWon = 0;

const upsets = [];

for (const line of lines) {
  const parts = line.split(',');
  const week = parts[0];
  const homeTeam = parts[1];
  const awayTeam = parts[2];
  const predictedWinner = parts[3];
  const actualWinner = parts[6];
  const mlBet = parts[11] === 'true';
  const mlCorrect = parts[12] === 'true';
  const spread = parseFloat(parts[13]);
  
  if (!mlBet) continue;
  
  mlBets++;
  
  if (mlCorrect) {
    mlWins++;
  } else {
    mlLosses++;
  }
  
  // Determine if our pick was the favorite or underdog
  // Spread is from home perspective (negative = home favored)
  if (Math.abs(spread) < 1) {
    // Pick'em game
    pickEmPicks++;
    if (mlCorrect) pickEmWon++;
  } else {
    const homeIsFavorite = spread < -1;
    const awayIsFavorite = spread > 1;
    
    let wePickedFavorite = false;
    
    if (homeIsFavorite && predictedWinner === homeTeam) {
      wePickedFavorite = true;
    } else if (awayIsFavorite && predictedWinner === awayTeam) {
      wePickedFavorite = true;
    }
    
    if (wePickedFavorite) {
      favoritePicks++;
      if (mlCorrect) favoritesWon++;
    } else {
      underdogPicks++;
      if (mlCorrect) {
        underdogsWon++;
        upsets.push({
          week,
          game: `${homeTeam} vs ${awayTeam}`,
          pick: predictedWinner,
          spread: spread.toFixed(1),
          result: 'WON'
        });
      }
    }
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ML BETTING BREAKDOWN - FAVORITE vs UNDERDOG ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('📊 OVERALL ML PERFORMANCE:');
console.log(`   Total ML Bets: ${mlBets}`);
console.log(`   Wins: ${mlWins} (${(mlWins/mlBets*100).toFixed(1)}%)`);
console.log(`   Losses: ${mlLosses}\n`);

console.log('🎯 BETTING DISTRIBUTION:\n');

console.log(`   Favorite Picks: ${favoritePicks} (${(favoritePicks/mlBets*100).toFixed(1)}% of bets)`);
console.log(`   └─ Won: ${favoritesWon}/${favoritePicks} (${(favoritesWon/favoritePicks*100).toFixed(1)}%)\n`);

console.log(`   Underdog Picks: ${underdogPicks} (${(underdogPicks/mlBets*100).toFixed(1)}% of bets)`);
console.log(`   └─ Won: ${underdogsWon}/${underdogPicks} (${(underdogsWon/underdogPicks*100).toFixed(1)}%) 🔥\n`);

if (pickEmPicks > 0) {
  console.log(`   Pick'em Games: ${pickEmPicks} (${(pickEmPicks/mlBets*100).toFixed(1)}% of bets)`);
  console.log(`   └─ Won: ${pickEmWon}/${pickEmPicks} (${(pickEmWon/pickEmPicks*100).toFixed(1)}%)\n`);
}

console.log('💥 UPSET ANALYSIS:');
console.log(`   Total Upsets (Underdog Wins): ${underdogsWon}`);
console.log(`   Upset Rate: ${(underdogsWon/mlWins*100).toFixed(1)}% of all wins were upsets`);
console.log(`   Value: Underdogs pay better odds!\n`);

if (upsets.length > 0) {
  console.log('🏆 OUR UPSET VICTORIES:\n');
  upsets.forEach(u => {
    console.log(`   Week ${u.week}: ${u.game} - Picked ${u.pick} (spread: ${u.spread})`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

console.log('⚠️  CRITICAL ISSUE:');
console.log('   Current calculation assumes +100 odds (even money) for ALL bets.');
console.log('   Reality:');
console.log(`   - Favorites might be -150, -300, or even -900 (risk more to win less)`);
console.log(`   - Underdogs might be +150, +300, or higher (risk less to win more)`);
console.log('');
console.log('   The +47U profit is likely OVERSTATED if we picked many heavy favorites.');
console.log('   The +47U profit could be UNDERSTATED if we picked underdogs that won!');
console.log('\n═══════════════════════════════════════════════════════════════\n');
