#!/usr/bin/env node

import fs from 'fs/promises';

async function findMissingGames() {
  // Read original (272 games)
  const orig = await fs.readFile('backtest-results/nfl-2024-time-constrained-predictions.csv', 'utf-8');
  const origLines = orig.split('\n').slice(1).filter(l => l.trim());

  // Read enhanced (267 games)  
  const enh = await fs.readFile('backtest-results/nfl-2024-enhanced-predictions.csv', 'utf-8');
  const enhLines = enh.split('\n').slice(1).filter(l => l.trim());

  console.log('Original games:', origLines.length);
  console.log('Enhanced games:', enhLines.length);
  console.log('');

  // Create matchup sets
  const origMatchups = new Set();
  const enhMatchups = new Set();

  origLines.forEach(line => {
    const parts = line.split(',');
    const week = parts[0];
    const home = parts[1];
    const away = parts[2];
    origMatchups.add(`${week}:${home} vs ${away}`);
  });

  enhLines.forEach(line => {
    const parts = line.split(',');
    const week = parts[0];
    const fav = parts[1];
    const dog = parts[2];
    // Try both orders since fav/dog != home/away
    enhMatchups.add(`${week}:${fav} vs ${dog}`);
    enhMatchups.add(`${week}:${dog} vs ${fav}`);
  });

  // Find missing games
  console.log('MISSING GAMES FROM ENHANCED BACKTEST:');
  console.log('');
  
  const missing = [];
  origMatchups.forEach(matchup => {
    if (!enhMatchups.has(matchup)) {
      missing.push(matchup);
    }
  });

  missing.forEach(m => console.log(m));
  console.log('');
  console.log(`Total missing: ${missing.length}`);
}

findMissingGames();
