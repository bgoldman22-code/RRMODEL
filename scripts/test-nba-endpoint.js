#!/usr/bin/env node

/**
 * Test NBA Predictions Endpoint Locally
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the predict function
const predictPath = path.join(__dirname, '../netlify/functions/_lib/nba/predict-elite.mjs');
const { predictGame, calculateAdvancedStats } = await import(predictPath);

// Load historical games
const dataPath = path.join(__dirname, '../data/nba/games/games_2024_25.json');
const games = JSON.parse(await fs.readFile(dataPath, 'utf8'));

console.log(`Loaded ${games.length} historical games\n`);

// Get recent games for Lakers and Suns (tonight's game)
const lakersGames = games.filter(g => 
  g.homeTeamId === '13' || g.awayTeamId === '13' ||
  g.homeTeam === 'LAL' || g.awayTeam === 'LAL'
).slice(-10);

const sunsGames = games.filter(g => 
  g.homeTeamId === '21' || g.awayTeamId === '21' ||
  g.homeTeam === 'PHX' || g.awayTeam === 'PHX'
).slice(-10);

console.log(`Lakers recent games: ${lakersGames.length}`);
console.log(`Suns recent games: ${sunsGames.length}\n`);

// Calculate L10 stats
const lakersStats = calculateAdvancedStats(lakersGames, '13', 10);
const sunsStats = calculateAdvancedStats(sunsGames, '21', 10);

console.log('Lakers L10 Stats:', lakersStats);
console.log('Suns L10 Stats:', sunsStats, '\n');

// Make prediction
const prediction = await predictGame(
  '21', // Suns (home)
  '13', // Lakers (away)
  sunsGames,
  lakersGames
);

console.log('=== PREDICTION: LAL @ PHX ===');
console.log(JSON.stringify(prediction, null, 2));
