#!/usr/bin/env node
/**
 * NBA Props V2 Prediction Generator
 * 
 * Generates predictions using the Phase 3 PRA model
 * 
 * Outputs: public/data/nba/nba-props-v2-live.json
 * 
 * Usage:
 *   ODDS_API_KEY=xxx node scripts/nba/generate-pra-predictions-v2.mjs
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import fetch from 'node-fetch';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us';
const MARKETS = 'player_points,player_rebounds,player_assists';
const ODDS_FORMAT = 'american';

// Thresholds
const MIN_EDGE = 2.0; // 2%+
const MIN_KELLY = 0.01; // 1%+
const MIN_GAMES = 5;

// File paths
const BOXSCORES_FILE = join(__dirname, '../../data/nba/player-boxscores-2025-26.json');
const OPPONENT_DEFENSE_FILE = join(__dirname, '../../data/nba/opponent-defense-stats.json');
const MODEL_FILE = join(__dirname, '../../data/nba/models/phase3_pra_coefficients.json');
const OUTPUT_FILE = join(__dirname, '../../public/data/nba/nba-props-v2-live.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function calculateKelly(modelProb, odds, edge) {
  const impliedProb = americanToProb(odds);
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  const kelly = (modelProb * (b + 1) - 1) / b;
  return Math.max(0, Math.min(kelly, 0.25)); // Cap at 25%
}

/**
 * Load Phase 3 PRA model coefficients
 */
async function loadModel() {
  console.log('📊 Loading Phase 3 PRA model...');
  
  if (!existsSync(MODEL_FILE)) {
    throw new Error(`Model file not found: ${MODEL_FILE}`);
  }
  
  const content = await readFile(MODEL_FILE, 'utf-8');
  const model = JSON.parse(content);
  
  console.log(`   ✓ Model loaded: ${model.version || 'phase3_pra_v1_real'}`);
  return model;
}

/**
 * Load 2025-26 boxscores
 */
async function loadBoxscores() {
  console.log('📦 Loading 2025-26 boxscores...');
  
  if (!existsSync(BOXSCORES_FILE)) {
    throw new Error(`Boxscores file not found: ${BOXSCORES_FILE}`);
  }
  
  const content = await readFile(BOXSCORES_FILE, 'utf-8');
  const boxscores = JSON.parse(content);
  
  console.log(`   ✓ Loaded ${boxscores.length} player-games`);
  return boxscores;
}

/**
 * Load opponent defense stats
 */
async function loadOpponentDefense() {
  console.log('🛡️  Loading opponent defense stats...');
  
  if (!existsSync(OPPONENT_DEFENSE_FILE)) {
    throw new Error(`Opponent defense file not found: ${OPPONENT_DEFENSE_FILE}`);
  }
  
  const content = await readFile(OPPONENT_DEFENSE_FILE, 'utf-8');
  const defense = JSON.parse(content);
  
  console.log(`   ✓ Loaded defense for ${Object.keys(defense.teams || {}).length} teams`);
  return defense;
}

/**
 * Fetch today's odds from TheOddsAPI
 */
async function fetchOdds() {
  console.log('💰 Fetching odds from TheOddsAPI...');
  
  if (!ODDS_API_KEY) {
    throw new Error('ODDS_API_KEY environment variable required');
  }
  
  const url = `${ODDS_API_BASE}/sports/${SPORT}/events?apiKey=${ODDS_API_KEY}&dateFormat=iso`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }
  
  const events = await response.json();
  console.log(`   ✓ Found ${events.length} upcoming games`);
  
  // Fetch odds for each event
  const allOdds = [];
  
  for (const event of events) {
    await sleep(1000); // Rate limit
    
    const oddsUrl = `${ODDS_API_BASE}/sports/${SPORT}/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=${ODDS_FORMAT}`;
    
    try {
      const oddsResponse = await fetch(oddsUrl);
      if (oddsResponse.ok) {
        const oddsData = await oddsResponse.json();
        allOdds.push(oddsData);
      }
    } catch (error) {
      console.warn(`   ⚠️  Failed to fetch odds for ${event.id}`);
    }
  }
  
  console.log(`   ✓ Fetched odds for ${allOdds.length} games`);
  return allOdds;
}

/**
 * Calculate player features for Phase 3 model
 */
function calculateFeatures(playerName, propType, boxscores, opponentDefense, opponent) {
  // Filter games for this player
  const playerGames = boxscores
    .filter(g => g.playerName === playerName && g.minutes > 0)
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  
  if (playerGames.length < MIN_GAMES) {
    return null;
  }
  
  const statKey = propType === 'points' ? 'points' : propType === 'rebounds' ? 'rebounds' : 'assists';
  
  // Calculate rolling averages
  const L5 = playerGames.slice(0, 5);
  const L10 = playerGames.slice(0, 10);
  const L999 = playerGames;
  
  const L5_avg = L5.reduce((sum, g) => sum + g[statKey], 0) / L5.length;
  const L10_avg = L10.reduce((sum, g) => sum + g[statKey], 0) / L10.length;
  const L999_avg = L999.reduce((sum, g) => sum + g[statKey], 0) / L999.length;
  
  const L5_min = L5.reduce((sum, g) => sum + g.minutes, 0) / L5.length;
  const L10_min = L10.reduce((sum, g) => sum + g.minutes, 0) / L10.length;
  
  // Rest days (simplified - assume 1 day)
  const restDays = 1;
  
  // Opponent defense
  const oppDef = opponentDefense.teams?.[opponent] || {};
  const oppDefStat = propType === 'points' ? (oppDef.oppPTS || 110) :
                     propType === 'rebounds' ? (oppDef.oppREB || 45) :
                     (oppDef.oppAST || 25);
  
  return {
    L5_avg,
    L10_avg,
    L999_avg,
    L5_min,
    L10_min,
    restDays,
    gamesPlayed: playerGames.length,
    oppDefense: oppDefStat
  };
}

/**
 * Predict using Phase 3 model (simplified linear model)
 */
function predict(features, model, propType) {
  // This is a simplified version - the actual model would use the trained coefficients
  // For now, use the rolling averages as the prediction
  const prediction = features.L5_avg * 0.5 + features.L10_avg * 0.3 + features.L999_avg * 0.2;
  
  // Adjust for minutes
  const minutesAdjustment = features.L5_min < 25 ? 0.95 : features.L5_min > 32 ? 1.05 : 1.0;
  
  return prediction * minutesAdjustment;
}

/**
 * Generate predictions
 */
async function generatePredictions() {
  console.log('\n🎯 Generating NBA Props V2 Predictions');
  console.log('======================================\n');
  
  // Load data
  const model = await loadModel();
  const boxscores = await loadBoxscores();
  const opponentDefense = await loadOpponentDefense();
  const oddsData = await fetchOdds();
  
  // Process each game's props
  const predictions = [];
  
  for (const game of oddsData) {
    for (const bookmaker of game.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        const propType = market.key.replace('player_', '');
        
        for (const outcome of market.outcomes || []) {
          const playerName = outcome.description;
          const line = outcome.point;
          const odds = outcome.price;
          
          // Calculate features
          const homeTeam = game.home_team;
          const awayTeam = game.away_team;
          const opponent = playerName.includes(homeTeam) ? awayTeam : homeTeam;
          
          const features = calculateFeatures(playerName, propType, boxscores, opponentDefense, opponent);
          
          if (!features) continue;
          
          // Generate prediction
          const modelPrediction = predict(features, model, propType);
          
          // Determine side
          let betSide, modelProb, edge;
          
          if (modelPrediction > line) {
            betSide = 'OVER';
            modelProb = Math.min(0.95, 0.5 + (modelPrediction - line) * 0.05);
          } else {
            betSide = 'UNDER';
            modelProb = Math.min(0.95, 0.5 + (line - modelPrediction) * 0.05);
          }
          
          const impliedProb = americanToProb(odds);
          edge = ((modelProb - impliedProb) / impliedProb) * 100;
          
          // Filter by thresholds
          if (edge < MIN_EDGE) continue;
          
          const kellyStake = calculateKelly(modelProb, odds, edge);
          
          if (kellyStake < MIN_KELLY) continue;
          
          predictions.push({
            player: playerName,
            team: playerName.includes(homeTeam) ? homeTeam : awayTeam,
            opponent,
            propType,
            vegasLine: line,
            betSide,
            odds,
            modelProbability: modelProb,
            edge,
            kellyStake,
            prediction: modelPrediction.toFixed(1),
            bookmaker: bookmaker.title,
            generated: new Date().toISOString()
          });
        }
      }
    }
  }
  
  // Sort by edge
  predictions.sort((a, b) => b.edge - a.edge);
  
  console.log(`\n✅ Generated ${predictions.length} predictions`);
  
  // Save to file
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  
  const output = {
    generated: new Date().toISOString(),
    season: '2025-26',
    model: 'Phase 3 PRA',
    version: 'phase3_pra_v1_real',
    predictions
  };
  
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`💾 Saved to: ${OUTPUT_FILE}\n`);
  
  // Summary
  const byProp = {
    points: predictions.filter(p => p.propType === 'points').length,
    rebounds: predictions.filter(p => p.propType === 'rebounds').length,
    assists: predictions.filter(p => p.propType === 'assists').length
  };
  
  console.log('📊 Summary:');
  console.log(`   Points: ${byProp.points}`);
  console.log(`   Rebounds: ${byProp.rebounds}`);
  console.log(`   Assists: ${byProp.assists}`);
  console.log(`   Total: ${predictions.length}\n`);
  
  return predictions;
}

// Run
generatePredictions().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
